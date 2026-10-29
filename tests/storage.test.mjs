import {test} from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import {loadStore,saveStore} from '../src/storage.ts';
const noLegacy={getItem(){return null},removeItem(){}};
const makeCard=(i)=>({id:'c'+i,deck:'large',front:'你',back:'example '.repeat(100),reps:0,due:0,interval:0,source:'anki'});

test('large collections save beyond localStorage quota and survive repeated reviews',async()=>{
 const key='large-account';let store={cards:Array.from({length:12000},(_,i)=>makeCard(i)),reviews:[],history:{}};
 assert.ok(JSON.stringify(store).length>5*1024*1024);
 await saveStore(key,store);
 for(let i=0;i<15;i++){
  store={...store,cards:store.cards.map((c,n)=>n===i?{...c,reps:1}:c),reviews:[...store.reviews,{id:'r'+i,card_id:'c'+i,status:'pending'}]};
  await saveStore(key,store);
 }
 const loaded=await loadStore(key,noLegacy);assert.equal(loaded.cards.length,12000);assert.equal(loaded.reviews.length,15);assert.equal(loaded.cards.filter(c=>c.reps===1).length,15);
});
test('legacy data migrates before the original JSON is removed',async()=>{
 const store={cards:[makeCard('legacy')],reviews:[],history:{today:3}};let raw=JSON.stringify(store),removed=false;
 const legacy={getItem(){return raw},removeItem(){removed=true;raw=null}};
 assert.deepEqual(await loadStore('legacy-account',legacy),store);assert.equal(removed,true);
 assert.deepEqual(await loadStore('legacy-account',noLegacy),store);
});
test('accounts stay isolated and deleted cards/reviews are removed atomically',async()=>{
 await saveStore('one',{cards:[makeCard(1)],reviews:[{id:'r1'}],history:{one:1}});
 await saveStore('two',{cards:[makeCard(2)],reviews:[],history:{two:2}});
 await saveStore('one',{cards:[],reviews:[],history:{}});
 assert.equal((await loadStore('one',noLegacy)).cards.length,0);
 const other=await loadStore('two',noLegacy);assert.equal(other.cards[0].id,'c2');assert.deepEqual(other.history,{two:2});
});
test('a failed save rejects without erasing the previous transaction',async()=>{
 const store={cards:[makeCard('safe')],reviews:[],history:{safe:1}};await saveStore('failed-account',store);
 await assert.rejects(saveStore('failed-account',{...store,cards:[{...makeCard('bad'),notCloneable:()=>{}}]}));
 assert.equal((await loadStore('failed-account',noLegacy)).cards[0].id,'csafe');
});
