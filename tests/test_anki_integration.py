"""Optional real-Anki tests: pip install anki, then run unittest discovery.
Creates disposable collections; never opens the user's Anki profile.
"""
import importlib.util,tempfile,unittest
from pathlib import Path
from types import SimpleNamespace
try:
 from anki.collection import Collection
except ImportError:
 Collection=None

@unittest.skipIf(Collection is None,'Install anki to run real scheduler integration tests')
class RealAnki(unittest.TestCase):
 def setUp(self):
  spec=importlib.util.spec_from_file_location('protocol', 'anki-addon/protocol.py')
  self.protocol=importlib.util.module_from_spec(spec);spec.loader.exec_module(self.protocol)
  self.temp=tempfile.TemporaryDirectory();self.col=Collection(str(Path(self.temp.name)/'collection.anki2'))
  mw=SimpleNamespace(col=self.col,addonManager=SimpleNamespace(getConfig=lambda _: {'deck_query':'*'}))
  source=Path('anki-addon/__init__.py').read_text().split("menu=QMenu(")[0]
  source='\n'.join(line for line in source.splitlines() if not line.startswith(('from aqt','from .protocol')))
  self.ns={'mw':mw,'__name__':'hanzi_test','decision':self.protocol.decision,'fingerprint':self.protocol.fingerprint};exec(source,self.ns)
  self.session={'user':{'id':'test-user'}}
 def tearDown(self): self.col.close();self.temp.cleanup()
 def note(self,guid='test-note'):
  note=self.col.new_note(self.col.models.by_name('Basic'));note.guid=guid;note['Front']='你好';note['Back']='hello';self.col.add_note(note,self.col.decks.id('HSK 1'));return note.cards()[0]
 def apply(self,events=[],cards=[]): return self.ns['apply_and_snapshot']((self.session,events,cards))
 def test_all_four_rating_buttons_use_correct_anki_enum(self):
  for rating in range(1,5):
   card=self.note('rating-'+str(rating));event={'id':'event-'+str(rating),'card_id':card.note().guid+':0','expected_reps':0,'rating':rating,'elapsed_ms':1000}
   result=self.apply([event]);self.assertEqual(result[1][0]['status'],'applied')
   self.assertEqual(self.col.db.scalar('select ease from revlog where cid=? order by id desc limit 1',card.id),rating)
 def test_retries_multiple_reviews_and_conflicts(self):
  card=self.note();event={'id':'event-1','card_id':'test-note:0','expected_reps':0,'rating':3,'elapsed_ms':1000,'expected_fingerprint':self.protocol.fingerprint(card)}
  self.assertEqual(self.apply([event])[1][0]['status'],'applied');self.assertEqual(self.apply([event])[1][0]['status'],'applied')
  self.assertEqual(self.col.get_card(card.id).reps,1)
  event2={**event,'id':'event-2','expected_reps':1,'expected_fingerprint':None,'rating':4}
  self.assertEqual(self.apply([event2])[1][0]['status'],'applied');self.assertEqual(self.col.get_card(card.id).reps,2)
  self.assertEqual(self.apply([{**event,'id':'conflict'}])[1][0]['status'],'conflict');self.assertEqual(self.col.get_card(card.id).reps,2)
 def test_web_note_import_is_idempotent(self):
  data={'id':'web-note:0','front':'谢谢','back':'thank you','deck':'My Chinese','pinyin':'xiè xie','source':'web'}
  rows=[{'id':data['id'],'data':data}]
  self.apply(cards=rows);result=self.apply(cards=rows)
  self.assertEqual(len(result[2]),1);self.assertEqual(result[2][0]['front'],'谢谢')
if __name__=='__main__':unittest.main()
