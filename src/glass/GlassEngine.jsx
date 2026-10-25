import React, {useEffect,useRef,useState} from 'react';
import './glass-engine.css';

// A real GPU displacement shader over an engine-owned animated scene.
// Browser security/compositing does not expose arbitrary DOM pixels to WebGL.
const vertex = `attribute vec2 position;
varying vec2 vUv;
void main(){vUv=position*.5+.5;gl_Position=vec4(position,0.,1.);}`;
const fragment = `precision mediump float;
varying vec2 vUv;
uniform vec2 uResolution;
uniform float uTime;
uniform float uStrength;
uniform float uDark;
vec3 scene(vec2 uv){
  vec3 base=mix(vec3(.085,.065,.27),vec3(.14,.11,.42),uv.y);
  if(uDark<.5)base=mix(vec3(.80,.82,.96),vec3(.92,.90,.99),uv.y);
  vec2 g=uv-vec2(.77,.72);
  base+=vec3(.44,.13,.64)*exp(-dot(g,g)*7.);
  vec2 h=uv-vec2(.13,.26);
  base+=vec3(.05,.48,.63)*exp(-dot(h,h)*12.);
  float stripe=sin((uv.x+uv.y*.7)*24.+uTime*.28);
  base+=vec3(.17,.035,.30)*smoothstep(.65,.95,stripe)*.45;
  float diamond=abs(fract(uv.x*3.+uv.y*1.5)-.5);
  base+=vec3(.13,.04,.24)*smoothstep(.28,.5,diamond)*.25;
  return base;
}
vec3 glass(vec2 uv,vec2 center,vec2 radius,float shape){
  vec2 p=(uv-center)/radius;
  float dist=shape<.5?length(p):length(max(abs(p)-vec2(.60,.0),vec2(0.)))+min(max(abs(p).x-.60,abs(p).y),0.);
  float edge=1.-smoothstep(.80,1.01,dist);
  float rim=exp(-pow((dist-.92)*19.,2.));
  float lens=pow(max(0.,1.-dist*dist),.5);
  vec2 d=(normalize(p+vec2(.0001)))*(rim*.019 +lens*.008)*uStrength;
  vec3 color=scene(uv+d);
  color=mix(color,vec3(.92,.87,1.),.035*edge);
  color+=rim*vec3(.26,.23,.47);
  color+=edge*pow(max(0.,.85-p.y),3.)*vec3(.12,.10,.18);
  return mix(scene(uv),color,edge);
}
void main(){
 vec2 uv=vUv;
 vec3 col=scene(uv);
 vec2 px=vec2(1.)/uResolution;
 vec2 center=vec2(.50,.48);
 vec2 p=(uv-center)/vec2(.28,.34);
 float dist=length(p);
 float a=1.-smoothstep(.96,1.01,dist);
 vec2 refr=normalize(p+vec2(.0001))*(exp(-pow((dist-.88)*10.,2.))*.042 + (1.-dist)*.012)*uStrength;
 vec3 warped=scene(uv+refr);
 float highlight=exp(-pow((dist-.96)*22.,2.));
 warped+=highlight*vec3(.29,.23,.42);
 warped+=a*.035;
 col=mix(col,warped,a);
 gl_FragColor=vec4(col,1.);
}`;
function compile(gl,type,src){const shader=gl.createShader(type);gl.shaderSource(shader,src);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS)){console.warn(gl.getShaderInfoLog(shader));gl.deleteShader(shader);return null}return shader}
export default function GlassEngine(){
 const canvas=useRef(null), strengthRef=useRef(1),darkRef=useRef(1);
 const [strength,setStrength]=useState(1),[dark,setDark]=useState(true),[supported,setSupported]=useState(true);
 useEffect(()=>{strengthRef.current=strength},[strength]);
 useEffect(()=>{darkRef.current=dark?1:0},[dark]);
 useEffect(()=>{
  const el=canvas.current;if(!el)return;
  const gl=el.getContext('webgl',{alpha:false,antialias:true,powerPreference:'low-power'});
  if(!gl){setSupported(false);return}
  const vert=compile(gl,gl.VERTEX_SHADER,vertex),frag=compile(gl,gl.FRAGMENT_SHADER,fragment);
  if(!vert||!frag){setSupported(false);return}
  const program=gl.createProgram();gl.attachShader(program,vert);gl.attachShader(program,frag);gl.linkProgram(program);
  if(!gl.getProgramParameter(program,gl.LINK_STATUS)){setSupported(false);return}
  gl.useProgram(program);
  const buf=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buf);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
  const pos=gl.getAttribLocation(program,'position');gl.enableVertexAttribArray(pos);gl.vertexAttribPointer(pos,2,gl.FLOAT,false,0,0);
  const res=gl.getUniformLocation(program,'uResolution'),time=gl.getUniformLocation(program,'uTime'),amount=gl.getUniformLocation(program,'uStrength'),mode=gl.getUniformLocation(program,'uDark');
  let frame=0;const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;const start=performance.now();
  const render=()=>{
    const ratio=Math.min(window.devicePixelRatio||1,2);const w=Math.max(1,Math.round(el.clientWidth*ratio)),h=Math.max(1,Math.round(el.clientHeight*ratio));
    if(el.width!==w||el.height!==h){el.width=w;el.height=h;gl.viewport(0,0,w,h)}
    gl.uniform2f(res,w,h);gl.uniform1f(time,reduced?0:(performance.now()-start)/1000);
    gl.uniform1f(amount,strengthRef.current);gl.uniform1f(mode,darkRef.current);gl.drawArrays(gl.TRIANGLES,0,6);
    if(!reduced)frame=requestAnimationFrame(render);
  };
  render();if(reduced){const onRefresh=()=>render();el.addEventListener('glass-refresh',onRefresh);return()=>{el.removeEventListener('glass-refresh',onRefresh);gl.deleteProgram(program)}}
  return()=>{cancelAnimationFrame(frame);gl.deleteBuffer(buf);gl.deleteProgram(program);gl.deleteShader(vert);gl.deleteShader(frag)}
 },[]);
 useEffect(()=>{if(window.matchMedia('(prefers-reduced-motion: reduce)').matches)canvas.current?.dispatchEvent(new Event('glass-refresh'))},[strength,dark]);
 return <section className="glass-lab">
 <div className="glass-lab-heading"><span className="glass-kicker">SHUTTER GLASS ENGINE · WEBGL V1</span><h1>Optyczne szkło</h1><p>Podgląd refrakcji generowanej na GPU. To oddzielna scena testowa — nie zniekształca jeszcze elementów aplikacji znajdujących się pod odtwarzaczem.</p></div>
 <div className="glass-stage">
 <canvas ref={canvas} className="glass-canvas" role="img" aria-label="Wizualizacja szklanej soczewki z refrakcją na kolorowym tle"/>
 {!supported&&<div className="glass-unavailable">WebGL niedostępny na tym urządzeniu. Pozostaje standardowy efekt CSS.</div>}
 <div className="glass-center-icon">▶</div>
 <div className="glass-stage-caption">GPU REFRACTION / LIVE PREVIEW</div>
 </div>
 <div className="glass-config">
 <label htmlFor="glass-strength">Siła załamania: {Math.round(strength*100)}%</label><input id="glass-strength" type="range" min="0" max="2" step=".05" value={strength} onChange={e=>setStrength(Number(e.target.value))}/>
 <button onClick={()=>setDark(v=>!v)}>{dark?'Przełącz na jasne tło':'Przełącz na ciemne tło'}</button>
 </div>
 <p className="glass-footnote">Silnik WebGL działa na Androidzie, Windowsie i macOS w zgodnych przeglądarkach. Natywne widoki i interfejs samochodowy wymagają osobnych implementacji.</p>
 </section>
}
