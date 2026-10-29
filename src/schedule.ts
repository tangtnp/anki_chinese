import type {Card} from './types';
// A temporary offline estimate. Anki remains authoritative once a review is applied.
export function estimate(card:Card,rating:number,now=Date.now()):Card {
 const days=rating===1?0:rating===2?Math.max(1,card.interval*1.2):rating===3?Math.max(1,card.interval*2.5):Math.max(4,card.interval*3.2);
 return {...card,fingerprint:undefined,reps:card.reps+1,interval:days,due:now+(rating===1?60000:days*86400000)};
}
