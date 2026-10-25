import {useEffect,useRef,useState} from 'react';
export const FREQUENCIES=[31,62,125,250,500,1000,2000,4000,8000,16000];
export const PRESETS={Flat:[0,0,0,0,0,0,0,0,0,0],Bass:[6,5,4,2,0,0,-1,-1,0,0],Rock:[4,3,1,-1,-2,0,2,3,3,2],Vocal:[-2,-2,-1,0,2,4,4,2,0,-1],Electronic:[5,4,2,0,-1,1,3,4,3,2],Cinematic:[4,3,2,0,1,2,3,2,1,1]};
const KEY='shutter-eq-v1';
const clamp=(v,min,max)=>Math.max(min,Math.min(max,Number(v)||0));
function stored(){try{const a=JSON.parse(localStorage.getItem(KEY)||'{}');return {enabled:a.enabled??true,gains:Array.isArray(a.gains)&&a.gains.length===10?a.gains.map(v=>clamp(v,-12,12)):[...PRESETS.Flat],preamp:clamp(a.preamp??-3,-12,6),preset:a.preset||'Flat',custom:a.custom&&typeof a.custom==='object'?a.custom:{}}}catch{return {enabled:true,gains:[...PRESETS.Flat],preamp:-3,preset:'Flat',custom:{}}}}
export function useEqualizer(decks){
 const [settings,setSettings]=useState(stored),[ready,setReady]=useState(false);
 const [compare,setCompare]=useState(false),[autoProtect,setAutoProtect]=useState(true);
 const graph=useRef(null),[bins,setBins]=useState(Array(32).fill(0));
 useEffect(()=>{try{localStorage.setItem(KEY,JSON.stringify(settings))}catch{}},[settings]);
 const initialize=async()=>{
  if(graph.current)return graph.current;
  const elements=decks.current;
  const Constructor=window.AudioContext||window.webkitAudioContext;
  if(!elements?.[0]||!elements?.[1]||!Constructor)return null;
  try{
   const context=new Constructor();
   const sources=elements.map(el=>context.createMediaElementSource(el));
   const deckGains=sources.map((source,i)=>{const gain=context.createGain();gain.gain.value=i===0?1:0;source.connect(gain);return gain});
   const preamp=context.createGain(),filters=FREQUENCIES.map((f,i)=>{const b=context.createBiquadFilter();b.type=i===0?'lowshelf':i===9?'highshelf':'peaking';b.frequency.value=f;b.Q.value=1.05;return b});
   const analyser=context.createAnalyser();analyser.fftSize=1024;analyser.smoothingTimeConstant=.8;
   deckGains.forEach(gain=>gain.connect(preamp));filters.reduce((prev,node)=>{prev.connect(node);return node},preamp).connect(analyser);analyser.connect(context.destination);
   graph.current={context,preamp,filters,analyser,deckGains};setReady(true);
   return graph.current;
  }catch(e){console.warn('Equalizer unavailable:',e);return null}
 };
 useEffect(()=>{const g=graph.current;if(!g)return;const t=g.context.currentTime;
  const boost=Math.max(0,...settings.gains),effective=autoProtect?Math.min(settings.preamp,-boost):settings.preamp;
  const on=settings.enabled&&!compare;
  g.preamp.gain.setTargetAtTime(on?Math.pow(10,effective/20):1,t,.015);
  g.filters.forEach((f,i)=>f.gain.setTargetAtTime(on?settings.gains[i]:0,t,.015));
 },[settings,compare,autoProtect]);
 const activate=async()=>{const g=await initialize();if(g){if(g.context.state==='suspended')await g.context.resume();const t=g.context.currentTime;const boost=Math.max(0,...settings.gains);const effective=autoProtect?Math.min(settings.preamp,-boost):settings.preamp;const on=settings.enabled&&!compare;g.preamp.gain.setValueAtTime(on?Math.pow(10,effective/20):1,t);g.filters.forEach((f,i)=>f.gain.setValueAtTime(on?settings.gains[i]:0,t))}return !!g};
 useEffect(()=>{let frame=0;let last=0;const data=new Uint8Array(512);const render=time=>{const g=graph.current;if(g&&time-last>65){g.analyser.getByteFrequencyData(data);setBins(Array.from({length:32},(_,i)=>Math.round(data[Math.min(511,Math.floor(i*i*.46))]/255*100)));last=time}frame=requestAnimationFrame(render)};frame=requestAnimationFrame(render);return()=>{cancelAnimationFrame(frame);const g=graph.current;if(g){g.context.close().catch(()=>{});graph.current=null}}},[]);
 const setDeck=(i)=>{const g=graph.current;if(!g)return;const t=g.context.currentTime;g.deckGains.forEach((node,j)=>{node.gain.cancelScheduledValues(t);node.gain.setValueAtTime(i===j?1:0,t)})};
 const mixDecks=(from,to,seconds)=>{const g=graph.current;if(!g)return false;const t=g.context.currentTime,d=Math.max(.05,seconds);g.deckGains.forEach((node,i)=>{node.gain.cancelScheduledValues(t);node.gain.setValueAtTime(i===from?1:i===to?0:0,t);node.gain.linearRampToValueAtTime(i===from?0:i===to?1:0,t+d)});return true};
 const setBand=(i,value)=>setSettings(s=>({...s,gains:s.gains.map((v,j)=>i===j?clamp(value,-12,12):v),preset:'Custom'}));
 const setPreamp=value=>setSettings(s=>({...s,preamp:clamp(value,-12,6)}));
 const applyPreset=name=>setSettings(s=>({...s,gains:[...(s.custom[name]||PRESETS[name]||PRESETS.Flat)],preset:name}));
 const savePreset=name=>{const clean=name.trim().slice(0,32);if(clean)setSettings(s=>({...s,custom:{...s.custom,[clean]:[...s.gains]},preset:clean}))};
 return {settings,bins,ready,activate,setDeck,mixDecks,setBand,setPreamp,applyPreset,savePreset,compare,setCompare,autoProtect,setAutoProtect,toggle:()=>setSettings(s=>({...s,enabled:!s.enabled}))};
}
