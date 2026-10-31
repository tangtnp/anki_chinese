import type {Card,Review,Store} from './types';

// Older sentence cards may still live in a generated subdeck. Group them with their lesson.
export function lessonDeck(card:Pick<Card,'kind'|'deck'>){return card.kind==='sentence'?card.deck.replace(/::Sentences$/,''):card.deck}

// Linear-time indexing avoids scanning every review for every card on large decks.
export function indexCollection(cards:Card[],now=Date.now()){
 const decks=new Map<string,{cards:Card[];ready:number;learned:number}>();
 let dueCount=0;
 for(const card of cards){
  const name=lessonDeck(card);
  let deck=decks.get(name);if(!deck){deck={cards:[],ready:0,learned:0};decks.set(name,deck)}
  deck.cards.push(card);if(card.reps>0)deck.learned++;
  if(!card.suspended&&card.due<=now){deck.ready++;dueCount++}
 }
 return {decks,dueCount};
}
export function preservePending(cards:Card[],reviews:Review[],local:Card[],resetAt:string){
 const pendingIds=new Set(reviews.filter(r=>r.status==='pending').map(r=>r.card_id));
 const localById=new Map(local.map(c=>[c.id,c]));
 return cards.map(c=>{const saved=localById.get(c.id);return pendingIds.has(c.id)&&saved&&(!resetAt||saved.reset_at===resetAt)?saved:c});
}
export function mergeSync(snapshot:Store,result:Store,current:Store):Store{
 const knownReviews=new Set(snapshot.reviews.map(r=>r.id));
 const added=current.reviews.filter(r=>!knownReviews.has(r.id)&&(!result.resetAt||r.reviewed_at>result.resetAt));
 const reviewedNow=new Set(added.map(r=>r.card_id));
 const local=new Map(current.cards.map(c=>[c.id,c]));
 const resultIds=new Set(result.cards.map(c=>c.id));const snapshotIds=new Set(snapshot.cards.map(c=>c.id));
 return {...result,cards:result.cards.map(c=>reviewedNow.has(c.id)?local.get(c.id)||c:c).concat(current.cards.filter(c=>!snapshotIds.has(c.id)&&!resultIds.has(c.id))),reviews:[...result.reviews,...added],history:result.resetAt!==current.resetAt?{}:current.history};
}
