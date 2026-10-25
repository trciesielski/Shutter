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
uniform float u_time;
uniform float u_intensity;
uniform float u_playing;
uniform float u_bins[32];
uniform float u_bass;
uniform float u_mid;
uniform float u_high;
uniform float u_beat;
uniform float u_sustain[8];
uniform float u_transient[8];
uniform float u_flux;
uniform float u_centroid;

#define PI 3.14159265359
float hash(float n){return fract(sin(n*127.1)*43758.5453);}
float band(float i){int k=int(clamp(floor(i),0.,31.));return u_bins[k];}
float line(float d,float w){return exp(-pow(d/max(.0002,w),2.));}
vec3 addGlow(vec3 base,vec3 color,float glow){return base+color*glow;}
void main(){
 vec2 uv=(gl_FragCoord.xy-.5*u_resolution)/max(1.,min(u_resolution.x,u_resolution.y));
 float aspect=u_resolution.x/u_resolution.y;
 float radius=length(uv);
 float a=atan(uv.y,uv.x);
 float angular=fract((a+PI)/(2.*PI));
 float speed=u_time*.08*u_playing;
 float power=u_intensity;
 float bass=u_bass,mid=u_mid,hi=u_high,beat=u_beat;
 float sub=u_sustain[0],kick=u_transient[1],vocals=u_sustain[4],presence=u_sustain[6];
 float movement=u_flux;
 vec3 magenta=vec3(1.,.08,.69),cyan=vec3(.035,.72,1.),purple=vec3(.52,.20,1.);
 vec3 c=vec3(.002,.004,.021);
 // Dark transparent atmosphere with bass-triggered illumination.
 c+=purple*(.018+.080*bass)*exp(-radius*4.)*power;
 c+=cyan*(.010+.036*mid)*exp(-length(uv-vec2(-.25,.17))*4.)*power;
 float ripple=.012*sin(8.*a+u_time*.42+mid*3.)*(.35+mid);
 float inner=.18+beat*.10+sub*.045+ripple*(.25+vocals*2.);
 float corona=exp(-pow((radius-inner)/.045,2.));
 c+=mix(magenta,cyan,.5+.5*sin(a*1.8))*corona*(.045+.36*beat+.12*mid)*power;
 float ring=line(radius-inner,.0025)+line(radius-inner,.013)*.30;
 c+=mix(magenta,cyan,smoothstep(-1.,1.,sin(a*2.+.5)))*ring*(.14+bass*.6+beat*2.2)*power;
 // Multi-layer segmented concentric rings, luminous but not constant bands.
 for(int i=0;i<5;i++){
  float f=float(i);
  float rr=.235+f*.053+beat*.05*(1.-f*.12)+u_sustain[i+1]*.042*sin(a*3.+f);
  float ix=mod(floor(angular*(58.+f*12.))+f*6.,32.);
  float energy=band(ix);
  float shifted=a+speed*(mod(f,2.)<1.?1.:-1.)*(1.+f*.2);
  float sectors=fract((shifted+PI)/(2.*PI)*(15.+f*7.));
  float gate=smoothstep(.08,.20,sectors)*(1.-smoothstep(.80,.94,sectors));
  float segment=line(radius-rr,.0026+energy*.006)*gate;
  vec3 hue=mix(magenta,cyan,.5+.5*sin(a*2.1+f*1.8));
  c+=hue*segment*(.045+energy*1.65+beat*1.55)*power;
  c+=hue*line(radius-rr,.017)*gate*(.045+energy*.48)*power;
  c+=hue*line(radius-rr,.037)*gate*(.009+energy*.14)*power;
 }
 // 128 radial spectral rays: actual frequency bins determine extension.
 float sectors=128.;
 float id=floor(angular*sectors);
 float local=abs(fract(angular*sectors)-.5);
 float e=band(mod(id,32.));
 float start=.46;
 float height=(.004+.25*pow(e,1.25))*(.45+.35*beat+.4*u_sustain[int(mod(id,8.))])*power;
 float extent=smoothstep(start-.008,start+.005,radius)*(1.-smoothstep(start+height-.006,start+height+.006,radius));
 float ray=1.-smoothstep(.10,.44,local);
 vec3 hue=mix(cyan,magenta,.5+.5*sin(a*1.5+.8));
 c+=hue*ray*extent*(.035+e*1.5+beat*.95)*power;
 c+=hue*ray*line(radius-start-height,.007)*(e*.85)*power;
 c+=hue*ray*extent*(.025+e*.32)*line(radius-start-height*.5,.055)*power;
 // Accent arclets made of thin sharp highlights with a restrained bloom skirt.
 for(int i=0;i<8;i++){
  float f=float(i);
  float rr=.30+f*.035;
  float aa=a+u_time*.085*u_playing*(mod(f,2.)<1.?1.:-1.);
  float arc=sin(aa*2.4+f*1.73);
  float mask=smoothstep(.64,.91,arc);
  float glow=line(radius-rr,.0035)*mask;
  float halo=line(radius-rr,.014)*mask*.23;
  c+=mix(magenta,cyan,mod(f,3.)/2.)*(glow+halo)*(.06+mid*.65+beat*1.8)*power;
 }
 // Spectral filaments: thin layered silk driven by midrange, voice and high transients.
 for(int j=0;j<9;j++){
  float f=float(j);
  float freq=band(mod(f*3.+floor(angular*18.),32.));
  float y0=(f-4.)*.008;
  float wave=.048*sin(uv.x*(8.+f*.42)+u_time*.32*u_playing+f*.42)*(vocals*1.35+mid*.45+.02)+.019*sin(uv.x*19.+f*.85+hi*3.)*(hi+.1);
  float yy=uv.y-y0-wave;
  float ribbon=line(yy,.0013)*(mid*.55+freq*.7+.045)+line(yy,.008)*(.04+freq*.12);
  float fade=smoothstep(.17,.46,abs(uv.x))*(1.-smoothstep(.83,1.2,abs(uv.x)));
  c+=mix(cyan,magenta,f/8.)*ribbon*fade*power*.85;
 }
 // Wave ribbons emerge from the music, with non-periodic variations from 32 FFT bins.
 for(int j=0;j<3;j++){
  float f=float(j);
  float wave=.07*sin(uv.x*(9.+f*2.)+u_time*.3*u_playing+f*1.9)*(mid+.12)+.027*sin(uv.x*21.+f*3.+hi*4.)*(hi+.08);
  float y=uv.y-(.06*(f-1.)+wave);
  float ribbon=line(y,.003)*(.20+mid*1.2)+line(y,.018)*(.03+mid*.22);
  float fade=smoothstep(.21,.48,abs(uv.x));
  c+=mix(cyan,magenta,f/2.)*ribbon*fade*power*.7;
 }
 // Audio transients illuminate radial streaks; no event means no burst.
 for(int j=0;j<18;j++){
  float f=float(j),angle=f*2.399963+u_time*.013*u_playing;
  float angDist=abs(atan(sin(a-angle),cos(a-angle)));
  float bandLevel=band(mod(f*7.,32.));
  float flare=line(angDist,.003+.004*bandLevel)*smoothstep(.22,.36,radius)*(1.-smoothstep(.66,.89,radius));
  c+=mix(cyan,magenta,mod(f,3.)/2.)*flare*(bandLevel*bandLevel*.62+beat*.18)*power;
 }
 // Sparse star dust reacts to treble rather than continuously moving.
 vec2 cell=floor(uv*52.);
 float rnd=hash(cell.x*73.+cell.y*19.);
 vec2 grid=fract(uv*52.)-.5;
 float spark=line(length(grid),.05)*(step(.993,rnd));
 c+=mix(cyan,magenta,rnd)*spark*(.02+hi*.45+u_transient[7]*2.5+presence*.75)*power;
 float vignette=1.-smoothstep(.53,1.12,radius);
 c*=vignette;
 // Filmic soft-knee highlight, preserve dark center.
 // Filmic bloom approximation: energy-dependent low-frequency halo stays behind crisp cores.
 float bloom=(.015+bass*.22+beat*.95)*power;
 c+=purple*bloom*exp(-pow((radius-.36)/.19,2.))*.21;
 c+=cyan*(hi*.16+mid*.035)*exp(-pow((radius-.48)/.12,2.))*power;
 c=1.-exp(-c*1.18);
 fragColor=vec4(c,1.);
}`;
const compile=(gl,type,source)=>{const shader=gl.createShader(type);gl.shaderSource(shader,source);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS)){const message=gl.getShaderInfoLog(shader);gl.deleteShader(shader);throw Error(message)}return shader};
export default function NeonSpectrum({bins=[],playing=false,intensity=65,onUnavailable,background=false,reduced=false}){
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
  }catch(error){console.warn('Neon Spectrum WebGL unavailable',error);onUnavailable?.();return}
  const uniform=name=>gl.getUniformLocation(program,name);
  const U={sustain:uniform('u_sustain[0]'),transient:uniform('u_transient[0]'),flux:uniform('u_flux'),centroid:uniform('u_centroid'),resolution:uniform('u_resolution'),time:uniform('u_time'),intensity:uniform('u_intensity'),playing:uniform('u_playing'),bins:uniform('u_bins[0]'),bass:uniform('u_bass'),mid:uniform('u_mid'),high:uniform('u_high'),beat:uniform('u_beat')};
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
   const bass=(dynamics.sustain[0]+dynamics.sustain[1]+dynamics.sustain[2])/3;
   const mid=(dynamics.sustain[3]+dynamics.sustain[4]+dynamics.sustain[5])/3;
   const high=(dynamics.sustain[6]+dynamics.sustain[7])/2;
   const visualBeat=dynamics.beat;
   gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);gl.useProgram(program);
   gl.uniform2f(U.resolution,w,h);gl.uniform1f(U.time,t/1000);gl.uniform1f(U.intensity,Math.max(.1,Math.min(1,inp.intensity/100)));
   gl.uniform1f(U.playing,inp.playing&&!inp.reduced?1:0);gl.uniform1fv(U.bins,smooth);
   gl.uniform1f(U.bass,bass);gl.uniform1f(U.mid,mid);gl.uniform1f(U.high,high);gl.uniform1f(U.beat,visualBeat);
   gl.uniform1fv(U.sustain,new Float32Array(dynamics.sustain));gl.uniform1fv(U.transient,new Float32Array(dynamics.transient));gl.uniform1f(U.flux,dynamics.flux);gl.uniform1f(U.centroid,features.centroid);
   gl.drawArrays(gl.TRIANGLES,0,6);
   if(inp.playing&&!inp.reduced)raf=requestAnimationFrame(render);else raf=0;
  };
  raf=requestAnimationFrame(render);
  return()=>{disposed=true;cancelAnimationFrame(raf);el.removeEventListener('webglcontextlost',contextLost);gl.deleteBuffer(buffer);gl.deleteProgram(program);gl.deleteShader(vert);gl.deleteShader(frag)};
 },[playing,reduced,background]);
 return <canvas className="neon-spectrum-canvas" ref={canvas} aria-hidden="true"/>;
}
