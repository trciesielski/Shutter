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
 assert.deepEqual(routes.include,['/music/*']);
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
