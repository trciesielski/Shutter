import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';

// SHUTTER's decks are detached `new Audio()` elements, so track them from the prototype.
test.beforeEach(async({page})=>{await page.addInitScript(()=>{window.__decks=new Set();const play=HTMLMediaElement.prototype.play;HTMLMediaElement.prototype.play=function(){window.__decks.add(this);return play.call(this)}})});
async function goLibrary(page){
 const menu=page.getByRole('button',{name:'Otwórz menu'});
 if(await menu.isVisible())await menu.click();
 await page.getByRole('button',{name:/^Biblioteka/}).first().click();
}
test('mobile build keeps local import, playback and deletion',async({page})=>{
 await page.goto('/');
 await goLibrary(page);
 const input=page.locator('input[type=file]');
 await expect(input).toHaveCount(1);
 await input.setInputFiles({name:'local-tone.mp3',mimeType:'audio/mpeg',buffer:readFileSync('.wrangler/e2e/fixtures/a.mp3')});
 const play=page.getByRole('button',{name:/^Odtwórz utwór local-tone/}).first();
 await expect(play).toBeVisible();
 await play.click();
 await expect.poll(()=>page.evaluate(()=>[...(window.__decks||[])].some(a=>!a.paused&&a.currentSrc.startsWith('blob:')))).toBe(true);
 await page.getByRole('button',{name:/^Więcej akcji dla local-tone/}).first().click();
 await page.getByText('Usuń z biblioteki').click();
 await expect(play).toHaveCount(0);
});

test('native Android shell uses Media3 commands without web audio or browser file input',async({page})=>{
 await page.addInitScript(()=>{
  window.androidBridge={};
  window.__webPlayers=0;window.__webContexts=0;
  window.__nativeCalls=[];
  const methods=['connect','disconnect','play','pause','toggle','stop','skipNext','skipPrevious','seekTo','setVolume','setQueue','playItem','setShuffle','setRepeat','getCatalog','getLibrary','getPlaylists','getRatings','setRating','pickLocalFiles','removeLocalTrack','migrateWebStorage','createPlaylist','updatePlaylist','deletePlaylist','getAudioAnalysisCapabilities','removeListener'];
  const snapshot=(state='paused')=>({schemaVersion:1,eventType:'playbackState',revision:state==='playing'?5:1,state,mediaId:'catalog-a',positionMs:0,durationMs:9000,volume:.7,shuffle:false,repeat:'off',queue:['catalog-a'],queueIndex:0});
  window.__ratings={};window.__revision=5;window.__nativeListeners={};
  window.Capacitor={PluginHeaders:[{name:'ShutterMedia',methods:[...methods.map(name=>({name,rtype:'promise'})),{name:'addListener',rtype:'callback'}]}],nativeCallback:(_plugin,_method,options,callback)=>{window.__nativeListeners[options.eventName]=callback;return 'listener-1'},nativePromise:async(_plugin,method,options)=>{
   window.__nativeCalls.push([method,options]);
   if(method==='connect')return snapshot();
   if(method==='playItem'||method==='toggle')return snapshot('playing');
   if(method==='getCatalog')return {tracks:[{id:'catalog-a',source:'catalog',title:'Native song',artist:'Shutter',album:'Music',durationMs:9000,artworkUri:'https://example.test/art.jpg',uri:'https://example.test/song.mp3'},{id:'catalog-b',source:'catalog',title:'Next song',artist:'Shutter',album:'Music',durationMs:9000,artworkUri:'https://example.test/art.jpg',uri:'https://example.test/next.mp3'}]};
   if(method==='getLibrary')return {tracks:[]};
   if(method==='getRatings')return {ratings:window.__ratings};
   if(method==='setRating'){window.__ratings[options.trackId]=options.rating;return {rating:options.rating}}
   if(method==='getPlaylists')return {playlists:[{id:'road',name:'Road',tracks:['catalog-a','catalog-b']}]};
   if(method==='setQueue')return {...snapshot(),revision:++window.__revision,mediaId:options.trackIds[options.startIndex],queue:options.trackIds,queueIndex:options.startIndex};
   if(method==='play'){const queue=window.__nativeCalls.filter(x=>x[0]==='setQueue').at(-1)[1];return {...snapshot('playing'),revision:++window.__revision,mediaId:queue.trackIds[queue.startIndex],queue:queue.trackIds,queueIndex:queue.startIndex}}
   if(method==='migrateWebStorage')return {completed:true};
   return {schemaVersion:1};
  }};
  const OriginalAudio=window.Audio;
  window.Audio=class extends OriginalAudio{constructor(...args){super(...args);window.__webPlayers++}};
  const OriginalContext=window.AudioContext;
  if(OriginalContext)window.AudioContext=class extends OriginalContext{constructor(...args){super(...args);window.__webContexts++}};
 });
 await page.goto('/');
 await expect(page.getByRole('button',{name:'Odtwórz utwór Native song'}).first()).toBeVisible();
 await expect(page.locator('input[type=file]')).toHaveCount(0);
 await page.getByRole('button',{name:'Odtwórz utwór Native song'}).first().click();
 await expect(page.getByRole('button',{name:'Pauza'}).first()).toBeVisible();
 expect(await page.evaluate(()=>window.Capacitor.getPlatform())).toBe('android');
 expect(await page.evaluate(()=>[window.__webPlayers,window.__webContexts])).toEqual([0,0]);
 expect(await page.evaluate(()=>window.__nativeCalls.map(x=>x[0]))).toContain('toggle');
 await page.getByRole('button',{name:'Oceń pozytywnie'}).first().click();
 await expect(page.getByRole('button',{name:'Oceń pozytywnie'}).first()).toHaveAttribute('aria-pressed','true');
 expect(await page.evaluate(()=>window.__nativeCalls.filter(x=>x[0]==='setRating'))).toEqual([['setRating',{trackId:'catalog-a',rating:'up'}]]);
 expect(await page.evaluate(()=>localStorage.getItem('shutter-track-preferences-v1'))).toBeNull();
 const menu=page.getByRole('button',{name:'Otwórz menu'});if(await menu.isVisible())await menu.click();
 await page.getByRole('button',{name:/^Playlisty/}).first().click();
 await page.getByRole('button',{name:/Road/}).first().click();
 await page.getByRole('button',{name:'Wstrzymaj Native song'}).click();
 await expect.poll(()=>page.evaluate(()=>window.__nativeCalls.filter(x=>x[0]==='play').length)).toBe(1);
 await page.getByRole('button',{name:'Odtwórz Next song'}).click();
 await expect.poll(()=>page.evaluate(()=>window.__nativeCalls.filter(x=>x[0]==='play').length)).toBe(2);
 await page.evaluate(()=>window.__nativeListeners.playbackState({schemaVersion:1,eventType:'playbackState',revision:++window.__revision,state:'playing',mediaId:'catalog-b',positionMs:0,durationMs:9000,volume:.7,shuffle:false,repeat:'off',queue:['catalog-b'],queueIndex:0}));
 await page.getByRole('button',{name:'Wstrzymaj Next song'}).click();
 await expect.poll(()=>page.evaluate(()=>window.__nativeCalls.filter(x=>x[0]==='play').length)).toBe(3);
 expect(await page.evaluate(()=>window.__nativeCalls.filter(x=>x[0]==='toggle').length)).toBe(1);
 expect(await page.evaluate(()=>window.__nativeCalls.filter(x=>['setQueue','play','playItem'].includes(x[0])))).toEqual([['setQueue',{trackIds:['catalog-a','catalog-b'],startIndex:0}],['play',{}],['setQueue',{trackIds:['catalog-a','catalog-b'],startIndex:1}],['play',{}],['setQueue',{trackIds:['catalog-a','catalog-b'],startIndex:1}],['play',{}]]);
});

test('native startup retry reconnects and migrates before showing the library',async({page})=>{
 await page.addInitScript(()=>{
  window.androidBridge={};window.__nativeCalls=[];
  const methods=['connect','disconnect','removeListener','migrateWebStorage','getCatalog','getLibrary','getRatings','getPlaylists'];
  window.Capacitor={PluginHeaders:[{name:'ShutterMedia',methods:[...methods.map(name=>({name,rtype:'promise'})),{name:'addListener',rtype:'callback'}]}],nativeCallback:()=> 'listener-1',nativePromise:async(_plugin,method,options)=>{
   window.__nativeCalls.push([method,options]);
   if(method==='connect'){
    if(window.__nativeCalls.filter(x=>x[0]==='connect').length===1)throw Error('service offline');
    return {schemaVersion:1,eventType:'playbackState',revision:2,state:'idle',mediaId:'a',positionMs:0,durationMs:9000,volume:.7,shuffle:false,repeat:'off',queue:['a'],queueIndex:0};
   }
   if(method==='migrateWebStorage')return {completed:true};
   if(method==='getCatalog')return {tracks:[{id:'a',source:'catalog',title:'Recovered song',artist:'Shutter',album:'Music',durationMs:9000,uri:'https://example.test/a.mp3'}]};
   if(method==='getLibrary')return {tracks:[]};
   if(method==='getRatings')return {ratings:{}};
   if(method==='getPlaylists')return {playlists:[]};
   return {schemaVersion:1};
  }};
 });
 await page.goto('/');
 await expect(page.getByRole('alert')).toContainText('service offline');
 await page.getByRole('button',{name:'Spróbuj ponownie'}).click();
 await expect(page.getByRole('button',{name:'Odtwórz utwór Recovered song'}).first()).toBeVisible();
 expect(await page.evaluate(()=>window.__nativeCalls.map(x=>x[0]).filter(x=>['connect','migrateWebStorage','getCatalog','getPlaylists'].includes(x)))).toEqual(['connect','connect','migrateWebStorage','getCatalog','getPlaylists']);
});
