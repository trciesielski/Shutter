import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {build} from 'vite';

const root=new URL('..',import.meta.url).pathname;
async function buildHtml(options={}){
 const outDir=await mkdtemp(join(tmpdir(),'shutter-build-'));
 try{
  await build({root,logLevel:'silent',...options,build:{outDir,emptyOutDir:true}});
  return {html:await readFile(join(outDir,'index.html'),'utf8'),manifest:JSON.parse(await readFile(join(outDir,'manifest.webmanifest'),'utf8')),routes:JSON.parse(await readFile(join(outDir,'_routes.json'),'utf8'))};
 }finally{await rm(outDir,{recursive:true,force:true})}
}

test('default build (Cloudflare Pages) uses root asset paths and no /Shutter/ references',async()=>{
 const {html,manifest,routes}=await buildHtml();
 assert.doesNotMatch(html,/\/Shutter\//);
 assert.match(html,/src="\/assets\/index-[\w-]+\.js"/);
 assert.match(html,/href="\/manifest\.webmanifest"/);
 assert.equal(manifest.start_url,'./');assert.equal(manifest.scope,'./');assert.equal(manifest.icons[0].src,'icon.svg');
 assert.deepEqual(routes.include,['/music/*','/admin','/admin/*','/api/admin/*']);
});

test('GitHub Pages build keeps /Shutter/ base when passed explicitly',async()=>{
 const {html}=await buildHtml({base:'/Shutter/'});
 assert.match(html,/src="\/Shutter\/assets\/index-[\w-]+\.js"/);
 assert.match(html,/href="\/Shutter\/manifest\.webmanifest"/);
 const workflow=await readFile(new URL('../.github/workflows/pages.yml',import.meta.url),'utf8');
 assert.match(workflow,/npm run build -- --base=\/Shutter\//);
});

test('service worker derives its scope instead of hard-coding /Shutter/',async()=>{
 const sw=await readFile(new URL('../public/sw.js',import.meta.url),'utf8');
 assert.match(sw,/new URL\(self\.registration\.scope\)\.pathname/);
 assert.doesNotMatch(sw,/'\/Shutter\/'/);
});

test('service worker never caches streamed /music/ media or range requests',async()=>{
 const sw=await readFile(new URL('../public/sw.js',import.meta.url),'utf8');
 assert.match(sw,/url\.pathname\.startsWith\(SCOPE\+'music\/'\)\|\|req\.headers\.has\('range'\)\)return;/);
});

test('admin panel is a separate entry: public bundle has no admin code; GitHub Pages and mobile builds have no admin',async()=>{
 const outDir=await mkdtemp(join(tmpdir(),'shutter-admin-'));
 try{
  await build({root,logLevel:'silent',build:{outDir,emptyOutDir:true}});
  const adminHtml=await readFile(join(outDir,'admin','index.html'),'utf8');
  assert.match(adminHtml,/noindex/);
  const html=await readFile(join(outDir,'index.html'),'utf8');
  const entry=/src="\/assets\/(index-[\w-]+\.js)"/.exec(html)[1];
  const {readdir}=await import('node:fs/promises');
  const publicJs=[entry,...[...html.matchAll(/href="\/assets\/([\w-]+\.js)"/g)].map(m=>m[1])];
  for(const f of publicJs){
   const js=await readFile(join(outDir,'assets',f),'utf8');
   assert.doesNotMatch(js,/api\/admin/,f);assert.doesNotMatch(js,/X-Shutter-Admin/,f);
  }
  assert.ok((await readdir(join(outDir,'assets'))).some(f=>/^admin-[\w-]+\.js$/.test(f)));
 }finally{await rm(outDir,{recursive:true,force:true})}
 const ghDir=await mkdtemp(join(tmpdir(),'shutter-gh-'));
 const prev=process.env.SHUTTER_BUILD_ADMIN;process.env.SHUTTER_BUILD_ADMIN='0';
 try{
  await build({root,logLevel:'silent',base:'/Shutter/',build:{outDir:ghDir,emptyOutDir:true}});
  await assert.rejects(readFile(join(ghDir,'admin','index.html')));
 }finally{if(prev===undefined)delete process.env.SHUTTER_BUILD_ADMIN;else process.env.SHUTTER_BUILD_ADMIN=prev;await rm(ghDir,{recursive:true,force:true})}
 const workflow=await readFile(new URL('../.github/workflows/pages.yml',import.meta.url),'utf8');
 assert.match(workflow,/SHUTTER_BUILD_ADMIN: '0'/);
 const mobileDir=await mkdtemp(join(tmpdir(),'shutter-mobile-'));
 try{
  await build({root,logLevel:'silent',mode:'mobile',build:{outDir:mobileDir,emptyOutDir:true}});
  await assert.rejects(readFile(join(mobileDir,'admin','index.html')));
 }finally{await rm(mobileDir,{recursive:true,force:true})}
});

test('service worker never caches the admin panel or admin API',async()=>{
 const sw=await readFile(new URL('../public/sw.js',import.meta.url),'utf8');
 assert.match(sw,/url\.pathname===SCOPE\+'admin'\|\|url\.pathname\.startsWith\(SCOPE\+'admin\/'\)\|\|url\.pathname\.startsWith\(SCOPE\+'api\/'\)\)return;/);
});
