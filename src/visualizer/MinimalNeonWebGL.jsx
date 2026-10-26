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
float glow(float x,float w){float z=x/max(w,.00001);return exp(-z*z);}
void main(){
 vec2 p=(gl_FragCoord.xy-.5*u_resolution)/max(1.,min(u_resolution.x,u_resolution.y));
 float x=p.x,y=p.y,ar=u_resolution.x/u_resolution.y;
 float beat=u_beat,amp=u_intensity;
 vec3 cyan=vec3(.035,.78,1.),pink=vec3(1.,.065,.72),purple=vec3(.40,.20,1.);
 vec3 c=vec3(.003,.004,.024);
 c+=purple*glow(length(p-vec2(-.26,-.17)),.47)*.046;
 c+=cyan*glow(length(p-vec2(.31,.16)),.40)*.019;
 // Mirrored bars, 32 direct independent FFT channels; stable geometry at rest.
 float index=floor((x+.45)/.90*32.);
 if(index>=0.&&index<32.){
  int i=int(index);
  float v=clamp(u_bins[i],0.,1.);
  float sustain=u_sustain[i*12/32];
  float hit=u_transient[i*12/32];
  float cell=fract((x+.45)/.90*32.);
  float column=1.-smoothstep(.28,.38,abs(cell-.5));
  float height=.006+pow(v,.85)*.175*amp*(1.+.21*beat+.14*hit);
  float ay=abs(y);
  float above=step(0.,y)*(1.-smoothstep(height-.002,height+.003,ay));
  float mirror=step(y,0.)*(1.-smoothstep(height*.45-.002,height*.49+.004,ay));
  float shape=column*(above+mirror*.23);
  float cold=step(.5,mod(float(i)*3.,7.)/7.);
  vec3 hue=mix(cyan,pink,cold);
  float strength=.47+.62*v+.26*hit;
  c+=hue*shape*strength*1.15;
  c+=hue*glow(abs(cell-.5),.32)*glow(ay-height*.54,.09)*v*.14;
  c+=hue*column*glow(ay-height,.013)*(.22+.56*v);
  c+=hue*column*glow(ay-height*.50,.095)*(.06+.22*v);
  c+=vec3(.78,.94,1.)*column*glow(y-height,.0025)*v*.50;
 }
 // Pin-sharp center line and compact localized bloom.
 c+=mix(cyan,pink,.5+.5*sin(x*11.))*glow(y,.00155)*(.26+.23*u_mid)*amp*(1.-smoothstep(.46,.51,abs(x)));
 c+=purple*glow(y,.025)*.045*(1.-smoothstep(.46,.53,abs(x)));
 c=1.-exp(-c*1.23);
 fragColor=vec4(c,1.);
}`;
const compile=(gl,type,source)=>{const shader=gl.createShader(type);gl.shaderSource(shader,source);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS)){const message=gl.getShaderInfoLog(shader);gl.deleteShader(shader);throw Error(message)}return shader};
export default function MinimalNeonWebGL({bins=[],playing=false,intensity=65,onUnavailable,background=false,reduced=false}){
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
  }catch(error){console.warn('Minimal Neon WebGL unavailable',error);onUnavailable?.();return}
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
 return <canvas className="minimal-neon-webgl-canvas" ref={canvas} aria-hidden="true"/>;
}
