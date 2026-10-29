import {useEffect,useId,useMemo,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import DOMPurify from 'dompurify';
import {characterReading,isHanzi} from './pronunciation';

type Bubble={index:number;character:string;reading:string;x:number;y:number;below:boolean};
export function HanziText({value,pinyin}:{value:string;pinyin?:string}){
 const text=useMemo(()=>{
  const fragment=DOMPurify.sanitize(value.replace(/<br\s*\/?>/gi,'\n'),{RETURN_DOM_FRAGMENT:true});
  fragment.querySelectorAll('rt,rp,style,script').forEach(node=>node.remove());
  return fragment.textContent||'';
 },[value]);
 const [bubble,setBubble]=useState<Bubble|null>(null);
 const root=useRef<HTMLSpanElement>(null),request=useRef(0),id=useId();
 useEffect(()=>{request.current++;setBubble(null)},[text]);
 useEffect(()=>{
  if(!bubble)return;
  const dismiss=()=>{request.current++;setBubble(null)};
  const pointer=(event:PointerEvent)=>{if(!root.current?.contains(event.target as Node))dismiss()};
  const key=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.stopPropagation();dismiss()}};
  document.addEventListener('pointerdown',pointer);document.addEventListener('keydown',key,true);
  window.addEventListener('scroll',dismiss,true);window.addEventListener('resize',dismiss);
  return()=>{document.removeEventListener('pointerdown',pointer);document.removeEventListener('keydown',key,true);window.removeEventListener('scroll',dismiss,true);window.removeEventListener('resize',dismiss)};
 },[bubble!==null]);
 async function show(index:number,character:string,button:HTMLButtonElement){
  if(bubble?.index===index){request.current++;setBubble(null);return}
  const token=++request.current,rect=button.getBoundingClientRect();
  const position={index,character,x:Math.min(window.innerWidth-92,Math.max(92,rect.left+rect.width/2)),y:rect.top<90?rect.bottom+10:rect.top-10,below:rect.top<90};
  setBubble({...position,reading:'…'});
  try{const reading=await characterReading(text,index,pinyin);if(request.current===token)setBubble({...position,reading:reading||'Reading unavailable'})}
  catch{if(request.current===token)setBubble({...position,reading:'Reading unavailable offline'})}
 }
 return <span className="tappable-hanzi" ref={root} lang="zh-CN">{Array.from(text).map((character,index)=>isHanzi(character)?<button type="button" className={'hanzi-character'+(bubble?.index===index?' is-active':'')} key={index} aria-label={`Show pinyin for ${character}`} aria-expanded={bubble?.index===index} aria-describedby={bubble?.index===index?id:undefined} onClick={event=>{event.stopPropagation();void show(index,character,event.currentTarget)}}>{character}</button>:<span key={index}>{character}</span>)}{bubble&&createPortal(<div className={'pinyin-bubble'+(bubble.below?' below':'')} id={id} role="tooltip" style={{left:bubble.x,top:bubble.y}}><span lang="zh-CN">{bubble.character}</span><strong>{bubble.reading}</strong></div>,document.body)}</span>;
}
