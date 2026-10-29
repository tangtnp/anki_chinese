import {test} from 'node:test';
import assert from 'node:assert/strict';
import {sync} from '../src/cloud.ts';
import {fakeCloud,card} from './helpers/fake-cloud.mjs';

test('sync discards pre-reset offline reviews and clears local study totals',async()=>{
 const resetAt='2026-10-29T10:00:00.000Z';const remote=card('card:0',{reset_at:resetAt});
 const cloud=fakeCloud({cards:[remote]});
 const store={cards:[{...remote,reps:8,due:9999999999999,reset_at:undefined}],reviews:[{id:'old-review',card_id:remote.id,rating:3,expected_reps:7,reviewed_at:'2026-10-29T09:00:00.000Z',status:'pending',elapsed_ms:10}],history:{'2026-10-29':8}};
 const result=await sync(store,cloud.db,'user');
 assert.equal(cloud.writes.reviews.length,0);assert.equal(result.reviews.length,0);assert.equal(result.cards[0].reps,0);assert.deepEqual(result.history,{});assert.equal(result.resetAt,resetAt);
 const after=await sync({...result,history:{'2026-10-29':1}},cloud.db,'user');assert.deepEqual(after.history,{'2026-10-29':1});
});
test('sync does not resurrect deleted Anki cards or upload their pending reviews',async()=>{
 const cloud=fakeCloud();
 const store={cards:[card('deleted:0',{deck:'HSK 7–9'})],reviews:[{id:'queued',card_id:'deleted:0',rating:3,expected_reps:0,reviewed_at:'2026-10-29T12:00:00.000Z',status:'pending',elapsed_ms:10}],history:{}};
 const result=await sync(store,cloud.db,'user');
 assert.equal(cloud.writes.cards.length,0);assert.equal(cloud.writes.reviews.length,0);assert.equal(result.cards.length,0);assert.equal(result.reviews.length,0);
});
test('more than 10,000 cards load once with a lower server page cap and no duplicate uploads',async()=>{
 const cards=Array.from({length:12345},(_,i)=>card('card-'+String(i).padStart(6,'0'),{source:'library'}));
 const cloud=fakeCloud({cards,cap:257});const result=await sync({cards,reviews:[],history:{}},cloud.db,'user');
 assert.equal(result.cards.length,12345);assert.equal(new Set(result.cards.map(c=>c.id)).size,12345);assert.equal(cloud.writes.cards.length,0);
 assert.equal(cloud.reads.cards,Math.ceil(12345/257)+1);
});
test('failed download never returns a partial collection or changes the offline store',async()=>{
 const cards=Array.from({length:2001},(_,i)=>card('c'+String(i).padStart(6,'0')));const cloud=fakeCloud({cards,cap:500,failAfter:2});
 const original={cards,reviews:[],history:{today:2}};await assert.rejects(sync(original,cloud.db,'user'));assert.equal(original.cards.length,2001);assert.equal(cloud.writes.cards.length,0);
});
test('new web card and review upload in the same sync',async()=>{
 const c=card('web:0',{source:'web'});const review={id:'new-review',card_id:c.id,rating:3,expected_reps:0,reviewed_at:'2026-10-29T12:00:00.000Z',status:'pending',elapsed_ms:10};
 const cloud=fakeCloud();const result=await sync({cards:[c],reviews:[review],history:{}},cloud.db,'user');
 assert.equal(cloud.writes.cards.length,1);assert.equal(cloud.writes.reviews.length,1);assert.equal(result.reviews.length,1);
});
