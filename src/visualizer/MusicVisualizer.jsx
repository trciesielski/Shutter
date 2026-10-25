import React,{useEffect,useRef,useState} from 'react';
import {Maximize2,Minimize2} from 'lucide-react';
import {VISUAL_MODES,resolveVisualMode} from './modes.js';
import './visualizer.css';

const KEY='shutter-visualizer-v1';
const clamp=(n,min,max)=>Math.min(max,Math.max(min,n));
const read=()=>{try{const x=JSON.parse(localStorage.getItem(KEY)||'{}');return {mode:VISUAL_MODES.some(v=>v[0]===x.mode)?x.mode:'auto',intensity:clamp(Number(x.intensity)||65,10,100)}}catch{return {mode:'auto',intensity:65}}};
function createStars(count){
 let seed=1979;
 return Array.from({length:count},(_,i)=>{seed=(seed*1664525+1013904223)>>>0;const a=seed/4294967295;seed=(seed*1664525+1013904223)>>>0;return {x:a,y:seed/4294967295,r:1+(i%3)*.65,phase:i*2.39996}});
}
const stars=createStars(100);
export default function MusicVisualizer({song,playing,bins=[]}){
 const canvas=useRef(null),frame=useRef(0),spectrum=useRef(Array(32).fill(0));
 const [settings,setSettings]=useState(read),[reduced,setReduced]=useState(()=>window.matchMedia?.('(prefers-reduced-motion: reduce)').matches||false);
 const [coverUrl,setCoverUrl]=useState(null);
 const [maximized,setMaximized]=useState(false);
 useEffect(()=>{try{localStorage.setItem(KEY,JSON.stringify(settings))}catch{}},[settings]);
 useEffect(()=>{const mq=window.matchMedia('(prefers-reduced-motion: reduce)');const update=()=>setReduced(mq.matches);mq.addEventListener?.('change',update);return()=>mq.removeEventListener?.('change',update)},[]);
 useEffect(()=>{if(!song?.coverBlob){setCoverUrl(null);return}const u=URL.createObjectURL(song.coverBlob);setCoverUrl(u);return()=>URL.revokeObjectURL(u)},[song?.coverBlob]);
 useEffect(()=>{if(!maximized)return;const old=document.body.style.overflow;document.body.style.overflow='hidden';const onKey=e=>{if(e.key==='Escape')setMaximized(false)};window.addEventListener('keydown',onKey);return()=>{document.body.style.overflow=old;window.removeEventListener('keydown',onKey)}},[maximized]);
 const mode=resolveVisualMode(settings.mode,!!coverUrl,reduced);
 const input=useRef({});input.current={mode,playing,reduced,intensity:settings.intensity,bins};
 useEffect(()=>{
  const el=canvas.current,ctx=el?.getContext('2d',{alpha:true});if(!ctx)return;
  let live=true,last=0;
  const draw=(t)=>{
   if(!live)return;
   const {mode,playing,reduced,intensity,bins}=input.current;
   const scale=Math.min(window.devicePixelRatio||1,2),w=Math.max(1,el.clientWidth),h=Math.max(1,el.clientHeight);
   const pw=Math.round(w*scale),ph=Math.round(h*scale);
   if(el.width!==pw||el.height!==ph){el.width=pw;el.height=ph}
   ctx.setTransform(scale,0,0,scale,0,0);ctx.clearRect(0,0,w,h);
   const energy=Array.from({length:32},(_,i)=>{const raw=playing?clamp((bins[i]||0)/100,0,1):0;spectrum.current[i]+=(raw-spectrum.current[i])*.17;return spectrum.current[i]});
   const bass=energy.slice(0,7).reduce((a,b)=>a+b,0)/7;
   const mids=energy.slice(7,21).reduce((a,b)=>a+b,0)/14;
   const treble=energy.slice(21).reduce((a,b)=>a+b,0)/11;
   const power=intensity/100,phase=reduced?0:t*.00028;
   if(mode==='minimal'){
    for(let j=0;j<3;j++){ctx.beginPath();ctx.strokeStyle='rgba(165,133,255,'+(.16+j*.06+bass*.28)*power+')';ctx.lineWidth=1.2+j*.55;for(let x=0;x<=w;x+=4){const y=h*(.38+j*.13)+Math.sin(x*.018+phase*(j+1)*3+j)*((reduced?1:9)+bass*33)*power;if(x===0)ctx.moveTo(x,y);else ctx.lineTo(x,y)}ctx.stroke()}
   }else if(mode==='orb'||mode==='mirage'){
    const cx=w*.5,cy=h*.49,r=Math.min(w,h)*.25*(1+bass*.2*power);
    const g=ctx.createRadialGradient(cx,cy,r*.05,cx,cy,r*1.55);g.addColorStop(0,'rgba(179,124,255,'+(.27+mids*.35)*power+')');g.addColorStop(.45,'rgba(109,62,224,.18)');g.addColorStop(1,'rgba(94,44,235,0)');ctx.fillStyle=g;ctx.beginPath();ctx.arc(cx,cy,r*1.55,0,Math.PI*2);ctx.fill();
    for(let layer=0;layer<3;layer++){ctx.beginPath();const pts=180;for(let i=0;i<=pts;i++){const a=i/pts*Math.PI*2;const ripple=(reduced?0:Math.sin(a*5+phase*5+layer)*(.018+treble*.10)*power);const rr=r*(.83+layer*.10+ripple);const x=cx+Math.cos(a)*rr,y=cy+Math.sin(a)*rr;if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y)}ctx.closePath();ctx.strokeStyle=['rgba(224,208,255,.55)','rgba(161,104,255,.50)','rgba(105,176,255,.25)'][layer];ctx.lineWidth=layer===0?2.3:1.1;ctx.shadowColor='#9869ff';ctx.shadowBlur=layer===0?17:8;ctx.stroke();ctx.shadowBlur=0}
   }
   if(mode==='particles'||mode==='mirage'){
    for(let i=0;i<stars.length;i++){const p=stars[i],a=phase*(.7+(i%5)*.13)+p.phase;const radius=Math.min(w,h)*(.12+p.y*.48);const x=w*.5+Math.cos(a)*radius*(mode==='mirage'?1.1:1.7),y=h*.5+Math.sin(a*.7)*radius*.65;
     const alpha=clamp((.15+energy[i%32]*.75)*power,0,.9);ctx.fillStyle='rgba('+(i%4===0?'115,190,255':'198,160,255')+','+alpha+')';ctx.beginPath();ctx.arc(x,y,p.r*(1+energy[i%32]*1.7),0,Math.PI*2);ctx.fill();
    }
   }
   if(mode==='cover'){const cx=w*.5,cy=h*.49;for(let i=0;i<4;i++){const r=Math.min(w,h)*(.20+i*.10+bass*.06*power);ctx.beginPath();ctx.ellipse(cx,cy,r,r*.74,phase*.2,0,Math.PI*2);ctx.strokeStyle='rgba(176,125,255,'+(.11+energy[(i*6)%32]*.22)*power+')';ctx.lineWidth=1.2;ctx.stroke()}}
   if(playing&&!reduced){frame.current=requestAnimationFrame(draw)}else{frame.current=0}
  };
  frame.current=requestAnimationFrame(draw);
  return()=>{live=false;cancelAnimationFrame(frame.current)};
 },[mode,playing,reduced]);
 return <section className={'music-visualizer mode-'+mode+(maximized?' is-maximized':'')} aria-label="Wizualizacja odtwarzanego utworu">
 <div className="visualizer-head">
   <label className="visualizer-mode"><select aria-label="Tryb wizualizacji" value={settings.mode} onChange={e=>setSettings(v=>({...v,mode:e.target.value}))}>{VISUAL_MODES.map(([id,label])=><option value={id} key={id}>{label}</option>)}</select></label>
   <div className="visualizer-head-actions">
     <label className="visualizer-intensity" title="Intensywność efektu"><span>Intensywność</span><input aria-label="Intensywność wizualizacji" type="range" min="10" max="100" step="5" value={settings.intensity} onChange={e=>setSettings(v=>({...v,intensity:Number(e.target.value)}))}/></label>
     <button className="visualizer-maximize" title={maximized?'Zamknij pełny ekran':'Maksymalizuj wizualizację'} aria-label={maximized?'Zamknij wizualizację':'Maksymalizuj wizualizację'} onClick={()=>setMaximized(v=>!v)}>{maximized?<Minimize2 size={18}/>:<Maximize2 size={18}/>}</button>
   </div>
 </div>
 <div className="visualizer-scene">
  <canvas ref={canvas} aria-hidden="true"/>
  {mode==='cover'&&<div className="visualizer-cover">{coverUrl?<img src={coverUrl} alt="Okładka aktualnego utworu"/>:<div className="visualizer-fallback" aria-hidden="true"><strong>♪</strong></div>}</div>}
  <div className="visualizer-vignette"/>
 </div>
 </section>;
}
