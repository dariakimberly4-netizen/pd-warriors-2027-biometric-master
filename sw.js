const CACHE='pdw2027-checkin-autosync-v44';
const ASSETS=[
  './vendor/jsQR.js',
  './vendor/qrcode.min.js',
  './vendor/xlsx.full.min.js',
  './',
  './login.html',
  './index.html',
  './biometric.html',
  './pass.html',
  './admin.html',
  './master.html',
  './checkin.html',
  './snack.html',
  './lunch.html',
  './raffle.html',
  './reports.html',
  './privacy.html',
  './registration.html',
  './demo.html',
  './receive-shared-names.html',
  './app.css',
  './app-core.js',
  './feature-highlights.js',
  './registration-enhancements.js',
  './staff-names-share.html',
  './station-scanner.js',
  './checkin-names-roster.js',
  './manifest.webmanifest',
  './pdw-icon.svg'
];

const SHARE_DB='pdw2027-share-target';
const SHARE_STORE='incoming';
const SHARE_KEY='latest';

self.addEventListener('install',event=>{
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)));
});

self.addEventListener('activate',event=>{
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches.keys().then(keys=>Promise.all(
        keys.filter(key=>key!==CACHE).map(key=>caches.delete(key))
      ))
    ])
  );
});

function openShareDB(){
  return new Promise((resolve,reject)=>{
    const req=indexedDB.open(SHARE_DB,1);
    req.onupgradeneeded=()=>{
      const db=req.result;
      if(!db.objectStoreNames.contains(SHARE_STORE)){
        db.createObjectStore(SHARE_STORE);
      }
    };
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error);
  });
}

async function saveIncomingShare(payload){
  const db=await openShareDB();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(SHARE_STORE,'readwrite');
    tx.objectStore(SHARE_STORE).put(payload,SHARE_KEY);
    tx.oncomplete=()=>resolve();
    tx.onerror=()=>reject(tx.error);
  });
}

self.addEventListener('fetch',event=>{
  const request=event.request;
  const url=new URL(request.url);

  if(request.method==='POST' && url.pathname.endsWith('/receive-shared-names.html')){
    event.respondWith((async()=>{
      try{
        const form=await request.formData();
        const file=form.get('namesfile');

        if(!file || typeof file.text!=='function'){
          return Response.redirect(
            new URL('./receive-shared-names.html?error=nofile',request.url).href,
            303
          );
        }

        const text=await file.text();
        const filename=String(file.name||'');
        const match=filename.match(/PDW2027-NAMES-([A-Z-]+)\.txt$/i);
        const role=match ? match[1].toUpperCase().replace(/[^A-Z]/g,'') : '';

        await saveIncomingShare({
          text,
          role,
          filename,
          receivedAt:new Date().toISOString()
        });

        return Response.redirect(
          new URL('./receive-shared-names.html?shared=1',request.url).href,
          303
        );
      }catch(error){
        return Response.redirect(
          new URL('./receive-shared-names.html?error=receive',request.url).href,
          303
        );
      }
    })());
    return;
  }

  if(request.method!=='GET') return;

  event.respondWith(
    fetch(request)
      .then(response=>{
        const copy=response.clone();
        caches.open(CACHE).then(cache=>cache.put(request,copy));
        return response;
      })
      .catch(async()=>{
        const cached=await caches.match(request,{ignoreSearch:true});
        if(cached) return cached;

        if(request.mode==='navigate'){
          const pathname=url.pathname.split('/').pop()||'index.html';
          const page=await caches.match('./'+pathname,{ignoreSearch:true});
          if(page) return page;
          return caches.match('./index.html',{ignoreSearch:true});
        }

        return Response.error();
      })
  );
});