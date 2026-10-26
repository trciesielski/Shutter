import React,{useEffect,useRef} from 'react';
import {spectralFeatures,updateVisualDynamics} from './audioDynamics.js';

// Thirty-two independent real-audio channels, reflected across a horizontal baseline.
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
export default function MinimalNeonSpectrum({bins=[],playing=false,intensity=65,reduced=false,background=false}){
 const canvas=useRef(null),input=useRef({});
 input.current={bins,playing,intensity,reduced,background};
 useEffect(()=>{
  const el=canvas.current,ctx=el?.getContext('2d',{alpha:true});
  if(!ctx)return;
  let raf=0,last=0,alive=true,previous=null,dynamics=null;
  const smooth=new Float32Array(32);
  const draw=(now)=>{
   if(!alive)return;
   const p=input.current,dt=clamp(now-(last||now-16),8,70);last=now;
   const w=Math.max(1,el.clientWidth),h=Math.max(1,el.clientHeight);
   const dpr=Math.min(window.devicePixelRatio||1,p.background?1.3:1.7);
   const pw=Math.round(w*dpr),ph=Math.round(h*dpr);
   if(el.width!==pw||el.height!==ph){el.width=pw;el.height=ph}
   ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
   const features=spectralFeatures(p.playing?p.bins:Array(32).fill(0),previous);
   dynamics=updateVisualDynamics(dynamics,features,dt);previous=features.raw;
   const strength=clamp(p.intensity/100,.1,1),mid=h*.5;
   const frameWidth=Math.min(w*.88,900),start=(w-frameWidth)/2,slot=frameWidth/32;
   const topMax=Math.min(h*.31,frameWidth*.19),beat=dynamics.beat;
   const haze=ctx.createRadialGradient(w*.5,mid,0,w*.5,mid,Math.max(w,h)*.67);
   haze.addColorStop(0,'rgba(54,24,133,'+(.09+.11*features.energy)*strength+')');
   haze.addColorStop(.64,'rgba(18,18,64,.045)');
   haze.addColorStop(1,'rgba(5,7,24,0)');
   ctx.fillStyle=haze;ctx.fillRect(0,0,w,h);
   const pad=Math.max(2,slot*.23),width=Math.min(13,Math.max(2,slot-pad));
   for(let i=0;i<32;i++){
    const current=features.raw[i],attack=dynamics.transient[Math.min(11,Math.floor(i*12/32))];
    const follow=1-Math.exp(-dt/(current>smooth[i]?34:180));
    smooth[i]+=(current-smooth[i])*follow;
    // A few quieter bars remain visible even with silence, but never fake sound movement.
    const height=2.5+topMax*Math.pow(smooth[i],.72)*(1+.18*beat+.12*attack)*strength;
    const x=start+(i+.5)*slot;
    const cyan=i%5===0||i%5===2;
    const hue=cyan?'45,199,255':'245,60,230';
    const alpha=clamp(.54+.46*smooth[i]+attack*.18,0,1);
    const gradient=ctx.createLinearGradient(0,mid-height,0,mid+height);
    gradient.addColorStop(0,'rgba('+hue+','+(.76*alpha)+')');
    gradient.addColorStop(.67,'rgba('+hue+','+(.85*alpha)+')');
    gradient.addColorStop(1,'rgba('+hue+',.02)');
    const path=(x0,y,hh,rad)=>{ctx.beginPath();ctx.roundRect(x0,y,width,hh,rad)};
    ctx.save();ctx.globalCompositeOperation='lighter';
    ctx.shadowColor=cyan?'#13baff':'#f42af1';ctx.shadowBlur=14+10*attack;
    ctx.fillStyle='rgba('+hue+','+(.18*alpha)+')';path(x-width*.65,mid-height,width*.82+height,width*.7);ctx.fill();
    ctx.shadowBlur=7;ctx.fillStyle=gradient;path(x-width/2,mid-height,width*.0+height,Math.min(width/2,5));ctx.fill();
    ctx.shadowBlur=6;ctx.fillStyle='rgba('+hue+','+(.24*alpha)+')';path(x-width/2,mid+1,height*.62,Math.min(width/2,5));ctx.fill();
    ctx.fillStyle='rgba(210,244,255,'+(.16+.3*smooth[i])+')';ctx.shadowBlur=1;
    ctx.fillRect(x-width*.17,mid-height+1,Math.max(1,width*.34),Math.max(1,height-2));
    ctx.restore();
   }
   // Continuous thin midline: matched to the visual reference.
   ctx.save();ctx.shadowColor='#6575ff';ctx.shadowBlur=12;ctx.strokeStyle='rgba(87,127,255,.8)';
   ctx.lineWidth=1.25;ctx.beginPath();ctx.moveTo(start-12,mid+.5);ctx.lineTo(start+frameWidth+12,mid+.5);ctx.stroke();ctx.restore();
   if(p.playing&&!p.reduced)raf=requestAnimationFrame(draw);else raf=0;
  };
  raf=requestAnimationFrame(draw);
  return()=>{alive=false;cancelAnimationFrame(raf)};
 },[playing,reduced,background]);
 return <canvas className="minimal-neon-spectrum-canvas" ref={canvas} aria-hidden="true"/>;
}
