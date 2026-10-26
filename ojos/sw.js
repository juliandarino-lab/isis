'use strict';
const CACHE="isis-ojos-local-337bc72c2ef5",FILES=["./","app.js","horarios.js","icono-192.png","icono-512.png","icono.svg","importar-isis.js","index.html","inicio.js","jspdf.js","logo.jpg","manifest.webmanifest","pdf.js"];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>(k.startsWith('isis-ojos-local-')||k.startsWith('isis-ojos-static-'))&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(e.request.method!=='GET'||u.origin!==self.location.origin||!u.pathname.startsWith(new URL('./',self.location.href).pathname))return;e.respondWith(fetch(e.request).then(r=>{if(r.ok){const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));}return r;}).catch(()=>caches.match(e.request)));});
