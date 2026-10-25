const CACHE='shutter-static-v2';const SCOPE='/Shutter/';
self.addEventListener('install',event=>{self.skipWaiting();event.waitUntil(caches.open(CACHE).then(c=>c.addAll([SCOPE+'icon.svg',SCOPE+'manifest.webmanifest'])))});
self.addEventListener('activate',event=>{event.waitUntil((async()=>{const keys=await caches.keys();await Promise.all(keys.filter(k=>k.startsWith('shutter-static-')&&k!==CACHE).map(k=>caches.delete(k)));await self.clients.claim()})())});
self.addEventListener('fetch',event=>{
 const req=event.request,url=new URL(req.url);
 if(req.method!=='GET'||url.origin!==location.origin||!url.pathname.startsWith(SCOPE))return;
 // Network-first for HTML and all versioned Vite assets, avoiding a permanently stale UI.
 event.respondWith(fetch(req).then(response=>{
  if(response.ok){const clone=response.clone();event.waitUntil(caches.open(CACHE).then(c=>c.put(req,clone)))}
  return response;
 }).catch(async()=>await caches.match(req)||await caches.match(SCOPE)));
});
