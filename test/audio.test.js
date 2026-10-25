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
