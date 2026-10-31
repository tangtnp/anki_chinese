import type {Card} from './types';
import {lessonDeck} from './collection.ts';
export type SentenceEntry={id:string;parentId?:string;word:string;front:string;back:string;deck:string;card?:Card};
export function sentenceLibrary(cards:Card[]):SentenceEntry[]{
 const words=new Map(cards.filter(c=>c.kind!=='sentence').map(c=>[c.id,c]));
 const entries=new Map<string,SentenceEntry>();
 for(const c of cards){
  if(c.kind!=='sentence')continue;
  const id=c.sentenceFor||c.id;
  entries.set(id,{id,parentId:c.sentenceFor,word:words.get(c.sentenceFor||'')?.front||c.relatedWord||'',front:c.front,back:c.back,deck:words.get(c.sentenceFor||'')?.deck||lessonDeck(c),card:c});
 }
 for(const word of words.values()){
  if(!word.example?.trim()||entries.has(word.id))continue;
  entries.set(word.id,{id:word.id,parentId:word.id,word:word.front,front:word.example,back:word.translation||'',deck:word.deck});
 }
 return [...entries.values()];
}
export function materializeSentences(entries:SentenceEntry[],cards:Card[],newId=()=>crypto.randomUUID()+':0',resetAt?:string):Card[]{
 const existing=new Set(cards.filter(c=>c.kind==='sentence'&&c.sentenceFor).map(c=>c.sentenceFor));
 const result=[...cards];
 for(const entry of entries){
  if(entry.card||!entry.parentId||existing.has(entry.parentId))continue;
  result.push({id:newId(),kind:'sentence',sentenceFor:entry.parentId,relatedWord:entry.word,deck:entry.deck,front:entry.front,back:entry.back,reps:0,due:0,interval:0,source:'web',reset_at:resetAt});
  existing.add(entry.parentId);
 }
 return result;
}
