import {test,expect} from '@playwright/test';
import {SITE,tokenFor,asAdmin,apiHeaders} from './helpers-admin.js';

test.describe.configure({mode:'serial'});
const FIX='.wrangler/e2e/fixtures/';
const nav=(page,name)=>page.getByRole('navigation',{name:'Sekcje panelu'}).getByRole('button',{name,exact:true});
const catalog=async request=>(await (await request.get(SITE+'/music/catalog/catalog.json')).json());

test('admin page and API are closed without a valid Cloudflare Access token',async({request})=>{
 for(const path of ['/admin/','/admin','/admin/index.html'])expect((await request.get(SITE+path)).status(),path).toBe(401);
 expect(await (await request.get(SITE+'/admin/')).text()).not.toContain('admin-root');
 expect((await request.get(SITE+'/api/admin/catalog')).status()).toBe(401);
 const cases=[[{ttl:-600},401],[{aud:'other-app'},401],[{email:'intruder@example.com'},403]];
 for(const [params,status] of cases){
  const t=await tokenFor(params);
  expect((await request.get(SITE+'/api/admin/catalog',{headers:{'cf-access-jwt-assertion':t}})).status(),JSON.stringify(params)).toBe(status);
  expect((await request.get(SITE+'/admin/',{headers:{'cf-access-jwt-assertion':t}})).status()).toBe(status);
 }
 const forged=(await tokenFor()).replace(/\.[^.]+$/,'.AAAA');
 expect((await request.get(SITE+'/api/admin/session',{headers:{'cf-access-jwt-assertion':forged}})).status()).toBe(401);
 const valid=await tokenFor();
 const noCsrf=await request.post(SITE+'/api/admin/uploads',{headers:{'cf-access-jwt-assertion':valid,'content-type':'application/json'},data:{kind:'audio',name:'a.mp3',size:10,type:'audio/mpeg'}});
 expect(noCsrf.status()).toBe(403);
 const anonymousUpload=await request.post(SITE+'/api/admin/uploads',{headers:{'x-shutter-admin':'1',origin:SITE,'content-type':'application/json'},data:{kind:'audio',name:'a.mp3',size:10,type:'audio/mpeg'}});
 expect(anonymousUpload.status()).toBe(401);
 for(const method of ['put','post','delete'])expect((await request[method](SITE+'/music/catalog/catalog.json',{data:'{}'})).status()).toBe(405);
 expect((await request.get(SITE+'/music/admin/catalog-history/x.json')).status()).toBe(404);
});

test('upload extracts tags and artwork, rejects spoofed files, publishes and the public player streams it',async({page,browser,request})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await asAdmin(page);
 await page.goto(SITE+'/admin/');
 await expect(page.getByText('admin@example.com')).toBeVisible();
 await expect(page.getByText(/Opublikowany katalog ma błędy walidacji/)).toBeVisible();
 await nav(page,'Katalog').click();
 await page.getByRole('button',{name:'Usuń z katalogu: Bad'}).click();
 await page.getByRole('dialog').getByRole('button',{name:'Usuń z katalogu'}).click();
 await nav(page,'Dodaj muzykę').click();
 await page.getByTestId('audio-input').setInputFiles([FIX+'tagged.mp3',FIX+'fake.mp3']);
 const item=page.getByTestId('upload-item').filter({hasText:'tagged.mp3'});
 await expect(item.getByText('Gotowy do wysłania')).toBeVisible({timeout:20000});
 await expect(item.getByLabel(/^Tytuł/)).toHaveValue('Zażółć gęślą jaźń');
 await expect(item.getByLabel(/^Wykonawca\s*(tag)?$/)).toHaveValue('Łódzki Kwartet');
 await expect(item.getByLabel(/^Album/)).toHaveValue('Ćwiczenia');
 await expect(item.getByLabel(/^Gatunek/)).toHaveValue('Jazz');
 await expect(item.getByLabel(/^Rok/)).toHaveValue('2024');
 await expect(item.getByLabel(/^Nr utworu/)).toHaveValue('3');
 expect(Number(await item.getByLabel(/^Czas/).inputValue())).toBeGreaterThan(11);
 await expect(item.getByAltText('Podgląd okładki')).toBeVisible();
 await expect(item.getByText(/600×600 px · z pliku audio/)).toBeVisible();
 const fake=page.getByTestId('upload-item').filter({hasText:'fake.mp3'});
 await expect(fake.getByRole('button',{name:'Wyślij i dodaj do katalogu'})).toBeVisible({timeout:20000});
 await fake.getByRole('button',{name:'Wyślij i dodaj do katalogu'}).click();
 await expect(fake.getByRole('alert')).toHaveText('Zawartość pliku nie odpowiada jego formatowi.');
 await item.getByLabel(/^Gatunek/).fill('Jazz polski');
 await item.getByRole('button',{name:'Wyślij i dodaj do katalogu'}).click();
 await expect(item.getByText('Dodano do wersji roboczej')).toBeVisible({timeout:30000});
 // The seeded catalog references covers/none.jpg which does not exist in the bucket: publishing
 // must flag the missing object instead of shipping a broken catalog.
 await page.getByRole('button',{name:'Opublikuj katalog'}).click();
 await expect(page.getByText('Katalog zawiera błędy i nie został opublikowany.')).toBeVisible();
 await expect(page.getByText('covers/none.jpg: brak pliku w magazynie')).toBeVisible();
 await page.getByRole('button',{name:'Zamknij komunikat'}).first().click();
 // Repair the reference by reusing the existing artwork, then publish again.
 nav(page,'Katalog').click();
 await page.getByRole('button',{name:'Edytuj: Missing cover'}).click();
 await page.getByRole('dialog').getByLabel('Użyj istniejącej okładki').selectOption('covers/c.jpg');
 await page.getByRole('button',{name:'Zastosuj w wersji roboczej'}).click();
 await page.getByRole('button',{name:'Opublikuj katalog'}).click();
 await expect(page.getByText(/Katalog opublikowany/)).toBeVisible();
 const data=await catalog(request);
 const added=data.tracks.find(t=>t.title==='Zażółć gęślą jaźń');
 expect(added).toMatchObject({artist:'Łódzki Kwartet',album:'Ćwiczenia',genre:'Jazz polski',year:2024,trackNumber:3,mimeType:'audio/mpeg'});
 expect(added.audio).toMatch(/^tracks\/\d{4}\/[a-f0-9]{16}\.mp3$/);
 expect(added.cover).toMatch(/^covers\/\d{4}\/[a-f0-9]{16}\.jpg$/);
 expect(added.thumbnail).toMatch(/^covers\/\d{4}\/[a-f0-9]{16}\.webp$/);
 expect(data.tracks.some(t=>t.id==='bad')).toBe(false);
 expect(data.tracks.map(t=>t.id).slice(0,3)).toEqual(['t1','t2','t3']);
 expect(data.tracks.find(t=>t.id==='t3').cover).toBe('covers/c.jpg');
 expect((await request.get(SITE+'/music/'+added.cover)).status()).toBe(200);
 // Public visitor (no Access token) sees and plays the newly published track.
 const visitor=await browser.newPage();
 await visitor.addInitScript(()=>{window.__decks=new Set();const play=HTMLMediaElement.prototype.play;HTMLMediaElement.prototype.play=function(){window.__decks.add(this);return play.call(this)}});
 await visitor.goto(SITE+'/');
 const menu=visitor.getByRole('button',{name:'Otwórz menu'});if(await menu.isVisible())await menu.click();
 await visitor.getByRole('button',{name:/^Biblioteka/}).first().click();
 await visitor.getByRole('button',{name:'Odtwórz utwór Zażółć gęślą jaźń'}).first().click();
 await expect.poll(()=>visitor.evaluate(k=>[...window.__decks].some(a=>!a.paused&&a.currentSrc.includes(k)&&a.currentTime>0.3),added.audio),{timeout:20000}).toBe(true);
 await expect(visitor.locator('input[type=file]')).toHaveCount(0);
 await visitor.close();
 expect(errors).toEqual([]);
});

test('concurrent edits are detected, reorder publishes, history rollback restores',async({page,request})=>{
 const token=await asAdmin(page);
 await page.goto(SITE+'/admin/');
 await nav(page,'Katalog').click();
 await expect(page.getByTestId('catalog-row').first()).toBeVisible();
 // Another session publishes in the meantime.
 const cur=await (await request.get(SITE+'/api/admin/catalog',{headers:apiHeaders(token)})).json();
 const other={...cur.catalog,tracks:cur.catalog.tracks.map(t=>t.id==='t2'?{...t,title:'Sine B — z innej sesji'}:t)};
 expect((await request.put(SITE+'/api/admin/catalog',{headers:apiHeaders(token),data:{catalog:other,etag:cur.etag}})).status()).toBe(200);
 await page.getByRole('button',{name:'Edytuj: Sine A'}).click();
 await page.getByRole('dialog').getByLabel(/^Tytuł/).fill('Sine A — edycja');
 await page.getByRole('button',{name:'Zastosuj w wersji roboczej'}).click();
 await page.getByRole('button',{name:'Opublikuj katalog'}).click();
 await expect(page.getByText(/Katalog został zmieniony w innej sesji/).first()).toBeVisible();
 let data=await catalog(request);
 expect(data.tracks.find(t=>t.id==='t2').title).toBe('Sine B — z innej sesji');
 expect(data.tracks.find(t=>t.id==='t1').title).toBe('Sine A');
 await page.getByRole('button',{name:'Wczytaj najnowszą wersję'}).click();
 await page.getByRole('dialog').getByRole('button',{name:'Wczytaj najnowszą'}).click();
 await expect(page.getByText('Sine B — z innej sesji')).toBeVisible();
 await page.getByRole('button',{name:'Przesuń wyżej: Sine B — z innej sesji'}).click();
 await page.getByRole('button',{name:'Opublikuj katalog'}).click();
 await expect(page.getByText(/Katalog opublikowany/)).toBeVisible();
 data=await catalog(request);
 expect(data.tracks.slice(0,2).map(t=>t.id)).toEqual(['t2','t1']);
 expect(data.tracks.map(t=>t.id).sort()).toEqual([...new Set(data.tracks.map(t=>t.id))].sort());
 await nav(page,'Historia').click();
 const rows=page.getByTestId('history-row');
 await expect(rows.first()).toBeVisible();
 expect(await rows.count()).toBeGreaterThanOrEqual(3);
 await rows.first().getByRole('button',{name:'Przywróć'}).click();
 await page.getByRole('dialog').getByRole('button',{name:'Przywróć'}).click();
 await expect(page.getByText('Przywrócono poprzednią wersję katalogu.')).toBeVisible();
 data=await catalog(request);
 expect(data.tracks.slice(0,2).map(t=>t.id)).toEqual(['t1','t2']);
 expect(data.tracks.find(t=>t.id==='t2').title).toBe('Sine B — z innej sesji');
});

test('permanent deletion is separate, confirmed and blocked for referenced or shared media',async({page,request})=>{
 await asAdmin(page);
 await page.goto(SITE+'/admin/');
 await nav(page,'Magazyn').click();
 const shared=page.getByTestId('storage-row').filter({hasText:'tracks/a.mp3'});
 await expect(shared).toContainText('Sine A');await expect(shared).toContainText('Missing cover');
 await expect(shared.getByRole('button',{name:'Usuń trwale tracks/a.mp3'})).toBeDisabled();
 const before=await catalog(request);
 const added=before.tracks.find(t=>t.title==='Zażółć gęślą jaźń');
 await nav(page,'Katalog').click();
 await page.getByRole('button',{name:'Usuń z katalogu: Zażółć gęślą jaźń'}).click();
 await page.getByRole('dialog').getByRole('button',{name:'Usuń z katalogu'}).click();
 // Removed from the draft only: the file is still referenced by the draft and cannot be deleted yet.
 await nav(page,'Magazyn').click();
 await expect(page.getByRole('button',{name:'Usuń trwale '+added.audio})).toBeDisabled();
 await page.getByRole('button',{name:'Opublikuj katalog'}).click();
 await expect(page.getByText(/Katalog opublikowany/)).toBeVisible();
 expect((await request.head(SITE+'/music/'+added.audio)).status()).toBe(200);
 await page.getByRole('button',{name:'Usuń trwale '+added.audio}).click();
 const dialog=page.getByRole('dialog');
 await expect(dialog.getByRole('button',{name:'Usuń trwale'})).toBeDisabled();
 await dialog.getByLabel(/Wpisz/).fill('USUŃ');
 await dialog.getByRole('button',{name:'Usuń trwale'}).click();
 await expect(page.getByText(/^Usunięto /)).toBeVisible();
 expect((await request.head(SITE+'/music/'+added.audio)).status()).toBe(404);
 expect((await request.head(SITE+'/music/tracks/a.mp3')).status()).toBe(200);
 expect((await catalog(request)).tracks.some(t=>t.id===added.id)).toBe(false);
});
