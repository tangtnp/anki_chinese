"""Hanzi Flow companion. Network runs off the UI thread; Anki work runs on main.
Anki's scheduler is authoritative. Reviews carry an optimistic concurrency token.
"""
import json, time, urllib.request, urllib.error, re, hashlib, html, traceback
from aqt import mw, gui_hooks
from aqt.qt import QAction, QDialog, QVBoxLayout, QFormLayout, QLineEdit, QDialogButtonBox, QCheckBox, QLabel, QTimer, QMenu
from aqt.utils import showInfo, showWarning, tooltip
from .protocol import decision, fingerprint

MODULE = __name__
_busy = False
_timer = None

def config():
    return mw.addonManager.getConfig(MODULE) or {}

def request(cfg, path, body=None, method=None, token=None, prefer=None):
    headers={'apikey':cfg['key'],'Content-Type':'application/json'}
    if token: headers['Authorization']='Bearer '+token
    if prefer: headers['Prefer']=prefer
    req=urllib.request.Request(cfg['url'].rstrip('/')+path, data=json.dumps(body).encode() if body is not None else None, headers=headers, method=method or ('POST' if body is not None else 'GET'))
    try:
        with urllib.request.urlopen(req,timeout=40) as res:
            data=res.read()
            return json.loads(data) if data else None
    except urllib.error.HTTPError as exc:
        detail=exc.read().decode(errors='replace')
        try:
            d=json.loads(detail); detail=d.get('msg') or d.get('message') or d.get('error_description') or 'Request failed'
        except Exception: detail='Request failed'
        raise RuntimeError('Cloud request failed (%s): %s' % (exc.code,detail)) from None

def connect():
    cfg=config(); dialog=QDialog(mw);dialog.setWindowTitle('Connect Hanzi Flow');layout=QVBoxLayout(dialog)
    label=QLabel('Use the same Supabase project and account as your phone.\nOnly selected decks will sync. Use * to include every deck.');layout.addWidget(label)
    form=QFormLayout();inputs={}
    for key,title in [('url','Supabase project URL'),('key','Public publishable / anon key'),('email','Email'),('password','Password (not saved)'),('deck_query','Anki search query')]:
        field=QLineEdit(str(cfg.get(key,'')))
        if key=='password': field.setEchoMode(QLineEdit.EchoMode.Password)
        form.addRow(title,field);inputs[key]=field
    layout.addLayout(form);auto=QCheckBox('Automatically sync every 60 seconds when not reviewing');auto.setChecked(cfg.get('auto_sync',True));layout.addWidget(auto)
    buttons=QDialogButtonBox(QDialogButtonBox.StandardButton.Ok|QDialogButtonBox.StandardButton.Cancel);buttons.accepted.connect(dialog.accept);buttons.rejected.connect(dialog.reject);layout.addWidget(buttons)
    if not dialog.exec(): return
    values={k:v.text().strip() for k,v in inputs.items()}
    if not values['url'].startswith('https://') or not values['key'] or not values['email'] or not values['password']:
        showWarning('Enter the HTTPS project URL, public key, email, and password.');return
    password=values.pop('password');values['auto_sync']=auto.isChecked()
    def work(): return request(values,'/auth/v1/token?grant_type=password',{'email':values['email'],'password':password})
    def done(fut):
        try:
            session=fut.result();values['refresh_token']=session['refresh_token'];values['user_id']=session['user']['id'];mw.addonManager.writeConfig(MODULE,values);showInfo('Connected. Import your original HSK decks, then use Tools → Hanzi Flow → Sync now.');sync_now()
        except Exception as e: showWarning(str(e))
    mw.taskman.run_in_background(work,done,uses_collection=False)

def fetch(cfg):
    session=request(cfg,'/auth/v1/token?grant_type=refresh_token',{'refresh_token':cfg['refresh_token']})
    token=session['access_token'];user=session['user']['id']
    reviews=[];cards=[]
    for table,target,filter_ in [('reviews',reviews,'&status=eq.pending&order=reviewed_at.asc,id.asc'),('cards',cards,'&order=id.asc')]:
        offset=0
        while True:
            rows=request(cfg,'/rest/v1/'+table+'?select=*&user_id=eq.'+user+filter_+'&limit=1000&offset='+str(offset),token=token)
            target.extend(rows)
            if len(rows)<1000: break
            offset+=1000
    return session,reviews,cards

def plain(s): return html.unescape(re.sub('<[^>]+>','',s)).strip()

def snapshot(card):
    note=card.note();fields=dict(note.items());deck=mw.col.decks.name(card.did)
    raw_front=fields.get('Hanzi',fields.get('Front',note.fields[0] if note.fields else ''))
    front=plain(raw_front)
    back=fields.get('Meaning',fields.get('Back',note.fields[1] if len(note.fields)>1 else ''))
    if card.ord>0 and not fields.get('Hanzi'):
        front,back=plain(back),raw_front
    if card.queue==0: due=0
    elif card.queue in (1,4): due=card.due*1000
    else: due=int((time.time()+(card.due-mw.col.sched.today)*86400)*1000)
    kind='sentence' if 'hanzi_flow_sentence' in note.tags else 'word'
    prefix='hanzi_flow_sentence_for:'
    sentence_for=next((tag[len(prefix):] for tag in note.tags if tag.startswith(prefix)),None)
    related_word=''
    if sentence_for:
        parent_guid=sentence_for.rsplit(':',1)[0]
        parent_fields=mw.col.db.scalar('select flds from notes where guid=?',parent_guid)
        if parent_fields: related_word=plain(parent_fields.split('\x1f')[0])
    # Only built-in HSK audio paths are available on the website; other notes use TTS.
    audio=re.search(r'src="(hskstory-[^"/]+\.mp3)"',fields.get('Audio',''))
    return {'id':note.guid+':'+str(card.ord),'kind':kind,'sentenceFor':sentence_for,'relatedWord':related_word,'guid':note.guid,'ordinal':card.ord,'deck':deck,'front':front,'back':back,'pinyin':plain(fields.get('TonePinyin',fields.get('Pinyin',''))),'example':plain(fields.get('ExampleHanzi','')),'translation':plain(fields.get('ExampleEnglish','')),'audio':'/media/'+audio[1] if audio else '', 'source':'anki','reps':card.reps,'interval':card.ivl,'due':due,'suspended':card.queue<0,'fingerprint':fingerprint(card),'reset_at':mw.col.get_config('hanzi_flow_reset_at',None)}

def apply_and_snapshot(result):
    session,reviews,cloud_cards=result;col=mw.col;cfg=config();uid=session['user']['id']
    # A per-account ledger in the Anki collection survives network retries and restarts.
    ledger_key='hanzi_flow_ledger_'+uid
    ledger=col.get_config(ledger_key,{})
    query=cfg.get('deck_query') or 'deck:HSK* OR deck:"My Chinese"'
    ids=col.find_cards('' if query=='*' else query)
    selected={};
    for cid in ids:
        card=col.get_card(cid);selected[card.note().guid+':'+str(card.ord)]=cid
    # Cloud-created Basic cards, keyed by their GUID, are imported idempotently.
    for row in cloud_cards:
        data=row['data'];key=data['id']
        if key in selected: continue
        guid=key.rsplit(':',1)[0]
        found=col.db.scalar('select id from notes where guid=?',guid)
        if found:
            # Existing notes outside the user's selected deck query must stay excluded.
            continue
        if data.get('source')!='web': continue
        model=col.models.by_name('Hanzi Flow')
        if model is None:
            model=col.models.new('Hanzi Flow');col.models.add_field(model,col.models.new_field('Front'));col.models.add_field(model,col.models.new_field('Back'));col.models.add_field(model,col.models.new_field('Pinyin'))
            template=col.models.new_template('Recognition');template['qfmt']='{{Front}}';template['afmt']='{{FrontSide}}<hr id="answer">{{Pinyin}}<br>{{Back}}';col.models.add_template(model,template);col.models.add(model)
        note=col.new_note(model);note.guid=guid;note['Front']=data['front'];note['Back']=data['back'];note['Pinyin']=data.get('pinyin','')
        if data.get('kind')=='sentence':
            note.tags.append('hanzi_flow_sentence')
            if data.get('sentenceFor'): note.tags.append('hanzi_flow_sentence_for:'+data['sentenceFor'])
        # Older offline clients may still submit a generated sentence subdeck.
        target_deck=data['deck']
        if data.get('kind')=='sentence' and target_deck.endswith('::Sentences'):
            target_deck=target_deck.rsplit('::',1)[0]
        col.add_note(note,col.decks.id(target_deck))
        for c in note.cards(): selected[note.guid+':'+str(c.ord)]=c.id
    acknowledgements=[]
    for event in reviews:
        eid=event['id'];record=ledger.get(eid)
        cutoff=col.get_config('hanzi_flow_reset_at',None)
        if cutoff and event.get('reviewed_at','')<=cutoff:
            acknowledgements.append({'id':eid,'status':'conflict','message':'This review predates your progress reset and was not replayed.'});continue
        if record and record['status'] in ('applied','conflict'):
            acknowledgements.append({'id':eid,**record});continue
        cid=selected.get(event['card_id'])
        if cid is None:
            # Deck may not have been imported or selected yet; leave it pending.
            continue
        card=col.get_card(cid)
        status,message=decision(event,card,record)
        if status=='pending': continue
        if status=='apply':
            # Persist intent first. An interrupted intent is never blindly replayed.
            ledger[eid]={'status':'started'};col.set_config(ledger_key,ledger)
            try:
                card.start_timer();states=col._backend.get_scheduling_states(card.id)
                answer=col.sched.build_answer(card=card,states=states,rating=event['rating']-1)
                answer.milliseconds_taken=event.get('elapsed_ms',0)
                # Apply at current sync time: avoid falsifying a historical scheduler state.
                col.sched.answer_card(answer)
                status,message='applied',None
            except Exception:
                # Some scheduler calls can commit before raising. Reconcile conservatively.
                status,message='conflict','Anki could not safely apply this review. Check Anki review history before repeating it.'
        ledger[eid]={'status':status,'message':message};col.set_config(ledger_key,ledger)
        acknowledgements.append({'id':eid,**ledger[eid]})
    snapshots=[snapshot(col.get_card(cid)) for cid in selected.values()]
    return session,acknowledgements,snapshots

def upload(cfg,result):
    session,acks,cards=result;token=session['access_token'];user=session['user']['id']
    # Upload Anki state before acknowledging reviews so the phone can fetch final due dates.
    for start in range(0,len(cards),100):
        request(cfg,'/rest/v1/cards?on_conflict=user_id,id',[{'user_id':user,'id':c['id'],'data':c,'updated_at':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime())} for c in cards[start:start+100]],token=token,prefer='resolution=merge-duplicates,return=minimal')
    for ack in acks:
        request(cfg,'/rest/v1/reviews?user_id=eq.'+user+'&id=eq.'+ack['id'],{'status':ack['status'],'message':ack.get('message')},method='PATCH',token=token,prefer='return=minimal')
    return len(cards),len(acks)

def sync_now(manual=True):
    global _busy
    if _busy or not mw.col: return
    if mw.state=='review':
        if manual: showInfo('Finish or leave the current review session before syncing.');
        return
    cfg=config()
    if not cfg.get('refresh_token'):
        if manual: connect()
        return
    _busy=True
    def finish(future):
        global _busy
        _busy=False
        try:
            count,acks=future.result()
            if mw.col: mw.reset()
            if manual: tooltip('Hanzi Flow: %s cards synced, %s phone reviews processed.'%(count,acks))
        except Exception as e:
            if manual: showWarning('Hanzi Flow: '+str(e))
            else: print('Hanzi Flow sync failed:',type(e).__name__)
    def fetched(future):
        global _busy
        try:
            result=future.result()
            # Save rotated refresh tokens before processing collection changes.
            latest=config();latest['refresh_token']=result[0]['refresh_token'];mw.addonManager.writeConfig(MODULE,latest)
            if not mw.col or mw.state=='review': _busy=False;return
            payload=apply_and_snapshot(result)
            mw.taskman.run_in_background(lambda:upload(cfg,payload),finish,uses_collection=False)
        except Exception as e:
            _busy=False
            if manual: showWarning('Hanzi Flow: '+str(e))
    mw.taskman.run_in_background(lambda:fetch(cfg),fetched,uses_collection=False)

def ready():
    global _timer
    if _timer: _timer.stop()
    _timer=QTimer(mw);_timer.setInterval(60000);_timer.timeout.connect(lambda:sync_now(False) if config().get('auto_sync',True) else None);_timer.start()

def closed():
    if _timer: _timer.stop()

menu=QMenu('Hanzi Flow',mw);mw.form.menuTools.addMenu(menu)
for title,callback in [('Connect…',connect),('Sync now',lambda:sync_now(True))]:
    action=QAction(title,mw);action.triggered.connect(callback);menu.addAction(action)
gui_hooks.profile_did_open.append(ready)
gui_hooks.profile_will_close.append(closed)
