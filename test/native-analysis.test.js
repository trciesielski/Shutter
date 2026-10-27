import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createNativePlaybackAdapter} from '../src/audio/nativePlaybackAdapter.js';

function fakeMedia(){
 const listeners=new Map();
 const media={
  connect:async()=>({schemaVersion:1,eventType:'playbackState',revision:1,state:'paused',mediaId:null,positionMs:0,durationMs:-1,volume:.7,shuffle:false,repeat:'off',queue:[],queueIndex:0}),
  disconnect:async()=>{},
  addListener:async(name,fn)=>{listeners.set(name,fn);return {remove:async()=>listeners.delete(name)}}
 };
 return {media,listeners};
}

test('native analysis stays unavailable until a measured frame and maps it to eq',async()=>{
 const {media,listeners}=fakeMedia(),seen=[];
 const adapter=createNativePlaybackAdapter(media);
 await adapter.connect(value=>seen.push(value));
 assert.equal(adapter.snapshot.eq.available,false);
 assert.equal(adapter.snapshot.eq.signalStatus,'unavailable');
 listeners.get('analysisFrame')({schemaVersion:1,eventType:'analysisFrame',revision:2,signalStatus:'unavailable',bands:[]});
 assert.equal(adapter.snapshot.eq.available,false);

 const bands=Array.from({length:32},(_,i)=>i===4?140:i===5?-3:i);
 listeners.get('analysisFrame')({schemaVersion:1,eventType:'analysisFrame',revision:3,signalStatus:'active',bands,signalDebug:{context:'media3-pcm',rms:42,peak:100,maxBand:100}});
 assert.equal(adapter.snapshot.eq.available,true);
 assert.equal(adapter.snapshot.eq.ready,true);
 assert.equal(adapter.snapshot.eq.signalStatus,'active');
 assert.deepEqual(adapter.snapshot.eq.bins.slice(3,7),[3,100,0,6]);
 assert.deepEqual(adapter.snapshot.eq.signalDebug,{context:'media3-pcm',rms:42,peak:100,maxBand:100});
 assert.equal(seen.at(-1).signalStatus,'active');
});

test('stale native analysis cannot regress the latest visualizer frame',async()=>{
 const {media,listeners}=fakeMedia();
 const adapter=createNativePlaybackAdapter(media);
 await adapter.connect(()=>{});
 listeners.get('analysisFrame')({schemaVersion:1,eventType:'analysisFrame',revision:8,signalStatus:'active',bands:Array(32).fill(70),signalDebug:{context:'new'}});
 listeners.get('analysisFrame')({schemaVersion:1,eventType:'analysisFrame',revision:7,signalStatus:'unavailable',bands:[],signalDebug:null});
 assert.equal(adapter.snapshot.eq.signalStatus,'active');
 assert.deepEqual(adapter.snapshot.eq.bins,Array(32).fill(70));
 assert.deepEqual(adapter.snapshot.eq.signalDebug,{context:'new'});
});

test('native playback path keeps Web Audio out of the native engine',async()=>{
 const source=await readFile(new URL('../src/audio/useNativeAudioEngine.js',import.meta.url),'utf8');
 assert.doesNotMatch(source,/new\s+Audio\s*\(|AudioContext|OfflineAudioContext/);
 assert.match(source,/eq:.*snapshot\.eq/);
});
