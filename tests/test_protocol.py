import importlib.util,unittest
from types import SimpleNamespace
spec=importlib.util.spec_from_file_location('protocol','anki-addon/protocol.py');p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)
class SyncProtocol(unittest.TestCase):
 def setUp(self):
  self.card=SimpleNamespace(id=12,reps=4,mod=9,due=200,ivl=5,queue=2,type=2,lapses=0)
  self.event={'expected_reps':4,'expected_fingerprint':p.fingerprint(self.card)}
 def test_matching_review_applies(self): self.assertEqual(p.decision(self.event,self.card)[0],'apply')
 def test_mac_review_conflict(self):
  self.card.reps=5;self.assertEqual(p.decision(self.event,self.card)[0],'conflict')
 def test_schedule_edit_conflict(self):
  self.card.due+=1;self.assertEqual(p.decision(self.event,self.card)[0],'conflict')
 def test_suspended_conflict(self):
  self.card.queue=-1;self.assertEqual(p.decision(self.event,self.card)[0],'conflict')
 def test_interrupted_never_replays(self): self.assertEqual(p.decision(self.event,self.card,{'status':'started'})[0],'conflict')
 def test_second_offline_review_uses_reps(self):
  self.card.reps=5;self.assertEqual(p.decision({'expected_reps':5},self.card)[0],'apply')
if __name__=='__main__': unittest.main()
