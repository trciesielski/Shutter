import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=file=>readFileSync(new URL('../src/visualizer/'+file,import.meta.url),'utf8');
const WEBGL=['NeonSpectrum.jsx','NeonPulse360.jsx','NeonWavesPRO.jsx','SonicWaves.jsx','MinimalNeonWebGL.jsx'];
const CANVAS2D=['MusicVisualizer.jsx','GlassShards.jsx','SonicLines.jsx','MinimalNeonSpectrum.jsx'];

for(const file of WEBGL){
 test(`${file}: WebGL output carries real alpha`,()=>{
  const src=read(file);
  assert.match(src,/getContext\('webgl2',\{alpha:true,premultipliedAlpha:true,/);
  assert.match(src,/clearColor\(0,0,0,0\)/);
  assert.doesNotMatch(src,/fragColor=vec4\([a-z]+,1\.\)/,'opaque fragment output');
  assert.match(src,/fragColor=vec4\((\w+),max\(\1\.r,max\(\1\.g,\1\.b\)\)\)/,'premultiplied alpha from brightest channel');
  assert.match(src,/vec3 (c|color)=vec3\(0\.\);/,'scene starts from transparent black, not a navy fill');
  assert.match(src,/(\w+)=1\.-exp\(-\1\*[\d.]+\);\s*fragColor/,'tonemapping keeps rgb <= 1 so premultiplied rgb never exceeds alpha');
 });
}

for(const file of CANVAS2D){
 test(`${file}: Canvas 2D clears to transparent each frame`,()=>{
  const src=read(file);
  assert.match(src,/getContext\('2d',\{alpha:true\}\)/);
  assert.match(src,/clearRect\(0,0,w,h\)/);
  for(const [,stop] of src.matchAll(/addColorStop\(1,'(rgba\([^']+\))'\)/g))assert.match(stop,/,0\)$/,`full-canvas gradients must fade to transparent: ${stop}`);
 });
}

test('visualizer CSS fades edges with a mask instead of painting --bg over the scene',()=>{
 const css=read('visualizer.css');
 assert.doesNotMatch(css,/\.music-visualizer \.visualizer-vignette\{background/);
 assert.doesNotMatch(css,/\.visualizer-scene-backdrop \.visualizer-vignette\{background/);
 assert.match(css,/\.music-visualizer \.visualizer-scene\{--vignette:\.75;-webkit-mask-image:linear-gradient/);
 assert.match(css,/\.visualizer-scene-backdrop\{-webkit-mask-image:radial-gradient/);
 assert.doesNotMatch(css,/\.music-visualizer\.mode-[a-z-]+ \.visualizer-vignette\{opacity/);
 assert.match(css,/\.music-visualizer\{border:0!important;border-radius:0!important;background:transparent!important/);
 for(const cls of ['neon-spectrum','glass-shards','neon-pulse','sonic-lines','neon-waves','sonic-waves','minimal-neon-spectrum','minimal-neon-webgl'])
  assert.match(css,new RegExp(`canvas\\.${cls}-canvas[^{]*\\{[^}]*pointer-events:none`),cls);
});
