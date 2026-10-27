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
  const methods=['connect','disconnect','play','pause','toggle','stop','skipNext','skipPrevious','seekTo','setVolume','setQueue','playItem','setShuffle','setRepeat','getCatalog','getLibrary','getPlaylists','pickLocalFiles','removeLocalTrack','migrateWebStorage','createPlaylist','updatePlaylist','deletePlaylist','getAudioAnalysisCapabilities','removeListener'];
  const snapshot=(state='paused')=>({schemaVersion:1,eventType:'playbackState',revision:state==='playing'?5:1,state,mediaId:'catalog-a',positionMs:0,durationMs:9000,volume:.7,shuffle:false,repeat:'off',queue:['catalog-a'],queueIndex:0});
  window.Capacitor={PluginHeaders:[{name:'ShutterMedia',methods:[...methods.map(name=>({name,rtype:'promise'})),{name:'addListener',rtype:'callback'}]}],nativeCallback:(_plugin,_method)=>'listener-1',nativePromise:async(_plugin,method,options)=>{
   window.__nativeCalls.push([method,options]);
   if(method==='connect')return snapshot();
   if(method==='playItem'||method==='toggle')return snapshot('playing');
   if(method==='getCatalog')return {tracks:[{id:'catalog-a',source:'catalog',title:'Native song',artist:'Shutter',album:'Music',durationMs:9000,artworkUri:'https://example.test/art.jpg',uri:'https://example.test/song.mp3'}]};
   if(method==='getLibrary')return {tracks:[]};
   if(method==='getPlaylists')return {playlists:[]};
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
});
