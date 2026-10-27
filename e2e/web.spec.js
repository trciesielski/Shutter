import {test,expect} from '@playwright/test';

const audioState=page=>page.evaluate(()=>[...(window.__decks||[])].map(a=>({src:a.currentSrc,paused:a.paused,time:a.currentTime})));
const playingTrack=async page=>(await audioState(page)).find(a=>!a.paused);

// SHUTTER's decks are detached `new Audio()` elements, so track them from the prototype.
test.beforeEach(async({page})=>{await page.addInitScript(()=>{window.__decks=new Set();const play=HTMLMediaElement.prototype.play;HTMLMediaElement.prototype.play=function(){window.__decks.add(this);return play.call(this)}})});
async function goLibrary(page){
 const menu=page.getByRole('button',{name:'Otwórz menu'});
 if(await menu.isVisible())await menu.click();
 await page.getByRole('button',{name:/^Biblioteka/}).first().click();
}
async function openLibrary(page){
 await page.goto('/');
 await goLibrary(page);
 await expect(page.getByRole('button',{name:'Odtwórz utwór Sine A'}).first()).toBeVisible();
}

test('public catalog is loaded from R2 and invalid entries are skipped',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await openLibrary(page);
 for(const title of ['Sine A','Sine B','Missing cover'])await expect(page.getByRole('button',{name:'Odtwórz utwór '+title}).first()).toBeVisible();
 await expect(page.getByText('Pominięto pozycje katalogu',{exact:false})).toBeVisible();
 await expect(page.getByText('Bad',{exact:true})).toHaveCount(0);
 expect(errors).toEqual([]);
});

test('web exposes no import, upload or delete controls',async({page})=>{
 await openLibrary(page);
 await expect(page.locator('input[type=file]')).toHaveCount(0);
 await expect(page.getByText('Dodaj pliki muzyczne')).toHaveCount(0);
 await page.getByRole('button',{name:'Więcej akcji dla Sine A'}).first().click();
 await expect(page.getByText('Usuń z biblioteki')).toHaveCount(0);
 await expect(page.getByText('Dodaj do playlisty')).toBeVisible();
});

test('catalog tracks play, switch, seek with HTTP Range and show artwork fallback',async({page})=>{
 const ranges=[];
 page.on('request',r=>{if(r.url().includes('/music/tracks/'))ranges.push(r.headers()['range']||'none')});
 await openLibrary(page);
 const cover=page.locator('.library-track-cover-image').first();
 await expect(cover).toHaveAttribute('src',/\/music\/covers\/c\.jpg$/);
 await expect.poll(()=>cover.evaluate(img=>img.complete&&img.naturalWidth)).toBeGreaterThan(0);
 await expect(page.locator('.library-track-cover-image[src*="none.jpg"]')).toHaveCount(0);

 await page.getByRole('button',{name:'Odtwórz utwór Sine A'}).first().click();
 await expect.poll(async()=>(await playingTrack(page))?.src||'').toMatch(/\/music\/tracks\/a\.mp3$/);
 await expect.poll(async()=>(await playingTrack(page))?.time||0).toBeGreaterThan(0.3);

 const seek=page.getByRole('slider',{name:'Pozycja utworu'}).first();
 await seek.evaluate(el=>{const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;set.call(el,'75');el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));el.dispatchEvent(new PointerEvent('pointerup',{bubbles:true}))});
 await expect.poll(async()=>(await playingTrack(page))?.time||0).toBeGreaterThan(10);
 expect(ranges.some(r=>r.startsWith('bytes='))).toBe(true);

 await page.getByRole('button',{name:'Następny'}).first().click();
 await expect.poll(async()=>(await playingTrack(page))?.src||'').toMatch(/\/music\/tracks\/b\.mp3$/);
 await page.getByRole('button',{name:'Pauza'}).first().click();
 await expect.poll(async()=>(await audioState(page)).every(a=>a.paused)).toBe(true);
});

test('failed R2 catalog request shows an error with retry',async({page})=>{
 let fail=true;
 await page.route('**/music/catalog/catalog.json',route=>fail?route.fulfill({status:503,body:'{}',contentType:'application/json'}):route.continue());
 await page.goto('/');
 await goLibrary(page);
 await expect(page.getByRole('alert').filter({hasText:'Spróbuj ponownie'})).toBeVisible();
 fail=false;
 await page.getByRole('button',{name:'Spróbuj ponownie'}).click();
 await expect(page.getByRole('button',{name:'Odtwórz utwór Sine A'}).first()).toBeVisible();
});

test('empty catalog shows an empty state',async({page})=>{
 await page.route('**/music/catalog/catalog.json',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({version:1,tracks:[]})}));
 await page.goto('/');
 await goLibrary(page);
 await expect(page.getByText('Katalog muzyki jest jeszcze pusty.')).toBeVisible();
});

test('layout has no horizontal overflow and static assets resolve from root',async({page,request})=>{
 await openLibrary(page);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true);
 for(const path of ['/manifest.webmanifest','/icon.svg','/sw.js']){
  const res=await request.get(path);
  expect(res.status(),path).toBe(200);
  expect(res.headers()['content-type'],path).not.toContain('text/html');
 }
});
