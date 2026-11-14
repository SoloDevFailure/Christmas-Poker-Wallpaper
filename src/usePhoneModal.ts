import {useEffect,type RefObject} from 'react';
export function usePhoneModal(ref:RefObject<HTMLElement|null>){useEffect(()=>{
 const previous=document.activeElement as HTMLElement|null,x=window.scrollX,y=window.scrollY,body=document.body;
 const saved={position:body.style.position,top:body.style.top,left:body.style.left,width:body.style.width,overflow:body.style.overflow};
 Object.assign(body.style,{position:'fixed',top:-y+'px',left:-x+'px',width:'100%',overflow:'hidden'});
 ref.current?.focus();
 const trap=(e:KeyboardEvent)=>{if(e.key!=='Tab')return;const items=[...ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled)')||[]],first=items[0],last=items[items.length-1];if(!first){e.preventDefault();ref.current?.focus();return;}if(!ref.current?.contains(document.activeElement)){e.preventDefault();first.focus();}else if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}};
 document.addEventListener('keydown',trap,true);
 return()=>{document.removeEventListener('keydown',trap,true);Object.assign(body.style,saved);previous?.focus({preventScroll:true});window.scrollTo(x,y);};
 },[ref]);}
