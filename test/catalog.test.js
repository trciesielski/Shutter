import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolveCatalogConfig,validateCatalog,loadCatalog,resolveAssetUrl} from '../src/catalog/catalog.js';

const config=resolveCatalogConfig({},'https://music.example.test');
const json=(body,init={})=>new Response(typeof body==='string'?body:JSON.stringify(body),{status:200,headers:{'Content-Type':'application/json'},...init});

test('default config points at same-origin /music/ catalog',()=>{
 assert.equal(config.baseUrl,'https://music.example.test/music/');
 assert.equal(config.catalogUrl,'https://music.example.test/music/catalog/catalog.json');
 assert.deepEqual(config.allowedOrigins,['https://music.example.test']);
 const custom=resolveCatalogConfig({VITE_MUSIC_BASE_URL:'https://cdn.example.test/media',VITE_MUSIC_ALLOWED_ORIGINS:'https://img.example.test, nonsense'},'https://music.example.test');
 assert.equal(custom.catalogUrl,'https://cdn.example.test/media/catalog/catalog.json');
 assert.deepEqual(custom.allowedOrigins,['https://cdn.example.test','https://img.example.test']);
});

test('documented example catalog is valid and loads every track',async()=>{
 const example=JSON.parse(await readFile(new URL('../docs/catalog.example.json',import.meta.url),'utf8'));
 const result=validateCatalog(example,config);
 assert.equal(result.skipped.length,0);
 assert.equal(result.tracks.length,example.tracks.length);
 assert.ok(result.tracks.every(t=>t.url.startsWith('https://music.example.test/music/tracks/')));
});

test('public catalog loads, resolves relative paths and sorts by order',async()=>{
 const body={version:1,title:'SHUTTER',tracks:[
  {id:'b',title:'Second',artist:'A',audio:'tracks/b.mp3',cover:'covers/b.jpg',order:2,duration:181.5,year:2026,genre:'Ambient',lyrics:'line 1\r\nline 2',metadata:{bpm:120,__proto__x:1}},
  {id:'a',title:'First',audio:'tracks/a.mp3',order:1}
 ]};
 const result=await loadCatalog({...config,fetchImpl:async(url,init)=>{assert.equal(url,config.catalogUrl);assert.equal(init.credentials,'omit');assert.equal(init.method,'GET');return json(body)}});
 assert.equal(result.status,'ready');
 assert.deepEqual(result.tracks.map(t=>t.id),['a','b']);
 const b=result.tracks[1];
 assert.equal(b.url,'https://music.example.test/music/tracks/b.mp3');
 assert.equal(b.coverUrl,'https://music.example.test/music/covers/b.jpg');
 assert.equal(b.mimeType,'audio/mpeg');
 assert.equal(b.duration,181.5);assert.equal(b.year,2026);assert.equal(b.lyrics,'line 1\nline 2');
 assert.equal(result.tracks[0].artist,'Nieznany wykonawca');
 assert.equal(result.tracks[0].coverUrl,null);
});

test('validation rejects unsafe or invalid entries without failing the catalog',()=>{
 const {tracks,skipped}=validateCatalog({version:1,tracks:[
  {id:'ok',title:'<img src=x onerror=alert(1)>\u202E',audio:'tracks/ok.mp3',cover:'javascript:alert(1)',metadata:{constructor:'x',note:'n'}},
  {id:'ok',title:'Duplicate',audio:'tracks/dup.mp3'},
  {id:'../evil',title:'Bad id',audio:'tracks/x.mp3'},
  {id:'js',title:'Script',audio:'javascript:alert(1)'},
  {id:'data',title:'Data',audio:'data:audio/mpeg;base64,AAAA'},
  {id:'foreign',title:'Foreign',audio:'https://evil.example/x.mp3'},
  {id:'plain',title:'Plain http',audio:'http://music.example.test/music/tracks/x.mp3'},
  {id:'creds',title:'Credentials',audio:'https://u:p@music.example.test/music/tracks/x.mp3'},
  {id:'fmt',title:'Unknown format',audio:'tracks/file.exe'},
  {id:'notitle',audio:'tracks/n.mp3'},
  'string-entry',null
 ]},config);
 assert.equal(tracks.length,1);
 assert.equal(tracks[0].title,'<img src=x onerror=alert(1)>');
 assert.equal(tracks[0].coverUrl,null);
 assert.deepEqual(tracks[0].metadata,{note:'n'});
 assert.deepEqual(skipped.map(s=>s.reason),['duplicate-id','invalid-id','invalid-audio-url','invalid-audio-url','invalid-audio-url','invalid-audio-url','invalid-audio-url','unknown-audio-format','missing-title','invalid-entry','invalid-entry']);
 assert.equal(resolveAssetUrl('http://localhost:8788/music/tracks/a.mp3',{baseUrl:'http://localhost:8788/music/',allowedOrigins:['http://localhost:8788']}),'http://localhost:8788/music/tracks/a.mp3');
});

test('unsupported browser formats are skipped, MP3 kept',()=>{
 const {tracks,skipped}=validateCatalog({version:1,tracks:[{id:'m',title:'MP3',audio:'tracks/m.mp3'},{id:'f',title:'FLAC',audio:'tracks/f.flac'}]},{...config,canPlay:type=>type==='audio/mpeg'});
 assert.deepEqual(tracks.map(t=>t.id),['m']);
 assert.equal(skipped[0].reason,'unsupported-audio-format');
});

test('empty catalog is reported as empty, not as an error',async()=>{
 const result=await loadCatalog({...config,fetchImpl:async()=>json({version:1,tracks:[]})});
 assert.equal(result.status,'empty');assert.deepEqual(result.tracks,[]);assert.equal(result.error,null);
});

test('failed R2 requests produce a safe error state',async()=>{
 const http=await loadCatalog({...config,fetchImpl:async()=>json({error:'x'},{status:503})});
 assert.equal(http.status,'error');assert.equal(http.error.code,'http');assert.equal(http.error.status,503);
 const network=await loadCatalog({...config,fetchImpl:async()=>{throw new TypeError('Failed to fetch')}});
 assert.equal(network.error.code,'network');
 const invalid=await loadCatalog({...config,fetchImpl:async()=>json('<html>not json</html>')});
 assert.equal(invalid.error.code,'invalid');
 const version=await loadCatalog({...config,fetchImpl:async()=>json({version:2,tracks:[]})});
 assert.equal(version.error.code,'invalid');
 const large=await loadCatalog({...config,maxBytes:10,fetchImpl:async()=>json({version:1,tracks:[]})});
 assert.equal(large.error.code,'too-large');
});

test('slow catalog request times out',async()=>{
 const slow=(url,{signal})=>new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('aborted','AbortError'))));
 const result=await loadCatalog({...config,timeoutMs:30,fetchImpl:slow});
 assert.equal(result.status,'error');assert.equal(result.error.code,'timeout');
});
