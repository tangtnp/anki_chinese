let engine:Promise<typeof import('pinyin-pro')>|undefined;
export function preparePronunciation(){return engine??=import('pinyin-pro').catch(error=>{engine=undefined;throw error})}
export const isHanzi=(character:string)=>/\p{Script=Han}/u.test(character);
export async function characterReading(text:string,index:number,provided?:string):Promise<string>{
 const characters=Array.from(text);if(!isHanzi(characters[index]||''))return '';
 // Prefer the deck author's reading for word cards when syllables align.
 if(provided){
  const syllables=provided.trim().split(/\s+/);const chinese=characters.filter(isHanzi);
  if(syllables.length===chinese.length&&syllables.every(s=>/^[a-züvāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜńňǹḿê:1-5]+$/i.test(s))){
   return syllables[characters.slice(0,index).filter(isHanzi).length];
  }
 }
 const {pinyin}=await preparePronunciation();
 // Read the full phrase so polyphonic characters retain sentence context.
 const readings=pinyin(text,{type:'all',toneType:'symbol',nonZh:'spaced'});
 return readings[index]?.pinyin||'';
}
