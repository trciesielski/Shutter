import test from 'node:test';
import assert from 'node:assert/strict';
import {handleMediaRequest,objectKey,parseRange,publicPrefixes} from '../server/r2PublicMedia.js';
import {onRequest} from '../functions/music/[[path]].js';

function bucket(objects){
 const calls=[];
 const meta=key=>({key,size:objects[key].length,httpEtag:'"etag-'+key+'"',uploaded:new Date('2026-10-01T00:00:00Z')});
 return {calls,
  head:async key=>{calls.push(['head',key]);return objects[key]?meta(key):null},
  get:async(key,options)=>{calls.push(['get',key,options]);if(!objects[key])return null;const b=objects[key];const r=options?.range;return {...meta(key),body:r?b.slice(r.offset,r.offset+r.length):b}},
  put:async()=>{throw new Error('put must never be called')},delete:async()=>{throw new Error('delete must never be called')},list:async()=>{throw new Error('list must never be called')}};
}
const data=new Uint8Array(Array.from({length:100},(_,i)=>i));
const call=(method,path,headers={},env)=>handleMediaRequest({request:new Request('https://x.test/music/'+path.join('/'),{method,headers}),env:env??{MUSIC_BUCKET:bucket({'tracks/a.mp3':data,'catalog/catalog.json':new TextEncoder().encode('{}'),'covers/c.jpg':data})},params:{path}});

test('only GET and HEAD are allowed; mutations are rejected',async()=>{
 for(const method of ['PUT','POST','DELETE','PATCH','OPTIONS']){
  const res=await call(method,['tracks','a.mp3']);
  assert.equal(res.status,405,method);assert.equal(res.headers.get('Allow'),'GET, HEAD');
 }
});

test('full GET serves audio with correct type and range support',async()=>{
 const res=await call('GET',['tracks','a.mp3']);
 assert.equal(res.status,200);
 assert.equal(res.headers.get('Content-Type'),'audio/mpeg');
 assert.equal(res.headers.get('Accept-Ranges'),'bytes');
 assert.equal(res.headers.get('Content-Length'),'100');
 assert.equal(res.headers.get('X-Content-Type-Options'),'nosniff');
 assert.equal((await res.arrayBuffer()).byteLength,100);
 const json=await call('GET',['catalog','catalog.json']);
 assert.equal(json.headers.get('Content-Type'),'application/json; charset=utf-8');
 assert.equal(json.headers.get('Cache-Control'),'no-cache');
 assert.equal((await call('GET',['covers','c.jpg'])).headers.get('Content-Type'),'image/jpeg');
});

test('range requests return 206 with Content-Range for seeking',async()=>{
 const res=await call('GET',['tracks','a.mp3'],{Range:'bytes=10-19'});
 assert.equal(res.status,206);
 assert.equal(res.headers.get('Content-Range'),'bytes 10-19/100');
 assert.deepEqual([...new Uint8Array(await res.arrayBuffer())],[10,11,12,13,14,15,16,17,18,19]);
 const open=await call('GET',['tracks','a.mp3'],{Range:'bytes=90-'});
 assert.equal(open.headers.get('Content-Range'),'bytes 90-99/100');
 const suffix=await call('GET',['tracks','a.mp3'],{Range:'bytes=-5'});
 assert.equal(suffix.headers.get('Content-Range'),'bytes 95-99/100');
 const bad=await call('GET',['tracks','a.mp3'],{Range:'bytes=500-'});
 assert.equal(bad.status,416);assert.equal(bad.headers.get('Content-Range'),'bytes */100');
 const head=await call('HEAD',['tracks','a.mp3']);
 assert.equal(head.status,200);assert.equal(head.headers.get('Content-Length'),'100');assert.equal(head.body,null);
 const cached=await call('GET',['tracks','a.mp3'],{'If-None-Match':'"etag-tracks/a.mp3"'});
 assert.equal(cached.status,304);
});

test('keys outside public prefixes, traversal and unknown types are not served',async()=>{
 assert.equal(objectKey(['tracks','..','secret.mp3']),null);
 assert.equal(objectKey(['private','a.mp3']),null);
 assert.equal(objectKey(['tracks','page.html']),null);
 assert.equal(objectKey(['covers','logo.svg']),null);
 assert.equal(objectKey(['tracks','a\\b.mp3']),null);
 assert.equal(objectKey([]),null);
 assert.equal(objectKey(['tracks','album 1','a.mp3']),'tracks/album 1/a.mp3');
 assert.deepEqual(publicPrefixes('music, audio/'),['music/','audio/']);
 assert.deepEqual(publicPrefixes(''),['tracks/','covers/','catalog/']);
 assert.equal((await call('GET',['private','a.mp3'])).status,404);
 assert.equal((await call('GET',['tracks','missing.mp3'])).status,404);
 assert.equal(parseRange('bytes=0-1,5-6',100),null);
});

test('missing R2 binding returns 503 instead of crashing; Pages route delegates to handler',async()=>{
 const res=await call('GET',['tracks','a.mp3'],{},{});
 assert.equal(res.status,503);
 assert.equal((await res.json()).error,'music_storage_not_configured');
 const viaRoute=await onRequest({request:new Request('https://x.test/music/tracks/a.mp3',{method:'DELETE'}),env:{},params:{path:['tracks','a.mp3']}});
 assert.equal(viaRoute.status,405);
});
