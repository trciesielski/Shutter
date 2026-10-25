const CACHE='shutter-static-v1';const SCOPE='/Shutter/';
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(c=>c.addAll([SCOPE,SCOPE+'icon.svg',SCOPE+'manifest.webmanifest'])));self.skipWaiting()});
self.addEventListener('activate',event=>{event.waitUntil((async()=>{for(const key of await caches.keys())if(key.startsWith('shutter-static-')&&key!==CACHE)await caches.delete(key);await self.clients.claim()})())});
self.addEventListener('fetch',event=>{const req=event.request,url=new URL(req.url);if(req.method!=='GET'||url.origin!==self.location.origin||!url.pathname.startsWith(SCOPE))return;
 if(req.mode==='navigate'){event.respondWith(fetch(req).then(response=>{if(response.ok){const copy=response.clone();caches.open(CACHE).then(c=>c.put(SCOPE,copy))}return response}).catch(()=>caches.match(SCOPE)));return}
 event.respondWith(caches.match(req).then(hit=>hit||fetch(req).then(response=>{if(response.ok){const copy=response.clone();caches.open(CACHE).then(c=>c.put(req,copy))}return response})))
});