export function fakeCloud({cards=[],reviews=[],cap=1000,failAfter=Infinity}={}){
 const tables={cards:new Map(cards.map(c=>[c.id,{id:c.id,data:c}])),reviews:new Map(reviews.map(r=>[r.id,r]))};
 const writes={cards:[],reviews:[]},reads={cards:0,reviews:0};let calls=0;
 const db={rpc:async()=>({error:null}),from(table){let columns,cursor,limit=1000,write;
  const q={select(value){columns=value;return q},eq(){return q},order(){return q},range(){return q},gt(_key,value){cursor=value;return q},limit(value){limit=value;return q},upsert(rows){write=rows;return q},then(resolve){
   if(++calls>failAfter)return Promise.resolve({error:{message:'Simulated disconnected request'},data:null}).then(resolve);
   if(write){writes[table].push(...write);for(const row of write)if(!tables[table].has(row.id))tables[table].set(row.id,row);return Promise.resolve({error:null,data:[]}).then(resolve)}
   reads[table]++;let data=[...tables[table].values()].sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0).filter(row=>cursor===undefined||row.id>cursor).slice(0,Math.min(limit,cap));
   if(table==='cards'&&columns==='id')data=data.map(r=>({id:r.id}));
   return Promise.resolve({error:null,data}).then(resolve);
  }};return q;
 }};
 return {db,writes,reads,tables};
}
export function card(id,extra={}){return {id,deck:'HSK 1',front:'你好',back:'hello',reps:0,interval:0,due:0,source:'anki',...extra}}
