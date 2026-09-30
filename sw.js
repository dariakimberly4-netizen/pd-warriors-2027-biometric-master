const CACHE='pdw2027-full-offline-v32';
const ASSETS=['./vendor/jsQR.js','./vendor/qrcode.min.js','./vendor/xlsx.full.min.js','./','./login.html','./index.html','./biometric.html','./pass.html','./admin.html','./master.html','./checkin.html','./snack.html','./lunch.html','./raffle.html','./reports.html','./privacy.html','./registration.html','./demo.html','./app.css','./app-core.js','./feature-highlights.js','./station-scanner.js','./manifest.webmanifest'];
self.addEventListener('install',e=>{self.skipWaiting();e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)))});
self.addEventListener('activate',e=>e.waitUntil(Promise.all([self.clients.claim(),caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))])));
self.addEventListener('fetch',e=>{
  e.respondWith(
    fetch(e.request)
      .then(r=>{
        const copy=r.clone();
        caches.open(CACHE).then(c=>c.put(e.request,copy));
        return r;
      })
      .catch(async()=>{
        const cached=await caches.match(e.request,{ignoreSearch:true});
        if(cached)return cached;

        if(e.request.mode==='navigate'){
          const url=new URL(e.request.url);
          const pathname=url.pathname.split('/').pop()||'index.html';
          const page=await caches.match('./'+pathname,{ignoreSearch:true});
          if(page)return page;
          return caches.match('./index.html',{ignoreSearch:true});
        }

        return Response.error();
      })
  );
});