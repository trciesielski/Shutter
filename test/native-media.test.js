import test from 'node:test';
import assert from 'node:assert/strict';
import {createNativeState, collectWebStorage, migrateLocalStorage} from '../src/native/nativeState.js';
import {createShutterMedia} from '../src/native/shutterMedia.js';

test('stale state event cannot replace newer snapshot', () => {
  const state=createNativeState();
  assert.equal(state.apply({schemaVersion:1,revision:5,state:'playing'}),true);
  assert.equal(state.apply({schemaVersion:1,revision:4,state:'paused'}),false);
  assert.equal(state.snapshot.state,'playing');
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
