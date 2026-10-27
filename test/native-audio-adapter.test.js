import test from 'node:test';
import assert from 'node:assert/strict';
import {createNativePlaybackAdapter} from '../src/audio/nativePlaybackAdapter.js';
import {SHUTTER_MEDIA_EVENTS} from '../src/native/shutterMedia.js';
import {startNativePlayback} from '../src/audio/useNativeAudioEngine.js';

function fakeMedia(){
 const listeners=new Map(),calls=[];
 const media={connect:async()=>({schemaVersion:1,eventType:'playbackState',revision:4,state:'playing',mediaId:'a',positionMs:2500,durationMs:12000,volume:.6,shuffle:true,repeat:'one',queue:['a'],queueIndex:0}),disconnect:async()=>{calls.push(['disconnect'])},addListener:async(name,fn)=>{listeners.set(name,fn);return {remove:async()=>{listeners.delete(name)}}}};
 for(const name of ['play','pause','toggle','stop','skipNext','skipPrevious','seekTo','setVolume','setQueue','playItem','setShuffle','setRepeat','getCatalog','getLibrary','pickLocalFiles','removeLocalTrack'])media[name]=async arg=>{calls.push([name,arg]);return {schemaVersion:1,tracks:[]}};
 return {media,listeners,calls};
}
test('connect maps snapshot and subscribes to every plugin event; stale state cannot regress it',async()=>{
 const {media,listeners,calls}=fakeMedia(),seen=[];
 const adapter=createNativePlaybackAdapter(media);
 const cleanup=await adapter.connect(s=>seen.push(s));
 assert.deepEqual([...listeners.keys()],SHUTTER_MEDIA_EVENTS);
 assert.equal(adapter.snapshot.state,'playing');
 assert.equal(adapter.snapshot.seconds,2.5);
 assert.equal(adapter.snapshot.duration,12);
 assert.deepEqual(adapter.snapshot.queueIds,['a']);
 listeners.get('analysisFrame')({revision:100,signalStatus:'unavailable'});
 listeners.get('error')({revision:101,message:'offline'});
 listeners.get('playbackState')({schemaVersion:1,eventType:'playbackState',revision:4,state:'paused'});
 assert.equal(adapter.snapshot.state,'playing');
 listeners.get('playbackState')({schemaVersion:1,eventType:'playbackState',revision:5,state:'paused'});
 assert.equal(adapter.snapshot.state,'paused');
 assert.equal(adapter.snapshot.error,'offline');
 await cleanup();await cleanup();
 assert.equal(listeners.size,0);
 assert.deepEqual(calls,[['disconnect']]);
 assert.ok(seen.length>=3);
});
test('native commands use the plugin payload contract and preserve track URIs',async()=>{
 const {media,calls}=fakeMedia();
 media.getCatalog=async()=>({tracks:[{id:'a',source:'catalog',title:'A',artist:'B',album:'C',durationMs:9000,artworkUri:'https://art',uri:'https://media'}]});
 const adapter=createNativePlaybackAdapter(media);
 await adapter.connect(()=>{});
 await adapter.refreshLibrary();
 assert.deepEqual(adapter.snapshot.files[0],{id:'a',source:'catalog',title:'A',artist:'B',album:'C',durationMs:9000,duration:9,artworkUri:'https://art',uri:'https://media',coverUrl:'https://art',url:'https://media'});
 await adapter.select(0);await adapter.seek(50);await adapter.setGain(.4);await adapter.loadQueue(['a']);await adapter.toggleShuffle();await adapter.cycleRepeat();await adapter.importFiles();await adapter.remove('a');
 assert.deepEqual(calls.filter(x=>x[0]!=='getLibrary'),[['playItem',{trackId:'a'}],['seekTo',{positionMs:6000}],['setVolume',{value:.4}],['setQueue',{trackIds:['a'],startIndex:0}],['setShuffle',{enabled:false}],['setRepeat',{mode:'off'}],['pickLocalFiles',{}],['removeLocalTrack',{trackId:'a'}]]);
});
test('startup migrates approved storage before native hydration and retries incomplete migration',async()=>{
 const calls=[],raw=new Map([['shutter-user-playlists-v1','raw']]);
 const storage={getItem:key=>raw.get(key)??null,setItem:(key,value)=>raw.set(key,value)};
 const media={migrateWebStorage:async ({payload})=>{calls.push('migrate');assert.equal(payload['shutter-user-playlists-v1'],'raw');return calls.filter(x=>x==='migrate').length===1?{completed:false}:{completed:true}}};
 const adapter={connect:async()=>{calls.push('connect');return async()=>{}},refreshLibrary:async()=>{calls.push('hydrate')}};
 const boot=await startNativePlayback(adapter,media,storage,()=>{});
 assert.deepEqual(calls,['connect','migrate','hydrate']);
 assert.equal(boot.migrationCompleted,false);
 assert.equal(raw.get('shutter-user-playlists-v1'),'raw');
 await boot.retry();
 assert.deepEqual(calls,['connect','migrate','hydrate','migrate','hydrate']);
 assert.equal(raw.get('shutter-native-migration-v1'),'1');
});
test('selecting an item in a native queue preserves that queue',async()=>{
 const {media,calls}=fakeMedia();
 let revision=4;
 media.setQueue=async arg=>{calls.push(['setQueue',arg]);return {schemaVersion:1,eventType:'playbackState',revision:++revision,state:'paused',mediaId:arg.trackIds[arg.startIndex],positionMs:0,durationMs:9000,volume:.7,shuffle:false,repeat:'off',queue:arg.trackIds,queueIndex:arg.startIndex}};
 media.getCatalog=async()=>({tracks:[{id:'a',source:'catalog',title:'A',uri:'https://a'},{id:'b',source:'catalog',title:'B',uri:'https://b'}]});
 const adapter=createNativePlaybackAdapter(media);await adapter.connect(()=>{});await adapter.refreshLibrary();
 await adapter.loadQueue(['a','b']);await adapter.select(1);
 assert.deepEqual(calls.filter(x=>['setQueue','play','playItem'].includes(x[0])),[['setQueue',{trackIds:['a','b'],startIndex:0}],['setQueue',{trackIds:['a','b'],startIndex:1}],['play',{}]]);
});
test('native catalog notification does not recursively refetch itself and hydration waits for migration',async()=>{
 const {media,listeners}=fakeMedia();let loads=0;
 media.getCatalog=async()=>{loads++;listeners.get('catalogChanged')?.({tracks:[]});return {tracks:[]}};
 const adapter=createNativePlaybackAdapter(media);await adapter.connect(()=>{});
 listeners.get('libraryChanged')({imported:1});
 assert.equal(loads,0);
 await adapter.refreshLibrary();
 assert.equal(loads,1);
});
test('reconnect removes the first subscription before installing another',async()=>{
 const {media,listeners,calls}=fakeMedia();const adapter=createNativePlaybackAdapter(media);
 const first=await adapter.connect(()=>{});const second=await adapter.connect(()=>{});
 assert.equal(listeners.size,SHUTTER_MEDIA_EVENTS.length);
 assert.deepEqual(calls,[['disconnect']]);
 await first();await second();
 assert.deepEqual(calls,[['disconnect'],['disconnect']]);
});
test('queue edits keep the playing item as the native start index',async()=>{
 const {media,calls}=fakeMedia();
 media.connect=async()=>({schemaVersion:1,eventType:'playbackState',revision:4,state:'playing',mediaId:'b',positionMs:3500,durationMs:9000,volume:.7,shuffle:false,repeat:'off',queue:['a','b','c'],queueIndex:1});
 media.getCatalog=async()=>({tracks:['a','b','c'].map(id=>({id,title:id,source:'catalog',uri:`https://${id}`}))});
 let revision=4;media.setQueue=async arg=>{calls.push(['setQueue',arg]);return {schemaVersion:1,eventType:'playbackState',revision:++revision,state:'playing',mediaId:arg.trackIds[arg.startIndex],positionMs:0,durationMs:9000,volume:.7,shuffle:false,repeat:'off',queue:arg.trackIds,queueIndex:arg.startIndex}};
 media.seekTo=async arg=>{calls.push(['seekTo',arg]);return {schemaVersion:1,eventType:'playbackState',revision:++revision,state:'playing',mediaId:'b',positionMs:arg.positionMs,durationMs:9000,volume:.7,shuffle:false,repeat:'off',queue:calls.filter(x=>x[0]==='setQueue').at(-1)[1].trackIds,queueIndex:calls.filter(x=>x[0]==='setQueue').at(-1)[1].startIndex}};
 const adapter=createNativePlaybackAdapter(media);await adapter.connect(()=>{});await adapter.refreshLibrary();
 await adapter.move(2,0);await adapter.addNext('a');
 assert.deepEqual(calls.filter(x=>x[0]==='setQueue'),[['setQueue',{trackIds:['c','a','b'],startIndex:2}],['setQueue',{trackIds:['c','b','a'],startIndex:1}]]);
 assert.deepEqual(calls.filter(x=>x[0]==='seekTo'),[['seekTo',{positionMs:3500}],['seekTo',{positionMs:3500}]]);
});
test('local library still hydrates when the native catalog is unavailable',async()=>{
 const {media}=fakeMedia();media.getCatalog=async()=>{throw Error('catalog offline')};
 media.getLibrary=async()=>({tracks:[{id:'local-a',source:'local',title:'Saved',uri:'content://saved'}]});
 const adapter=createNativePlaybackAdapter(media);await adapter.connect(()=>{});await adapter.refreshLibrary();
 assert.equal(adapter.snapshot.files[0].id,'local-a');
 assert.equal(adapter.snapshot.catalog.status,'error');
});
