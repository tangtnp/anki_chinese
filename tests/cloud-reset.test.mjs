import {test} from 'node:test';
import assert from 'node:assert/strict';
import {sync} from '../src/cloud.ts';

test('sync discards pre-reset offline reviews and clears local study totals',async()=>{
 const resetAt='2026-10-29T10:00:00.000Z';
 const card={id:'card:0',deck:'HSK 1',front:'你好',back:'hello',reps:0,interval:0,due:0,source:'anki',reset_at:resetAt};
 let uploaded=[];
 const db={rpc:async()=>({error:null}),from(table){let columns,write;
  const q={select(value){columns=value;return q},eq(){return q},order(){return q},range(){return q},limit(){return q},upsert(rows){write=rows;if(table==='reviews')uploaded.push(...rows);return q},then(resolve){return Promise.resolve({error:null,data:write?[]:table==='cards'?(columns==='id'?[{id:card.id}]:[{data:card}]):[]}).then(resolve)}};return q;
 }};
 const store={cards:[{...card,reps:8,due:9999999999999,reset_at:undefined}],reviews:[{id:'old-review',card_id:card.id,rating:3,expected_reps:7,reviewed_at:'2026-10-29T09:00:00.000Z',status:'pending',elapsed_ms:10}],history:{'2026-10-29':8}};
 const result=await sync(store,db,'user');
 assert.equal(uploaded.length,0);assert.equal(result.reviews.length,0);assert.equal(result.cards[0].reps,0);assert.deepEqual(result.history,{});assert.equal(result.resetAt,resetAt);
 const after=await sync({...result,history:{'2026-10-29':1}},db,'user');assert.deepEqual(after.history,{'2026-10-29':1});
});

test('sync does not resurrect deleted Anki cards or upload their pending reviews',async()=>{
 let cardUploads=[],reviewUploads=[];
 const db={rpc:async()=>({error:null}),from(table){let columns,write;
  const q={select(value){columns=value;return q},eq(){return q},order(){return q},range(){return q},limit(){return q},upsert(rows){write=rows;(table==='cards'?cardUploads:reviewUploads).push(...rows);return q},then(resolve){return Promise.resolve({error:null,data:[]}).then(resolve)}};return q;
 }};
 const store={cards:[{id:'deleted:0',deck:'HSK 7–9',front:'test',back:'test',reps:0,due:0,interval:0,source:'anki'}],reviews:[{id:'queued',card_id:'deleted:0',rating:3,expected_reps:0,reviewed_at:'2026-10-29T12:00:00.000Z',status:'pending',elapsed_ms:10}],history:{}};
 const result=await sync(store,db,'user');
 assert.equal(cardUploads.length,0);assert.equal(reviewUploads.length,0);assert.equal(result.cards.length,0);assert.equal(result.reviews.length,0);
});
