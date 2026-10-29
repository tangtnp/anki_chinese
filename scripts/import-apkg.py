"""Convert the local HSK packages into a static study library; preserves note GUIDs."""
import glob, zipfile, tempfile, sqlite3, json, re, html, pathlib
out=pathlib.Path('public'); (out/'media').mkdir(exist_ok=True)
cards=[]
def plain(s): return html.unescape(re.sub('<[^>]+>', '', s)).strip()
for path in sorted(glob.glob('*.apkg')):
    z=zipfile.ZipFile(path)
    name='collection.anki21' if 'collection.anki21' in z.namelist() else 'collection.anki2'
    with tempfile.NamedTemporaryFile() as f:
        f.write(z.read(name));f.flush();db=sqlite3.connect(f.name)
        decks=json.loads(db.execute('select decks from col').fetchone()[0])
        models=json.loads(db.execute('select models from col').fetchone()[0])
        for guid,mid,flds,ordinal,did in db.execute('select n.guid,n.mid,n.flds,c.ord,c.did from notes n join cards c on c.nid=n.id'):
            fields=dict(zip([v['name'] for v in models[str(mid)]['flds']], flds.split('\x1f')))
            if not fields.get('Hanzi'): continue
            audio=re.search(r'src="([^"]+\.mp3)"',fields.get('Audio',''))
            level=re.search(r'HSK_([1-4])_',path)
            cards.append(dict(id=guid+':'+str(ordinal),guid=guid,ordinal=ordinal,deck='HSK '+level[1] if level else decks[str(did)]['name'],front=plain(fields['Hanzi']),back=plain(fields.get('Meaning','')),pinyin=plain(fields.get('TonePinyin','')),example=plain(fields.get('ExampleHanzi','')),translation=plain(fields.get('ExampleEnglish','')),audio='/media/'+audio[1] if audio else '',reps=0,due=0,interval=0,source='library'))
        media=json.loads(z.read('media'))
        for key,name in media.items():
            if name.endswith('.mp3') and pathlib.Path(name).name==name: (out/'media'/name).write_bytes(z.read(key))
(out/'library.json').write_text(json.dumps(cards,ensure_ascii=False))
print(f'Imported {len(cards)} cards with audio')
