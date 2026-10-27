import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolvePlatform,platformCapabilities,isNativeAndroid,PLATFORM,CAPABILITIES} from '../src/platform.js';

const read=path=>readFile(new URL(path,import.meta.url),'utf8');

test('platform defaults to read-only web when VITE_PLATFORM is missing or unknown',()=>{
 for(const value of [undefined,null,'','web','WEB','desktop','  ','production'])assert.equal(resolvePlatform(value),'web');
 assert.equal(resolvePlatform('mobile'),'mobile');
 assert.equal(resolvePlatform(' Mobile '),'mobile');
 assert.equal(PLATFORM,'web');
 assert.equal(CAPABILITIES.localImport,false);
});

test('web capabilities forbid import, deletion and local persistence',()=>{
 const web=platformCapabilities('web');
 assert.deepEqual({...web},{platform:'web',publicCatalog:true,localImport:false,localDelete:false,localPersistence:false});
 assert.ok(Object.isFrozen(web));
});

test('mobile capabilities preserve local import, deletion and IndexedDB library',async()=>{
 const mobile=platformCapabilities('mobile');
 assert.deepEqual({...mobile},{platform:'mobile',publicCatalog:false,localImport:true,localDelete:true,localPersistence:true});
 assert.match(await read('../.env.mobile'),/^VITE_PLATFORM=mobile$/m);
 const pkg=JSON.parse(await read('../package.json'));
 assert.match(pkg.scripts['build:mobile'],/--mode mobile/);
});

test('only a native Android Capacitor runtime disables the web audio engine',()=>{
 assert.equal(isNativeAndroid({isNativePlatform:()=>true,getPlatform:()=> 'android'}),true);
 assert.equal(isNativeAndroid({isNativePlatform:()=>false,getPlatform:()=> 'android'}),false);
 assert.equal(isNativeAndroid({isNativePlatform:()=>true,getPlatform:()=> 'ios'}),false);
 assert.equal(isNativeAndroid({isNativePlatform:()=>false,getPlatform:()=> 'web'}),false);
});

test('web import restrictions are enforced in the engine and UI, not by CSS',async()=>{
 const engine=await read('../src/audio/useAudioEngine.js');
 const main=await read('../src/main.jsx');
 const row=await read('../src/audio/LibraryTrack.jsx');
 assert.match(engine,/importFiles:capabilities\.localImport\?importFiles:null/);
 assert.match(engine,/remove:capabilities\.localDelete\?remove:null/);
 assert.match(engine,/const importFiles=async list=>\{\n  if\(!capabilities\.localImport\)return;/);
 assert.match(engine,/if\(!capabilities\.localDelete\|\|busy\.current\)return;/);
 assert.match(main,/:caps\.localImport\?<div className="local-import">/);
 assert.equal((main.match(/type="file"/g)||[]).length,1,'only one import input exists and it is gated by caps.localImport');
 assert.match(row,/\{onRemove&&<>/);
 assert.doesNotMatch(main+engine,/onDrop|ondrop|dataTransfer/);
});
