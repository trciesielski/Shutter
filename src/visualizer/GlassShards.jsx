import React,{useEffect,useRef} from 'react';
import {spectralFeatures,updateVisualDynamics} from './audioDynamics.js';

// Layered glass geometry uses Canvas 2D for dependable mobile performance.
const pieces=Array.from({length:38},(_,i)=>{
 const r=(x)=>{const n=Math.sin(x*127.1+19.73)*43758.5453;return n-Math.floor(n)};
 const depth=i<11?0:i<27?1:2,angle=r(i+4)*Math.PI*2;
 const radius=(.10+r(i+39)*.35)*(depth===2?1.25:1);
 return {depth,band:i%12,angle,x:Math.cos(angle)*radius,y:Math.sin(angle)*radius*.72,
  size:(depth===0?.19:depth===1?.125:.075)*(.6+r(i+72)*.85),
  tilt:r(i+83)*Math.PI*2,phase:r(i+95)*Math.PI*2,shape:r(i+17)};
});
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export default function GlassShards({bins=[],playing=false,intensity=65,reduced=false,background=false}){
 const canvas=useRef(null),input=useRef({});
 input.current={bins,playing,intensity,reduced,background};
 useEffect(()=>{
  const el=canvas.current,ctx=el?.getContext('2d',{alpha:true});
  if(!ctx)return;
  let raf=0,alive=true,last=0,previousRaw=null,dynamics=null;
  const render=t=>{
   if(!alive)return;
   const opts=input.current,dt=clamp(t-(last||t-16),8,80);last=t;
   const dpr=Math.min(window.devicePixelRatio||1,opts.background?1.25:1.6);
   const w=Math.max(1,el.clientWidth),h=Math.max(1,el.clientHeight);
   const pw=Math.round(w*dpr),ph=Math.round(h*dpr);
   if(el.width!==pw||el.height!==ph){el.width=pw;el.height=ph}
   ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
   const f=spectralFeatures(opts.playing?opts.bins:Array(32).fill(0),previousRaw);
   dynamics=updateVisualDynamics(dynamics,f,dt);previousRaw=f.raw;
   const bass=(dynamics.sustain[0]+dynamics.sustain[1]+dynamics.sustain[2])/3;
   const voice=dynamics.voiceSustain,voiceAttack=dynamics.voiceTransient;
   const flux=dynamics.flux,beat=dynamics.beat,energy=f.energy;
   const power=clamp(opts.intensity/100,.1,1);
   const scale=Math.min(w,h),cx=w*.5,cy=h*.49;
   // Soft atmosphere behind the central sculpture; never wash out the black scene.
   const halo=ctx.createRadialGradient(cx,cy,scale*.02,cx,cy,scale*.54);
   halo.addColorStop(0,'rgba(84,117,173,'+(.11+energy*.24+bass*.17)*power+')');
   halo.addColorStop(.55,'rgba(30,54,99,'+(.045+voice*.13)*power+')');
   halo.addColorStop(1,'rgba(4,8,20,0)');
   ctx.fillStyle=halo;ctx.fillRect(0,0,w,h);
   const time=opts.reduced?0:t*.001;
   for(const p of pieces){
    const sustain=dynamics.sustain[p.band],attack=dynamics.transient[p.band];
    const center=p.depth===0?.65:p.depth===1?.96:1.25;
    const kick=p.band<4?beat:0;
    const spread=1+(.08*bass+.19*kick+.13*flux)*power;
    const oscillation=opts.reduced?0:Math.sin(time*(.18+p.depth*.09)+p.phase)*(.006+.018*sustain);
    const drift=opts.reduced?0:Math.sin(time*.24+p.phase)*(.003+voice*.012);
    const px=cx+(p.x*spread+Math.cos(p.angle)*oscillation)*scale*center;
    const py=cy+(p.y*spread+drift)*scale*center;
    const size=p.size*scale*(1+.15*sustain+.22*attack)*center;
    const twist=p.tilt+(opts.reduced?0:Math.sin(time*.28+p.phase)*(.12+.30*voice))+(attack*.25);
    const ca=Math.cos(twist),sa=Math.sin(twist);
    const coords=[[-.44,-.68],[.60,-.38],[.43,.68],[-.31,.34]];
    const v=coords.map(([x,y],j)=>{const dx=(x+(j===2?p.shape*.28:0))*size,dy=y*size;return [px+dx*ca-dy*sa,py+dx*sa+dy*ca]});
    ctx.beginPath();ctx.moveTo(...v[0]);for(let j=1;j<v.length;j++)ctx.lineTo(...v[j]);ctx.closePath();
    const grad=ctx.createLinearGradient(v[0][0],v[0][1],v[2][0],v[2][1]);
    // Premium neon glass: saturated interior refraction and multi-pass emission.
    const cyan=p.band%3!==1,edge=cyan?'92,227,255':'239,96,255';
    const edgeHex=cyan?'#46dfff':'#f04bff';
    const opacity=(p.depth===0?.19:p.depth===1?.24:.30)*(.65+.35*power);
    grad.addColorStop(0,'rgba(210,246,255,'+(opacity+.11*sustain)+')');
    grad.addColorStop(.24,cyan?'rgba(49,172,218,'+(opacity*.54)+')':'rgba(149,59,209,'+(opacity*.56)+')');
    grad.addColorStop(.72,'rgba(22,23,80,'+(opacity*.55)+')');
    grad.addColorStop(1,'rgba(221,231,255,'+(opacity+.09*attack)+')');
    ctx.fillStyle=grad;ctx.fill();
    const glare=clamp((.35+.26*sustain+.58*attack)*(.75+.25*power),0,1);
    ctx.save();ctx.globalCompositeOperation='lighter';
    // Wide diffusion and close bloom: both visible even between transients.
    ctx.strokeStyle='rgba('+edge+','+clamp(glare*.21,0,.38)+')';
    ctx.lineWidth=p.depth===2?5:9;
    ctx.shadowColor=edgeHex;ctx.shadowBlur=22+12*attack;ctx.stroke();
    ctx.strokeStyle='rgba('+edge+','+clamp(glare*.62,0,.85)+')';
    ctx.lineWidth=p.depth===2?2:3.1;
    ctx.shadowBlur=10+16*attack;ctx.stroke();
    ctx.strokeStyle='rgba(233,252,255,'+clamp(.30+.5*glare,0,.95)+')';
    ctx.lineWidth=p.depth===2?.75:1.25;ctx.shadowBlur=4;ctx.stroke();
    // Moving glints and prismatic fold — reacts continuously to vocal range.
    ctx.beginPath();ctx.moveTo(...v[0]);ctx.lineTo(...v[2]);
    ctx.strokeStyle='rgba('+(cyan?'100,226,255':'249,115,246')+','+clamp(.18+voice*.45+voiceAttack*.40,0,.88)+')';
    ctx.lineWidth=1.1;ctx.shadowColor=edgeHex;ctx.shadowBlur=8+14*voiceAttack;ctx.stroke();
    const glint=opts.reduced?.42:(.5+.5*Math.sin(time*(.42+.18*sustain)+p.phase));
    const gx=v[0][0]+(v[1][0]-v[0][0])*glint,gy=v[0][1]+(v[1][1]-v[0][1])*glint;
    ctx.beginPath();ctx.arc(gx,gy,clamp(1.2+attack*2.5,.7,4),0,Math.PI*2);
    ctx.fillStyle='rgba(238,253,255,'+clamp(.28+sustain*.32+attack*.5,0,.95)+')';
    ctx.shadowColor=edgeHex;ctx.shadowBlur=10+18*attack;ctx.fill();
    ctx.restore();
    if(p.depth===2 && attack>.12){
     ctx.beginPath();ctx.moveTo(...v[1]);ctx.lineTo(v[1][0]+Math.cos(p.angle)*size*(.3+flux),v[1][1]+Math.sin(p.angle)*size*(.3+flux));
     ctx.strokeStyle='rgba(226,245,255,'+clamp(attack*.65*power,0,.8)+')';ctx.lineWidth=.7;ctx.stroke();
    }
   }
   if(opts.playing&&!opts.reduced)raf=requestAnimationFrame(render);else raf=0;
  };
  raf=requestAnimationFrame(render);
  return()=>{alive=false;cancelAnimationFrame(raf)};
 },[playing,reduced,background]);
 return <canvas className="glass-shards-canvas" ref={canvas} aria-hidden="true"/>;
}
