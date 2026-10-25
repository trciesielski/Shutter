import React,{useEffect,useRef} from 'react';
import {spectralFeatures,updateVisualDynamics} from './audioDynamics.js';

// WebGL2 is optional: if unavailable the parent mounts its existing Canvas 2D renderer.
const VERT=`#version 300 es
in vec2 a_position;
out vec2 v_uv;
void main(){v_uv=a_position*.5+.5;gl_Position=vec4(a_position,0.,1.);}`;
const FRAG=`#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 fragColor;
uniform vec2 u_resolution;
uniform float u_time,u_intensity,u_playing,u_bass,u_mid,u_high,u_beat,u_flux,u_centroid,u_voice,u_voiceAttack;
uniform float u_bins[32],u_sustain[12],u_transient[12];
#define PI 3.14159265359
float gauss(float d,float w){float x=d/max(w,.0001);return exp(-x*x);}
float wrapAngle(float a){return fract(a/(2.*PI));}
float band(float x){return u_bins[int(mod(floor(x),32.))];}
void main(){
 vec2 uv=(gl_FragCoord.xy-.5*u_resolution)/max(1.,min(u_resolution.x,u_resolution.y));
 float r=length(uv),a=atan(uv.y,uv.x),t=u_time*u_playing;
 float amp=u_intensity,beat=u_beat,sub=u_sustain[0],kick=u_transient[2],voice=u_voice;
 vec3 pink=vec3(1.,.06,.38),hot=vec3(1.,.34,.18),gold=vec3(1.,.69,.35);
 vec3 violet=vec3(.51,.15,1.),blue=vec3(.075,.30,1.),cyan=vec3(.13,.79,1.);
 vec3 c=vec3(.012,.005,.048);
 // Rich atmospheric bloom framing the portal, with a visible luminous heart.
 c+=violet*(.12+.19*u_mid)*exp(-r*3.4);
 c+=blue*(.085+.12*u_high)*exp(-length(uv-vec2(-.30,-.25))*3.6);
 c+=pink*(.05+.20*beat)*exp(-length(uv-vec2(.3,.18))*4.);
 float heart=gauss(r,.077+beat*.015);
 c+=mix(pink,vec3(1.,.95,.77),exp(-r*35.))*heart*(1.3+beat*2.2);
 c+=pink*gauss(r,.16)*( .24+.30*voice);
 c+=violet*gauss(r-.12,.055)*(.13+.23*u_voiceAttack);
 // Multi-layer independent illuminated arcs. Every layer has its own 12-band movement.
 for(int i=0;i<12;i++){
  float k=float(i);
  float sustain=u_sustain[i],attack=u_transient[i];
  float rad=.128+k*.033+(beat*.016+sustain*.012)*(1.-k/16.);
  float angle=a+t*(mod(k,2.)<1.?1.:-1.)*(.10+.018*k)+k*1.41;
  float sector=fract(angle/(2.*PI)*(1.8+mod(k,4.)*.52));
  float cut=smoothstep(.055,.16,sector)*(1.-smoothstep(.79,.96,sector));
  float interruptions=smoothstep(.11,.25,sin(a*(4.+mod(k,3.)*2.)+k*1.43)*.5+.5);
  float mask=mix(cut,cut*interruptions,.21);
  float wobble=.0035*sin(a*(5.+mod(k,3.))+t*.45+k)*(.28+voice*1.9);
  float d=r-rad-wobble;
  float bright=(.32+1.15*sustain+1.9*attack+.6*beat)*mask*amp;
  vec3 hue=mix(pink,hot,smoothstep(.1,.9,fract(k*.29)));
  hue=mix(hue,cyan,step(8.,k)*.36);
  c+=hue*gauss(d,.0028+.002*sustain)*bright*2.8;
  c+=hue*gauss(d,.013)*bright*.61;
  c+=mix(violet,hue,.62)*gauss(d,.040)*bright*.16;
  float tip=gauss(sector-.16,.028)+gauss(sector-.79,.025);
  c+=vec3(1.,.94,.81)*gauss(d,.007)*tip*(.35+attack*2.2)*amp;
 }
 // Four bold asymmetric outer arcs, wide glow and blazing hot cores.
 for(int j=0;j<4;j++){
  float k=float(j),radius=.42+k*.045+beat*.019;
  float turn=a+t*(mod(k,2.)<1.?1.:-1.)*(.13+k*.05)+k*1.9;
  float phase=fract(turn/(2.*PI));
  float segment=smoothstep(.035,.115,phase)*(1.-smoothstep(.49+.07*mod(k,2.),.63+.07*mod(k,2.),phase));
  float d=r-radius;
  float strength=(.48+u_sustain[j*3]*.6+u_transient[j*3]*1.6+beat*.62)*amp*segment;
  vec3 hue=k<2.?mix(hot,pink,k*.7):mix(violet,blue,(k-2.)*.55);
  c+=hue*gauss(d,.006)*strength*3.6;
  c+=hue*gauss(d,.025)*strength*.85;
  c+=hue*gauss(d,.06)*strength*.20;
  c+=vec3(1.,.91,.78)*gauss(d,.003)*strength*1.7;
 }
 // Moving luminous dust; sparkle rate follows high frequencies rather than clock alone.
 vec2 cell=floor(uv*41.);
 float seed=fract(sin(dot(cell,vec2(127.1,311.7)))*43758.5453);
 vec2 local=fract(uv*41.)-.5;
 float star=gauss(length(local),.11)*step(.976,seed);
 float shimmer=.14+u_sustain[10]*1.1+u_transient[11]*2.2+u_flux*.6;
 c+=mix(cyan,pink,seed)*star*shimmer*amp;
 // Glossy bloom and gentle vignette; bright center is intentionally NOT a dark hole.
 c+=violet*gauss(r-.31,.21)*(.06+.10*u_mid);
 c*=1.-smoothstep(.68,1.10,r)*.78;
 c=1.-exp(-c*1.25);
 fragColor=vec4(c,1.);
}`;
const compile=(gl,type,source)=>{const shader=gl.createShader(type);gl.shaderSource(shader,source);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS)){const message=gl.getShaderInfoLog(shader);gl.deleteShader(shader);throw Error(message)}return shader};
export default function NeonPulse360({bins=[],playing=false,intensity=65,onUnavailable,background=false,reduced=false}){
 const canvas=useRef(null),inputs=useRef({});inputs.current={bins,playing,intensity,background,reduced};
 useEffect(()=>{
  const el=canvas.current;if(!el)return;
  const gl=el.getContext('webgl2',{alpha:true,antialias:false,powerPreference:'low-power'});
  if(!gl){onUnavailable?.();return}
  let vert,frag,program,buffer,raf=0,disposed=false,frame=0,last=0;
  try{
   vert=compile(gl,gl.VERTEX_SHADER,VERT);frag=compile(gl,gl.FRAGMENT_SHADER,FRAG);
   program=gl.createProgram();gl.attachShader(program,vert);gl.attachShader(program,frag);gl.linkProgram(program);
   if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));
   buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
   gl.useProgram(program);const at=gl.getAttribLocation(program,'a_position');gl.enableVertexAttribArray(at);gl.vertexAttribPointer(at,2,gl.FLOAT,false,0,0);
  }catch(error){console.warn('Neon Pulse 360 WebGL unavailable',error);onUnavailable?.();return}
  const uniform=name=>gl.getUniformLocation(program,name);
  const U={sustain:uniform('u_sustain[0]'),transient:uniform('u_transient[0]'),flux:uniform('u_flux'),centroid:uniform('u_centroid'),voice:uniform('u_voice'),voiceAttack:uniform('u_voiceAttack'),resolution:uniform('u_resolution'),time:uniform('u_time'),intensity:uniform('u_intensity'),playing:uniform('u_playing'),bins:uniform('u_bins[0]'),bass:uniform('u_bass'),mid:uniform('u_mid'),high:uniform('u_high'),beat:uniform('u_beat')};
  const smooth=new Float32Array(32);let dynamics=null;let previousRaw=null;
  const contextLost=e=>{e.preventDefault();cancelAnimationFrame(raf);onUnavailable?.()};
  el.addEventListener('webglcontextlost',contextLost,false);
  const render=t=>{
   if(disposed)return;
   const inp=inputs.current;const dt=Math.max(8,Math.min(70,t-last||16));last=t;
   const dpr=Math.min(window.devicePixelRatio||1,inp.background?1.3:1.6);
   const scale=inp.reduced?.65:1;const w=Math.max(1,Math.round(el.clientWidth*dpr*scale)),h=Math.max(1,Math.round(el.clientHeight*dpr*scale));
   if(el.width!==w||el.height!==h){el.width=w;el.height=h;gl.viewport(0,0,w,h)}
   const features=spectralFeatures(inp.playing?inp.bins:Array(32).fill(0),previousRaw);
   dynamics=updateVisualDynamics(dynamics,features,dt);
   previousRaw=features.raw;
   for(let i=0;i<32;i++)smooth[i]+=(features.raw[i]-smooth[i])*(1-Math.exp(-dt/(features.raw[i]>smooth[i]?45:135)));
   const bass=(dynamics.sustain[0]+dynamics.sustain[1]+dynamics.sustain[2]+dynamics.sustain[3])/4;
   const mid=(dynamics.sustain[4]+dynamics.sustain[5]+dynamics.sustain[6]+dynamics.sustain[7]+dynamics.sustain[8])/5;
   const high=(dynamics.sustain[9]+dynamics.sustain[10]+dynamics.sustain[11])/3;
   const visualBeat=dynamics.beat;
   gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);gl.useProgram(program);
   gl.uniform2f(U.resolution,w,h);gl.uniform1f(U.time,t/1000);gl.uniform1f(U.intensity,Math.max(.1,Math.min(1,inp.intensity/100)));
   gl.uniform1f(U.playing,inp.playing&&!inp.reduced?1:0);gl.uniform1fv(U.bins,smooth);
   gl.uniform1f(U.bass,bass);gl.uniform1f(U.mid,mid);gl.uniform1f(U.high,high);gl.uniform1f(U.beat,visualBeat);
   gl.uniform1fv(U.sustain,new Float32Array(dynamics.sustain));gl.uniform1fv(U.transient,new Float32Array(dynamics.transient));gl.uniform1f(U.flux,dynamics.flux);gl.uniform1f(U.centroid,features.centroid);gl.uniform1f(U.voice,dynamics.voiceSustain);gl.uniform1f(U.voiceAttack,dynamics.voiceTransient);
   gl.drawArrays(gl.TRIANGLES,0,6);
   if(inp.playing&&!inp.reduced)raf=requestAnimationFrame(render);else raf=0;
  };
  raf=requestAnimationFrame(render);
  return()=>{disposed=true;cancelAnimationFrame(raf);el.removeEventListener('webglcontextlost',contextLost);gl.deleteBuffer(buffer);gl.deleteProgram(program);gl.deleteShader(vert);gl.deleteShader(frag)};
 },[playing,reduced,background]);
 return <canvas className="neon-pulse-canvas" ref={canvas} aria-hidden="true"/>;
}
