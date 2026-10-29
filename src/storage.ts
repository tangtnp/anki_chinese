import type {Store} from './types';

const DB_NAME='hanzi-flow';
let opening:Promise<IDBDatabase>|undefined;
const previous=new Map<string,Store>();
let queue:Promise<unknown>=Promise.resolve();

function database():Promise<IDBDatabase>{
 if(!opening)opening=new Promise((resolve,reject)=>{
  const request=indexedDB.open(DB_NAME,1);
  request.onupgradeneeded=()=>{
   for(const name of ['cards','reviews']){
    const table=request.result.createObjectStore(name,{keyPath:['owner','id']});
    table.createIndex('owner','owner');
   }
   request.result.createObjectStore('metadata',{keyPath:'owner'});
  };
  request.onsuccess=()=>{const db=request.result;db.onversionchange=()=>{db.close();opening=undefined};resolve(db)};
  request.onerror=()=>{opening=undefined;reject(request.error||new Error('Could not open offline storage.'))};
  request.onblocked=()=>{opening=undefined;reject(new Error('Close other Hanzi Flow tabs, then reload to update offline storage.'))};
 });
 return opening;
}
function result<T>(request:IDBRequest<T>):Promise<T>{return new Promise((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)})}
function committed(tx:IDBTransaction):Promise<void>{return new Promise((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error||new Error('Offline save was interrupted.'));tx.onerror=()=>{/* onabort carries the final error */}})}
export const storageKey=(owner:string|null)=>owner?'hanzi-store-'+owner:'hanzi-store';

export async function loadStore(key:string,legacy:Pick<Storage,'getItem'|'removeItem'>=localStorage):Promise<Store>{
 const db=await database();
 const tx=db.transaction(['cards','reviews','metadata'],'readonly');
 const completion=committed(tx);
 const [cards,reviews,meta]=await Promise.all([
  result(tx.objectStore('cards').index('owner').getAll(key)),
  result(tx.objectStore('reviews').index('owner').getAll(key)),
  result(tx.objectStore('metadata').get(key)),completion
 ]);
 if(meta){const {owner,...metadata}=meta;const store:Store={...metadata,cards:cards.map(row=>row.data),reviews:reviews.map(row=>row.data)};previous.set(key,store);return store;}
 const raw=legacy.getItem(key);
 const store:Store=raw?JSON.parse(raw):{cards:[],reviews:[],history:{}};
 if(!Array.isArray(store.cards)||!Array.isArray(store.reviews)||!store.history)throw new Error('The old offline collection could not be read. Export it before resetting this browser.');
 await saveStore(key,store);
 // Remove the old large JSON only after the IndexedDB transaction commits.
 if(raw){try{legacy.removeItem(key)}catch{/* The migrated database is already safe. */}}
 return store;
}

export function saveStore(key:string,store:Store):Promise<void>{
 const operation=queue.catch(()=>{}).then(async()=>{
  const db=await database();const old=previous.get(key);
  const tx=db.transaction(['cards','reviews','metadata'],'readwrite');const completion=committed(tx);
  try{
   for(const name of ['cards','reviews'] as const){
    const table=tx.objectStore(name);const before=new Map((old?.[name]||[]).map(row=>[row.id,row]));
    for(const row of store[name]){if(before.get(row.id)!==row)table.put({owner:key,id:row.id,data:row});before.delete(row.id)}
    for(const id of before.keys())table.delete([key,id]);
   }
   const {cards,reviews,...metadata}=store;tx.objectStore('metadata').put({owner:key,...metadata});
  }catch(error){tx.abort();await completion.catch(()=>{});throw error}
  await completion;previous.set(key,store);
 });
 queue=operation;return operation;
}
