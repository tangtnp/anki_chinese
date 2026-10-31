import {test} from 'node:test';
import assert from 'node:assert/strict';
import {sentenceLibrary,materializeSentences} from '../src/sentences.ts';
import {estimate} from '../src/schedule.ts';
const word={id:'word:0',deck:'HSK 1',front:'学习',back:'to study',example:'我每天学习中文。',translation:'I study Chinese every day.',pinyin:'xué xí',reps:8,due:123,interval:4,source:'anki'};
test('sentence library includes examples and standalone sentences without pinyin',()=>{
 const standalone={...word,id:'own:0',kind:'sentence',front:'今天很冷。',back:'It is cold today.'};
 const entries=sentenceLibrary([word,standalone,{...word,id:'empty:0',example:' '}]);
 assert.equal(entries.length,2);assert.equal(entries.find(e=>e.id===word.id).front,word.example);assert.equal(entries.find(e=>e.id===word.id).back,word.translation);assert.ok(entries.every(e=>!('pinyin' in e)));
});
test('sentence practice creates independent cards once and leaves word scheduling intact',()=>{
 const entries=sentenceLibrary([word]);const created=materializeSentences(entries,[word],()=> 'new-sentence:0','2026-10-29T10:00:00Z');
 assert.equal(created.length,2);const sentence=created[1];assert.equal(sentence.kind,'sentence');assert.equal(sentence.sentenceFor,word.id);assert.equal(sentence.source,'web');assert.equal(sentence.reps,0);assert.equal(sentence.deck,'HSK 1');assert.equal(sentence.reset_at,'2026-10-29T10:00:00Z');assert.equal(sentence.pinyin,undefined);
 const reviewed=estimate(sentence,3,1000);assert.equal(reviewed.reps,1);assert.equal(word.reps,8);
 assert.equal(materializeSentences(entries,created,()=> 'duplicate:0').length,2);assert.equal(sentenceLibrary(created).length,1);
});
test('large libraries materialize examples in a single pass without duplicate cards',()=>{
 const words=Array.from({length:12000},(_,i)=>({...word,id:'w'+i}));let id=0;
 const cards=materializeSentences(sentenceLibrary(words),words,()=> 's'+id++);assert.equal(cards.length,24000);assert.equal(new Set(cards.map(c=>c.id)).size,24000);
 assert.equal(materializeSentences(sentenceLibrary(cards),cards,()=> 'bad').length,24000);
});

test('legacy sentence subdecks appear inside their lesson and keep their scheduling',async()=>{
 const {indexCollection,lessonDeck}=await import('../src/collection.ts');
 const sentence={...word,id:'sentence:0',kind:'sentence',sentenceFor:word.id,deck:'HSK 1::Sentences',reps:3};
 const index=indexCollection([word,sentence],1000);
 assert.deepEqual([...index.decks.keys()],['HSK 1']);
 assert.equal(index.decks.get('HSK 1').cards.length,2);
 assert.equal(index.decks.get('HSK 1').learned,2);
 assert.equal(lessonDeck(sentence),'HSK 1');
 assert.equal(sentenceLibrary([word,sentence])[0].deck,'HSK 1');
 assert.equal(sentence.deck,'HSK 1::Sentences');assert.equal(sentence.reps,3);
 assert.equal(lessonDeck({...word,deck:'My Chinese::Sentences'}),'My Chinese::Sentences');
});
