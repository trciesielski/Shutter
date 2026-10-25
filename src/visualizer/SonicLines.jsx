import React,{useEffect,useRef} from 'react';
import {spectralFeatures,updateVisualDynamics} from './audioDynamics.js';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const colors=['#31eaff','#5b7dff','#c269ff','#ff4fc8','#ff956b','#4aeeae'];
export default function SonicLines({bins=[],playing=false,intensity=65,reduced=false,background=false}){
 const canvas=useRef(null),inputs=useRef({});
 inputs.current={bins,playing,intensity,reduced,background};
 useEffect(()=>{
  const el=canvas.current,ctx=el?.getContext('2d',{alpha:true});
  if(!ctx)return;
  let raf=0,alive=true,last=0,previousRaw=null,dynamics=null;
  const paint=t=>{
   if(!alive)return;
   const {bins,playing,intensity,reduced,background}=inputs.current;
   const dt=clamp(t-(last||t-16),8,70);last=t;
   const w=Math.max(1,el.clientWidth),h=Math.max(1,el.clientHeight);
   const pixelRatio=Math.min(window.devicePixelRatio||1,background?1.25:1.7);
   const pw=Math.round(w*pixelRatio),ph=Math.round(h*pixelRatio);
   if(el.width!==pw||el.height!==ph){el.width=pw;el.height=ph}
   ctx.setTransform(pixelRatio,0,0,pixelRatio,0,0);ctx.clearRect(0,0,w,h);
   const features=spectralFeatures(playing?bins:Array(32).fill(0),previousRaw);
   dynamics=updateVisualDynamics(dynamics,features,dt);previousRaw=features.raw;
   const s=dynamics.sustain,tr=dynamics.transient;
   const power=clamp(intensity/100,.1,1);
   const bass=(s[0]+s[1]+s[2]+s[3])/4,mid=(s[4]+s[5]+s[6]+s[7]+s[8])/5,high=(s[9]+s[10]+s[11])/3;
   const voice=dynamics.voiceSustain,attack=dynamics.voiceTransient,beat=dynamics.beat;
   const time=reduced?0:t*.001;
   const cy=h*.49,unit=Math.min(w,h),wide=h>w;
   const amplitude=unit*(.038+bass*.15+mid*.07+beat*.065)*(.5+.5*power);
   // Dark navy background, wide soft atmosphere, preserved negative space.
   const bg=ctx.createRadialGradient(w*.5,cy,unit*.015,w*.5,cy,unit*.72);
   bg.addColorStop(0,'rgba(25,38,85,'+(.17+.2*features.energy)*power+')');
   bg.addColorStop(.65,'rgba(15,20,52,.065)');
   bg.addColorStop(1,'rgba(4,6,18,0)');
   ctx.fillStyle=bg;ctx.fillRect(0,0,w,h);
   // Fine technical grid behind, never visible over neon ribbons.
   ctx.strokeStyle='rgba(63,128,163,.055)';ctx.lineWidth=.6;
   const gap=Math.max(24,unit*.085);
   for(let x=(w*.5)%gap;x<w;x+=gap){ctx.beginPath();ctx.moveTo(x,h*.20);ctx.lineTo(x,h*.82);ctx.stroke()}
   for(let y=cy%gap;y<h;y+=gap){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke()}
   // The 64 mirrored spectral columns follow interpolated real 32-bin measurements.
   const count=64,barWidth=Math.max(1.2,w/count*.42);
   for(let i=0;i<count;i++){
    const a=i*(31/(count-1)),lo=Math.floor(a),frac=a-lo;
    const e=(features.raw[lo]||0)*(1-frac)+(features.raw[Math.min(lo+1,31)]||0)*frac;
    const band=Math.floor(i/count*12),level=s[band],transient=tr[band];
    const x=(i+.5)*w/count;
    const envelope=Math.sin(Math.PI*i/count)**.62;
    const height=unit*(.008+e*.25+level*.082+transient*.10+beat*.016)*envelope*power;
    const hue=colors[Math.min(5,Math.floor(i/count*6))];
    ctx.strokeStyle=hue;ctx.globalAlpha=.25+.58*clamp(e+level*.6+transient*.5,0,1);
    ctx.lineWidth=barWidth;ctx.shadowColor=hue;ctx.shadowBlur=7+10*transient;
    ctx.beginPath();ctx.moveTo(x,cy-height);ctx.lineTo(x,cy+height);ctx.stroke();
   }
   ctx.shadowBlur=0;ctx.globalAlpha=1;
   // Multiple distinct filament families; center movement comes from voice and middle frequencies.
   for(let i=0;i<16;i++){
    const family=i%4,shift=(i-7.5)*unit*.006;
    const hue=colors[(i+Math.floor(i/4))%colors.length],band=(i*5)%12;
    const sustain=s[band],transient=tr[band];
    const amp=amplitude*(.50+.045*i+.37*sustain+.36*voice+.45*transient);
    ctx.beginPath();
    for(let x=0;x<=w+3;x+=3){
     const nx=x/w;
     const focus=Math.pow(Math.sin(Math.PI*nx),.62);
     const angle=nx*Math.PI*(family===0?3.3:family===1?4.3:family===2?5.3:6.3);
     const phase=(i*.27)+time*(.42+.065*family)*(playing?1:0);
     const wave=Math.sin(angle-phase)*.66+Math.sin(angle*.58+phase*.45+i*.38)*.34;
     const modulator=(.40+.65*focus)*(1+.33*mid+.35*attack+.24*beat);
     const y=cy+shift+wave*amp*modulator+Math.sin(nx*21+phase)*unit*.007*voice;
     if(x===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);
    }
    const alpha=clamp((.24+.31*sustain+.24*voice+.42*transient)*(.6+.4*power),.1,.93);
    ctx.globalAlpha=alpha;
    ctx.strokeStyle=hue;ctx.lineWidth=i%5===0?1.6:1.0;
    ctx.shadowBlur=12+12*transient;ctx.shadowColor=hue;ctx.stroke();
    ctx.shadowBlur=0;ctx.globalAlpha=1;
   }
   // Brighter spectral baseline and musical glints, no text or logo.
   ctx.beginPath();ctx.moveTo(0,cy);ctx.lineTo(w,cy);
   ctx.strokeStyle='rgba(113,242,255,'+(.26+.31*mid+.20*beat)*power+')';ctx.lineWidth=1.1;
   ctx.shadowColor='#46dbff';ctx.shadowBlur=10+8*beat;ctx.stroke();ctx.shadowBlur=0;
   for(let i=0;i<46;i++){
    const nx=((i*0.61803398875+.173)%1),ny=((i*.414213562+.619)%1);
    const e=s[i%12],a=tr[i%12];
    const twinkle=.14+e*.7+a*.9+high*.18;
    const x=nx*w,y=cy+(ny-.5)*unit*.95;
    ctx.beginPath();ctx.arc(x,y,.55+twinkle*.95,0,Math.PI*2);
    ctx.fillStyle=i%3===0?'#ff62cc':'#7bebff';ctx.globalAlpha=clamp(twinkle*power,0,.7);
    ctx.shadowColor=ctx.fillStyle;ctx.shadowBlur=7;ctx.fill();
   }
   ctx.shadowBlur=0;ctx.globalAlpha=1;
   if(playing&&!reduced)raf=requestAnimationFrame(paint);else raf=0;
  };
  raf=requestAnimationFrame(paint);
  return()=>{alive=false;cancelAnimationFrame(raf)};
 },[playing,reduced,background]);
 return <canvas ref={canvas} className="sonic-lines-canvas" aria-hidden="true"/>;
}
