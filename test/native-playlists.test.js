import test from 'node:test';
import assert from 'node:assert/strict';
import {createNativePlaylistStore} from '../src/audio/useNativePlaylists.js';

test('playlist CRUD and favorites are persisted through ShutterMedia',async()=>{
 const calls=[],data=[];
 const media={getPlaylists:async()=>({playlists:data.map(x=>({...x}))}),createPlaylist:async x=>{calls.push(['create',x]);data.push({id:x.id,name:x.name,tracks:x.trackIds})},updatePlaylist:async x=>{calls.push(['update',x]);const row=data.find(y=>y.id===x.id);row.name=x.name;row.tracks=x.trackIds},deletePlaylist:async x=>{calls.push(['delete',x]);data.splice(data.findIndex(y=>y.id===x.id),1)}};
 const store=createNativePlaylistStore(media,()=>{});
 await store.refresh();await store.create('Road','a');
 const road=store.lists[0];assert.deepEqual(road.tracks,['a']);
 await store.addTrack(road.id,'b');await store.toggleTrack(road.id,'a');
 assert.deepEqual(store.lists[0].tracks,['b']);
 await store.ensureFavorite('b');assert.equal(store.isFavorite('b'),true);
 await store.ensureFavorite('b');assert.equal(store.isFavorite('b'),false);
 await store.remove(road.id);assert.equal(store.lists.some(x=>x.id===road.id),false);
 assert.deepEqual(calls.map(x=>x[0]),['create','update','update','create','update','delete']);
});
