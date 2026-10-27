import test from 'node:test';
import assert from 'node:assert/strict';
import {createNativeState, collectWebStorage, migrateLocalStorage} from '../src/native/nativeState.js';
import {createShutterMedia} from '../src/native/shutterMedia.js';

test('stale state event cannot replace newer snapshot', () => {
  const state=createNativeState();
  assert.equal(state.apply({schemaVersion:1,revision:5,state:'playing'}),true);
  assert.equal(state.apply({schemaVersion:1,revision:4,state:'paused'}),false);
  assert.equal(state.apply({schemaVersion:1,revision:5,state:'paused'}),false);
  assert.equal(state.apply({schemaVersion:1,revision:6,eventType:'analysisFrame',signalStatus:'unavailable'}),false);
  assert.equal(state.apply({schemaVersion:1,revision:5,state:'paused'}),false);
  assert.equal(state.snapshot.state,'playing');
});
test('non-state analysis cannot make a later connect snapshot stale',()=>{
  const state=createNativeState();
  for(const eventType of ['analysisFrame','error','position','queueChanged','metadataChanged','audioFocusChanged']){
    assert.equal(state.apply({schemaVersion:1,revision:9,eventType}),false);
  }
  assert.equal(state.apply({schemaVersion:1,revision:8,state:'paused'}),true);
  assert.equal(state.snapshot.state,'paused');
});
test('oversized migration rejection keeps the web marker absent for retry',async()=>{
  const data=new Map([['shutter-favorites','["track"]']]);
  const storage={getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value)};
  const native={migrateWebStorage:async()=>{throw Error('shutter-favorites: more than 5000 tracks; migration not committed')}};
  await assert.rejects(migrateLocalStorage(native,storage),/shutter-favorites: more than 5000 tracks/);
  assert.equal(data.has('shutter-native-migration-v1'),false);
});
test('migration reads raw keys, retries failed calls, and retains diagnostic report',async()=>{
  const data=new Map([['shutter-user-playlists-v1','[oops']]);
  const storage={getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value)};
  assert.equal(collectWebStorage(storage)['shutter-user-playlists-v1'],'[oops');
  let attempts=0;
  const native={migrateWebStorage:async()=>{if(++attempts===1)throw Error('offline');return {completed:true,diagnostics:['malformed']}}};
  await assert.rejects(migrateLocalStorage(native,storage));
  assert.equal(data.has('shutter-native-migration-v1'),false);
  assert.equal((await migrateLocalStorage(native,storage)).completed,true);
  assert.equal(attempts,2);
  assert.deepEqual(JSON.parse(data.get('shutter-native-migration-report-v1')).diagnostics,['malformed']);
});
test('web wrapper never calls native plugin',async()=>{
  let called=false;
  const media=createShutterMedia({platform:()=> 'web',register:()=>{called=true;return {play(){called=true}}}});
  await assert.rejects(media.play());
  assert.equal(called,false);
});
