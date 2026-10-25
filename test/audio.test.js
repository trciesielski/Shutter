import {spectralFeatures,updateVisualDynamics} from '../src/visualizer/audioDynamics.js';
import {spectrumBands,spectrumEnergy,pcmSpectrumBands} from '../src/audio/spectrumBands.js';
import {resolveVisualMode,VISUAL_MODES} from '../src/visualizer/modes.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {nextIndex,previousIndex,reordered,shuffledQueue} from '../src/audio/queueLogic.js';
import {extractMetadata} from '../src/audio/musicMetadata.js';
import {equalPowerCurves} from '../src/audio/crossfadeMath.js';
import {historyStats} from '../src/audio/listeningHistory.js';

test('sequential advances and stops at end',()=>{
 assert.equal(nextIndex({length:3,index:0}),1);
 assert.equal(nextIndex({length:3,index:2}),-1);
});
test('repeat all wraps and repeat one repeats only when ended',()=>{
 assert.equal(nextIndex({length:3,index:2,repeat:'all'},true),0);
 assert.equal(nextIndex({length:3,index:1,repeat:'one'},true),1);
 assert.equal(nextIndex({length:3,index:1,repeat:'one'},false),2);
});
test('shuffle never chooses current track when others exist',()=>{
 for(let i=0;i<100;i++)assert.notEqual(nextIndex({length:5,index:2,shuffle:true}),2);
});
test('queue can move tracks without loss',()=>{
 assert.deepEqual(reordered(['a','b','c'],'a','c'),['b','c','a']);
 assert.deepEqual(reordered(['a','b'],'x','a'),['a','b']);
 assert.equal(previousIndex({length:3,index:0}),0);
});
test('MP3 name fallback is safe',async()=>{
 const f=new File([new Uint8Array([0,1,2,3])],'My Song.mp3',{type:'audio/mpeg'});
 const out=await extractMetadata(f);
 assert.equal(out.title,'My Song');
});
test('ID3v2 title and artist are decoded',async()=>{
 const frame=(id,value)=>{const payload=Buffer.concat([Buffer.from([3]),Buffer.from(value)]);const h=Buffer.alloc(10);h.write(id,0,'ascii');h.writeUInt32BE(payload.length,4);return Buffer.concat([h,payload])};
 const body=Buffer.concat([frame('TIT2','Song'),frame('TPE1','Artist'),frame('TALB','Album')]);
 const header=Buffer.from([73,68,51,3,0,0,0,0,0,body.length]);
 const f=new File([Buffer.concat([header,body])],'untitled.mp3');
 const out=await extractMetadata(f);
 assert.equal(out.title,'Song');assert.equal(out.artist,'Artist');assert.equal(out.album,'Album');
});
test('history groups listens by id',()=>{
 assert.deepEqual(historyStats([{id:'a'},{id:'b'},{id:'a'}]),[['a',2],['b',1]]);
});

test('crossfade maintains approximately equal power at midpoint',()=>{
 const {fadeIn,fadeOut}=equalPowerCurves(129);
 assert.equal(fadeOut[0],1);assert.ok(fadeIn[0]<1e-6);
 assert.ok(Math.abs(fadeIn[64]**2+fadeOut[64]**2-1)<1e-5);
 assert.ok(fadeIn[128]>0.999);assert.ok(Math.abs(fadeOut[128])<1e-5);
});

test('shuffle changes visible order, keeps active first, and does not lose tracks',()=>{
 const ids=['a','b','c','d'];
 const mixed=shuffledQueue(ids,'b',()=>0);
 assert.equal(mixed[0],'b');
 assert.deepEqual([...mixed].sort(),[...ids].sort());
 assert.notDeepEqual(mixed,ids);
 assert.equal(nextIndex({length:mixed.length,index:0,repeat:'off'}),1);
});
test('repeat one and all respond to actual track end',()=>{
 assert.equal(nextIndex({length:4,index:2,repeat:'one'},true),2);
 assert.equal(nextIndex({length:4,index:3,repeat:'all'},true),0);
 assert.equal(nextIndex({length:4,index:3,repeat:'off'},true),-1);
});

test('visualizer auto picks cover, mirage or reduced motion minimal',()=>{
 assert.equal(resolveVisualMode('auto',true,false),'cover');
 assert.equal(resolveVisualMode('auto',false,false),'mirage');
 assert.equal(resolveVisualMode('auto',false,true),'minimal');
 assert.equal(resolveVisualMode('orb',false,true),'orb');
 assert.equal(resolveVisualMode('invalid',false,false),'minimal');
 assert.equal(new Set(VISUAL_MODES.map(v=>v[0])).size,VISUAL_MODES.length);
});

test('FFT bands remain silent for silence and respond to real frequencies',()=>{
 const zero=spectrumBands(new Uint8Array(512),44100);
 assert.equal(zero.length,32);
 assert.ok(zero.every(x=>x===0));
 const low=new Uint8Array(512);low[2]=255;low[3]=255;
 const high=new Uint8Array(512);high[180]=255;high[181]=255;
 const lo=spectrumEnergy(spectrumBands(low,44100));
 const hi=spectrumEnergy(spectrumBands(high,44100));
 assert.ok(lo.bass>lo.treble);
 assert.ok(hi.treble>hi.bass);
});

test('Neon Spectrum PRO remains an explicit selectable visualizer mode',()=>{
 assert.ok(VISUAL_MODES.some(([id])=>id==='neon'));
 assert.equal(resolveVisualMode('neon',false,false),'neon');
 assert.equal(resolveVisualMode('neon',false,true),'neon');
});

test('PCM fallback derives frequency energy from actual nonzero signal and zero from silence',()=>{
 const sampleRate=44100,n=2048;
 const silent=pcmSpectrumBands(new Float32Array(n),sampleRate);
 assert.ok(silent.every(v=>v===0));
 const samples=Float32Array.from({length:n},(_,i)=>.20*Math.sin(2*Math.PI*130*i/sampleRate));
 const live=pcmSpectrumBands(samples,sampleRate);
 assert.equal(live.length,32);
 assert.ok(live.some(v=>v>0),'measured PCM should produce nonzero bands');
 assert.ok(spectrumEnergy(live).bass>spectrumEnergy(live).treble,'130 Hz bass should dominate treble');
});

test('eight-band dynamics tracks sustain, transients and silence independently',()=>{
 const quiet=spectralFeatures(Array(32).fill(0));
 assert.equal(quiet.bands.length,8);
 assert.equal(quiet.flux,0);
 const kick=Array(32).fill(0);kick[5]=90;kick[6]=85;
 const first=spectralFeatures(kick,quiet.raw);
 assert.ok(first.flux>0);
 let state=updateVisualDynamics(null,first,85);
 assert.ok(state.beat>0);
 assert.ok(state.sustain[1]>0);
 const steady=spectralFeatures(kick,first.raw);
 state=updateVisualDynamics(state,steady,85);
 assert.equal(steady.flux,0);
 assert.ok(state.sustain[1]>0);
 for(let i=0;i<35;i++)state=updateVisualDynamics(state,quiet,85);
 assert.ok(state.beat<.05);
 assert.ok(state.sustain[1]<.05);
});
