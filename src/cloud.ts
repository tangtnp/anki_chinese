import {createClient,type SupabaseClient} from '@supabase/supabase-js';
import type {Store,Card,Review} from './types';
export type Config={url:string;key:string};
export const readConfig=():Config=>JSON.parse(localStorage.getItem('hanzi-config')||'{"url":"","key":""}');
export function client(config=readConfig()) {return config.url&&config.key?createClient(config.url,config.key):null;}
export async function sync(store:Store,db:SupabaseClient,userId:string):Promise<Store>{
 // Only new web notes are uploaded as cards. Existing Anki snapshots are Mac-owned.
 const existing=await db.from('cards').select('id').eq('user_id',userId).limit(10000);if(existing.error)throw existing.error;
 const ids=new Set((existing.data||[]).map(x=>x.id));
 const missing=store.cards.filter(c=>!ids.has(c.id));
 for(let i=0;i<missing.length;i+=100){const {error}=await db.from('cards').upsert(missing.slice(i,i+100).map(c=>({user_id:userId,id:c.id,data:c})),{onConflict:'user_id,id',ignoreDuplicates:true});if(error)throw error;}
 const pending=store.reviews.filter(r=>r.status==='pending');
 for(let i=0;i<pending.length;i+=100){const {error}=await db.from('reviews').upsert(pending.slice(i,i+100).map(r=>({...r,user_id:userId})),{onConflict:'user_id,id',ignoreDuplicates:true});if(error)throw error;}
 // Expiration uses the server acknowledgement time, never the phone clock.
 // Old installations can keep syncing until the cleanup migration is installed.
 const cleanup=await db.rpc('cleanup_applied_reviews');
 if(cleanup.error&&cleanup.error.code!=='PGRST202')throw cleanup.error;
 let cards:Card[]=[];let reviews:Review[]=[];
 for(let from=0;;from+=1000){const {data,error}=await db.from('cards').select('data').eq('user_id',userId).order('id').range(from,from+999);if(error)throw error;cards.push(...(data||[]).map(r=>r.data as Card));if(!data||data.length<1000)break;}
 for(let from=0;;from+=1000){const {data,error}=await db.from('reviews').select('*').eq('user_id',userId).order('reviewed_at').order('id').range(from,from+999);if(error)throw error;reviews.push(...(data||[]) as Review[]);if(!data||data.length<1000)break;}
 // Preserve local estimated due dates while the Mac has not acknowledged a review.
 cards=cards.map(c=>reviews.some(r=>r.card_id===c.id&&r.status==='pending')?(store.cards.find(l=>l.id===c.id)||c):c);
 return {...store,cards,reviews,lastSync:new Date().toISOString()};
}
