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
float glow(float d,float width){float x=d/max(width,.00001);return exp(-x*x);}
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
void main(){
 // Normalized using viewport width/height separately so the circular artwork stays centered.
 vec2 p=(gl_FragCoord.xy-u_resolution*.5)/min(u_resolution.x,u_resolution.y);
 // 0.73 keeps outer arcs within the available frame, especially on Android.
 p*=1.26;
 float r=length(p),a=atan(p.y,p.x);
 float t=u_time*u_playing,amp=u_intensity,beat=u_beat;
 vec3 pink=vec3(1.,.04,.39),orange=vec3(1.,.30,.065),gold=vec3(1.,.61,.18);
 vec3 violet=vec3(.45,.12,1.),blue=vec3(.045,.24,1.),cyan=vec3(.025,.73,1.);
 vec3 color=vec3(.008,.005,.036);
 // Dark negative space between the arc tracks; keep atmospheric glow restrained.
 color+=violet*glow(r-.36,.42)*(.038+.035*u_mid);
 color+=blue*glow(length(p-vec2(-.28,-.19)),.39)*(.028+.045*u_high);
 // Radiant center without dark hole, but small enough to preserve ring definition.
 color+=pink*glow(r,.093)*(.27+.23*u_voice);
 color+=violet*glow(r,.065)*(.35+.28*beat);
 color+=vec3(1.,.76,.58)*glow(r,.024)*(.65+.8*beat);
 color+=vec3(1.,.94,.82)*glow(r,.009)*(.5+.32*beat);
 // Short, separated arc tracks, with individual audio control and alternating chroma.
 for(int i=0;i<12;i++){
  float k=float(i);
  float sustain=u_sustain[i],hit=u_transient[i];
  float rad=.13+k*.027+beat*.008*(1.-k/15.);
  float spin=t*(mod(k,2.)<1.?1.:-1.)*(.12+.012*k);
  float sector=fract((a+spin+k*.77)/(2.*PI));
  // Per-track arc 45-115 degrees, leaving substantial true darkness around it.
  float start=fract(k*.183+.06);
  float dArc=fract(sector-start+1.);
  float lengthArc=.15+.12*fract(k*.29);
  float cut=smoothstep(.0,.022,dArc)*(1.-smoothstep(lengthArc-.022,lengthArc,dArc));
  // Occasional second, thinner segment on selected rings.
  float second=step(0.5,fract(k*.37))*smoothstep(.0,.018,fract(dArc+.49))*(1.-smoothstep(.075,.095,fract(dArc+.49)))*.47;
  float mask=max(cut,second);
  float displacement=.0025*sin(a*5.+t*.25+k)*(.2+u_voice*.75);
  float d=r-rad-displacement;
  vec3 hue=mod(k,5.)<1.?cyan:mod(k,5.)<2.?violet:mod(k,5.)<3.?pink:mod(k,5.)<4.?orange:gold;
  float strength=mask*(.33+.65*sustain+.9*hit+.26*beat)*amp;
  color+=hue*glow(d,.0031)*strength*2.1;
  color+=hue*glow(d,.012)*strength*.29;
  color+=hue*glow(d,.026)*strength*.055;
  float tip=glow(dArc-.022,.012)+glow(dArc-lengthArc+.02,.014);
  color+=vec3(1.,.85,.72)*glow(d,.004)*tip*(.24+.55*hit)*amp;
 }
 // A few deliberately broad asymmetric signature curves in warm, magenta, and blue.
 for(int i=0;i<4;i++){
  float k=float(i),rad=.455+k*.041+beat*.008;
  float turn=fract((a+t*(mod(k,2.)<1.?1.:-1.)*(.09+k*.017)+k*1.64)/(2.*PI));
  float portion=fract(turn+(.17*k));
  float mask=smoothstep(.0,.025,portion)*(1.-smoothstep(.20+.035*mod(k,2.),.24+.035*mod(k,2.),portion));
  float d=r-rad;
  vec3 hue=i==0?orange:i==1?pink:i==2?cyan:blue;
  float strength=mask*(.56+.53*u_sustain[i*3]+.85*u_transient[i*3]+.28*beat)*amp;
  color+=hue*glow(d,.005)*strength*2.0;
  color+=hue*glow(d,.014)*strength*.30;
  color+=hue*glow(d,.034)*strength*.05;
  color+=vec3(1.,.79,.65)*glow(d,.0025)*strength*.65;
 }
 // Small isolated musical highlights; spectral treble affects twinkle.
 vec2 cell=floor(p*46.);
 float rnd=hash(cell),star=glow(length(fract(p*46.)-.5),.10)*step(.984,rnd);
 color+=mix(cyan,pink,rnd)*star*(.12+.58*u_sustain[10]+.95*u_transient[11])*.72*amp;
 // Exponential tonemapping prevents broad white smears.
 color=1.-exp(-color*1.09);
 fragColor=vec4(color,1.);
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
