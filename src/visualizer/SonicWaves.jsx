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
float glow(float d,float w){float z=d/max(.0001,w);return exp(-z*z);}
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
void main(){
 vec2 p=(gl_FragCoord.xy-u_resolution*.5)/max(1.,min(u_resolution.x,u_resolution.y));
 float x=p.x,y=p.y,t=u_time*u_playing,amp=u_intensity,beat=u_beat;
 vec3 cyan=vec3(.03,.78,1.),pink=vec3(1.,.07,.73),violet=vec3(.56,.20,1.),orange=vec3(1.,.38,.10);
 vec3 c=vec3(0.);
 // Clean sound-wave horizon: vocals move the wave contours, twelve bands animate independently.
 float bass=(u_sustain[0]+u_sustain[1]+u_sustain[2]+u_sustain[3])*.25;
 float vocal=u_voice,treble=u_high;
 float horizon=glow(y,.0018);
 c+=mix(cyan,pink,.5+.5*sin(x*3.))*horizon*(.28+.4*vocal)*amp;
 for(int i=0;i<16;i++){
  float k=float(i),band=u_sustain[i%12],onset=u_transient[i%12];
  float phase=x*(9.+mod(k,5.)*.65)+t*(.30+mod(k,4.)*.07)+k*.28;
  float envelope=(.022+.21*band+.07*vocal+.10*beat)*amp;
  float wave=sin(phase)*envelope+sin(x*17.+k*.52-t*.22)*(.008+.03*u_sustain[(i+4)%12]);
  float offset=(k-7.5)*.0105;
  float d=y-(offset+wave);
  vec3 hue=mod(k,4.)<1.?cyan:mod(k,4.)<2.?violet:mod(k,4.)<3.?pink:orange;
  float intensity=(.24+.65*band+1.15*onset)*amp;
  c+=hue*glow(d,.0017)*intensity*1.85;
  c+=hue*glow(d,.010)*intensity*.32;
  c+=hue*glow(d,.027)*intensity*.07;
 }
 // 32 mirrored audio bars, never a fixed decorative equalizer.
 float slot=floor((x+.5)*32.);
 float idx=clamp(slot,0.,31.);
 float level=u_bins[int(idx)]*.26*amp;
 float side=abs(fract((x+.5)*32.)-.5);
 float widthMask=1.-smoothstep(.26,.42,side);
 float barMask=smoothstep(0.,.003,abs(y))*(1.-smoothstep(max(.006,level-.006),max(.009,level),abs(y)));
 float bar=widthMask*barMask*step(0.,slot)*step(slot,31.);
 float tint=idx/31.;
 vec3 barColor=mix(cyan,pink,tint);
 barColor=mix(barColor,orange,smoothstep(.62,.95,tint)*.5);
 c+=barColor*bar*(.28+.6*u_bins[int(idx)])*amp;
 c+=barColor*glow(abs(y)-level,.008)*bar*.18;
 // Thin dimensional grid behind the signal.
 float gx=glow(fract(x*24.)-.5,.018),gy=glow(fract(y*24.)-.5,.018);
 c+=cyan*(gx+gy)*.009*glow(y,.47);
 // Treble-driven points, only light up with actual audio.
 vec2 cell=floor(p*51.);
 float rnd=hash(cell),dotShape=glow(length(fract(p*51.)-.5),.09)*step(.978,rnd);
 c+=mix(cyan,pink,rnd)*dotShape*(.045+.9*treble+1.5*u_transient[11])*amp;
 c+=violet*glow(y,.25)*(.018+.045*u_mid);
 c*=1.-smoothstep(.65,1.0,length(p))*.7;
 c=1.-exp(-c*1.15);
 fragColor=vec4(c,max(c.r,max(c.g,c.b)));
}`;
const compile=(gl,type,source)=>{const shader=gl.createShader(type);gl.shaderSource(shader,source);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS)){const message=gl.getShaderInfoLog(shader);gl.deleteShader(shader);throw Error(message)}return shader};
export default function SonicWaves({bins=[],playing=false,intensity=65,onUnavailable,background=false,reduced=false}){
 const canvas=useRef(null),inputs=useRef({});inputs.current={bins,playing,intensity,background,reduced};
 useEffect(()=>{
  const el=canvas.current;if(!el)return;
  const gl=el.getContext('webgl2',{alpha:true,premultipliedAlpha:true,antialias:false,powerPreference:'low-power'});
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
 return <canvas className="sonic-waves-canvas" ref={canvas} aria-hidden="true"/>;
}
