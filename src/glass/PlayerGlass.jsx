import React, {useEffect,useRef,useState} from 'react';
import './player-glass.css';

/**
 * Progressive enhancement for real DOM backdrop: blur works in modern browsers,
 * SVG displacement in backdrop-filter only where compositors support it.
 * Does not claim full native Apple refractive rendering.
 */
export default function PlayerGlass({children,mode='balanced',expanded=false}){
 const root=useRef(null);
 const [active,setActive]=useState(false);
 const [reduced,setReduced]=useState(false);
 useEffect(()=>{
  const mq=window.matchMedia('(prefers-reduced-motion: reduce)');
  const update=()=>setReduced(mq.matches);update();
  mq.addEventListener?.('change',update);
  return()=>mq.removeEventListener?.('change',update);
 },[]);
 const move=e=>{
  if(reduced||!root.current)return;
  const r=root.current.getBoundingClientRect();
  const x=Math.max(0,Math.min(100,(e.clientX-r.left)/r.width*100));
  const y=Math.max(0,Math.min(100,(e.clientY-r.top)/r.height*100));
  root.current.style.setProperty('--touch-x',x+'%');
  root.current.style.setProperty('--touch-y',y+'%');
 };
 return <div className={'shutter-glass '+(active?'is-pressed ':'')+(reduced?'reduce-motion ':'')+'glass-'+mode+(expanded?' is-expanded':'')}
  ref={root} onPointerMove={move} onPointerDown={e=>{setActive(true);move(e)}} onPointerUp={()=>setActive(false)} onPointerCancel={()=>setActive(false)} onPointerLeave={()=>setActive(false)}>
   {children}
 </div>;
}
