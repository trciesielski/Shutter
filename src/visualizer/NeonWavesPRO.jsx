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
float glow(float d,float w){return exp(-pow(d/max(w,.00001),2.));}
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
void main(){
 vec2 p=(gl_FragCoord.xy-u_resolution*.5)/max(1.,min(u_resolution.x,u_resolution.y));
 float t=u_time*u_playing,amp=u_intensity;
 vec3 cyan=vec3(.025,.87,1.),pink=vec3(1.,.075,.72),orange=vec3(1.,.38,.12),violet=vec3(.52,.16,1.);
 vec3 c=vec3(0.);
 c+=violet*glow(length(p),.60)*(.025+.045*u_bass);
 // Multiple fine intertwined ribbons: vocal body changes shape; mids drive motion.
 for(int i=0;i<15;i++){
  float k=float(i),band=u_sustain[i%12],trans=u_transient[i%12];
  float phase=k*.31;
  float wave=.125*sin(p.x*(7.0+k*.085)+phase+t*(.42+k*.012))*(.34+.74*u_mid+.55*u_voice);
  wave+=.055*sin(p.x*(13.+k*.2)-t*.25+phase)*(u_high*.65+u_voiceAttack*.7+.20);
  float baseline=(k-7.)*.009;
  float y=p.y-baseline-wave;
  float e=glow(y,.0018+.0011*band);
  float fade=1.-smoothstep(.59,.82,abs(p.x));
  vec3 hue=mix(cyan,pink,smoothstep(0.,14.,k));
  hue=mix(hue,orange,.23*sin(k*1.2)*sin(k*1.2));
  float intensity=(.20+.9*band+1.4*trans+.35*u_flux)*amp;
  c+=hue*e*intensity*1.7*fade;
  c+=hue*glow(y,.012)*intensity*.17*fade;
 }
 // Symmetric 32-bin spectral columns, prominent attack while sustaining with music.
 for(int j=0;j<64;j++){
  float idx=float(j);
  float x=(idx-31.5)/63.*1.22;
  float bin=u_bins[j%32];
  float freq=u_sustain[j%12];
  float height=(.012+.33*pow(bin,.8)+.05*freq)*( .65+.35*u_beat);
  float bar=1.-smoothstep(.003,.007,abs(p.x-x));
  float body=smoothstep(0.,.006,abs(p.y))*(1.-smoothstep(height-.006,height+.006,abs(p.y)));
  vec3 hue=mix(cyan,pink,smoothstep(0.,63.,idx));
  hue=mix(hue,orange,smoothstep(38.,55.,idx)*.62);
  float light=bar*body*(.09+bin*1.5+u_beat*.30)*amp;
  c+=hue*light;
  c+=hue*glow(abs(p.x-x),.008)*body*light*.26;
 }
 // Spectral central baseline and sharp low-energy reflections.
 c+=mix(cyan,pink,.5+.5*sin(p.x*7.))*glow(p.y,.0018)*(.10+.26*u_mid)*amp*(1.-smoothstep(.49,.66,abs(p.x)));
 vec2 cell=floor(p*44.);
 float seed=hash(cell);
 float spark=glow(length(fract(p*44.)-.5),.10)*step(.987,seed);
 c+=mix(cyan,pink,seed)*spark*(.07+.38*u_high+.75*u_transient[11])*amp;
 c*=1.-smoothstep(.67,1.02,length(p))*.8;
 c=1.-exp(-c*1.25);
 fragColor=vec4(c,max(c.r,max(c.g,c.b)));
}`;
const compile=(gl,type,source)=>{const shader=gl.createShader(type);gl.shaderSource(shader,source);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS)){const message=gl.getShaderInfoLog(shader);gl.deleteShader(shader);throw Error(message)}return shader};
export default function NeonWavesPRO({bins=[],playing=false,intensity=65,onUnavailable,background=false,reduced=false}){
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
 return <canvas className="neon-waves-canvas" ref={canvas} aria-hidden="true"/>;
}
