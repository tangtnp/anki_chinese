import {createClient,type SupabaseClient} from '@supabase/supabase-js';
import type {Store,Card,Review} from './types';
import {preservePending} from './collection.ts';
export type Config={url:string;key:string};
export const readConfig=():Config=>JSON.parse(localStorage.getItem('hanzi-config')||'{"url":"","key":""}');
export function client(config=readConfig()) {return config.url&&config.key?createClient(config.url,config.key):null;}

async function download(db:SupabaseClient,userId:string,table:'cards'|'reviews',progress?:(message:string)=>void){
 const rows:Record<string,any>[]=[];let cursor:string|undefined;
 for(;;){
  let query=db.from(table).select(table==='cards'?'id,data':'*').eq('user_id',userId).order('id').limit(500);
  if(cursor!==undefined)query=query.gt('id',cursor);
  const {data:raw,error}=await query;if(error)throw error;
  const data=raw as unknown as Record<string,any>[]|null;
  if(!data?.length)break;
  const last=data[data.length-1].id as string;
  if(last===cursor)throw new Error('Sync pagination did not advance. Your offline collection was kept.');
  rows.push(...data);cursor=last;progress?.(`Loading ${rows.length.toLocaleString()} ${table}…`);
 }
 return rows;
}
function checkedCard(row:Record<string,any>):Card{
 const c=row.data;
 if(!c||c.id!==row.id||typeof c.front!=='string'||typeof c.back!=='string'||typeof c.deck!=='string'||!Number.isFinite(c.reps)||!Number.isFinite(c.due)||!Number.isFinite(c.interval))throw new Error('A cloud card has invalid data. Your offline collection was kept.');
 return c;
}
export async function sync(store:Store,db:SupabaseClient,userId:string,progress?:(message:string)=>void):Promise<Store>{
 // Fetch once, paging by ID instead of relying on the server's row cap or offsets.
 const remoteCards=(await download(db,userId,'cards',progress)).map(checkedCard);
 const ids=new Set(remoteCards.map(c=>c.id));
 const missing=store.cards.filter(c=>c.source!=='anki'&&!ids.has(c.id));
 for(let i=0;i<missing.length;i+=100){
  progress?.(`Uploading cards ${Math.min(i+100,missing.length)} / ${missing.length}…`);
  const {error}=await db.from('cards').upsert(missing.slice(i,i+100).map(c=>({user_id:userId,id:c.id,data:c})),{onConflict:'user_id,id',ignoreDuplicates:true});if(error)throw error;
 }
 const cards=[...remoteCards,...missing];
 const resetAt=cards.reduce((latest,c)=>c.reset_at&&c.reset_at>latest?c.reset_at:latest,store.resetAt||'');
 const validIds=new Set(cards.map(c=>c.id));
 const pending=store.reviews.filter(r=>validIds.has(r.card_id)&&r.status==='pending'&&(!resetAt||r.reviewed_at>resetAt));
 for(let i=0;i<pending.length;i+=100){
  progress?.(`Sending reviews ${Math.min(i+100,pending.length)} / ${pending.length}…`);
  const {error}=await db.from('reviews').upsert(pending.slice(i,i+100).map(r=>({...r,user_id:userId})),{onConflict:'user_id,id',ignoreDuplicates:true});if(error)throw error;
 }
 const cleanup=await db.rpc('cleanup_applied_reviews');
 if(cleanup.error&&cleanup.error.code!=='PGRST202')throw cleanup.error;
 const reviews=(await download(db,userId,'reviews',progress) as unknown as Review[]).filter(r=>!resetAt||r.reviewed_at>resetAt);
 return {...store,cards:preservePending(cards,reviews,store.cards,resetAt),reviews,resetAt:resetAt||undefined,history:resetAt&&resetAt!==store.resetAt?{}:store.history,lastSync:new Date().toISOString()};
}
