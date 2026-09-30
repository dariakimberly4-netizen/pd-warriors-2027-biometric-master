(() => {
'use strict';

const DB_KEY='pdw2027BioDemoV1';
const RAFFLE_KEY='pdw2027RaffleDrawWinnersV51';
const PREFIX='PDWQ1';
const CHUNK_SIZE=600;

const $=s=>document.querySelector(s);
const role=sessionStorage.getItem('pdwStaffRole')||'';
const staffName=sessionStorage.getItem('pdwStaffName')||'Staff';
const isMasterRole=role==='ADMIN'||role==='REGISTRATION';

let sendFrames=[];
let sendIndex=0;
let sendTimer=null;
let receiveSession=null;
let receivedChunks=new Map();
let cameraStream=null;
let scanRAF=0;
let decodedEnvelope=null;

function db(){
  try{return JSON.parse(localStorage.getItem(DB_KEY)||'{"people":[],"tx":[],"pending":0,"syncedAt":null}')}
  catch(e){return {people:[],tx:[],pending:0,syncedAt:null}}
}
function saveDb(d){localStorage.setItem(DB_KEY,JSON.stringify(d))}
function esc(v){return String(v==null?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}
function fnv(s){
  let h=2166136261;
  for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}
  return (h>>>0).toString(16).padStart(8,'0');
}
function sessionCode(){
  const a=new Uint32Array(1);crypto.getRandomValues(a);
  return ((a[0]>>>0).toString(36)+Date.now().toString(36)).slice(-8).toUpperCase();
}
function makePin(){
  const a=new Uint32Array(1);crypto.getRandomValues(a);
  return String(a[0]%1000000).padStart(6,'0');
}
function bytesToB64(bytes){
  let bin='';
  for(let i=0;i<bytes.length;i+=0x8000){
    bin+=String.fromCharCode(...bytes.subarray(i,i+0x8000));
  }
  return btoa(bin);
}
function b64ToBytes(b64){
  const bin=atob(b64),out=new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++)out[i]=bin.charCodeAt(i);
  return out;
}
async function gzip(bytes){
  if(!('CompressionStream' in window))return {bytes,compressed:false};
  const stream=new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'));
  return {bytes:new Uint8Array(await new Response(stream).arrayBuffer()),compressed:true};
}
async function gunzip(bytes){
  if(!('DecompressionStream' in window))throw new Error('This browser cannot open compressed transfers. Update Chrome/Edge/Safari and try again.');
  const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
async function deriveKey(pin,salt,usage){
  const material=await crypto.subtle.importKey(
    'raw',new TextEncoder().encode(pin),'PBKDF2',false,['deriveKey']
  );
  return crypto.subtle.deriveKey(
    {name:'PBKDF2',salt,iterations:100000,hash:'SHA-256'},
    material,
    {name:'AES-GCM',length:256},
    false,
    usage
  );
}
async function encrypt(bytes,pin){
  const salt=crypto.getRandomValues(new Uint8Array(16));
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const key=await deriveKey(pin,salt,['encrypt']);
  const cipher=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},key,bytes));
  const all=new Uint8Array(salt.length+iv.length+cipher.length);
  all.set(salt,0);all.set(iv,salt.length);all.set(cipher,salt.length+iv.length);
  return all;
}
async function decrypt(bytes,pin){
  if(bytes.length<29)throw new Error('Transfer is incomplete.');
  const salt=bytes.slice(0,16),iv=bytes.slice(16,28),cipher=bytes.slice(28);
  const key=await deriveKey(pin,salt,['decrypt']);
  return new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv},key,cipher));
}

function packPerson(p){
  return {
    i:p.id||'',
    t:p.type==='COMPANION'?'C':'P',
    n:p.name||'',
    k:p.nickname||'',
    l:p.location||'',
    p:p.linkedPatientId||'',
    o:p.companionOf||'',
    r:p.registrationStatus||'CONFIRMED',
    a:p.arrived?1:0,
    A:p.arrivalAt||'',
    s:p.snack?1:0,
    S:p.snackAt||'',
    u:p.lunch?1:0,
    U:p.lunchAt||'',
    f:p.raffle?1:0,
    F:p.raffleAt||''
  };
}
function unpackPerson(x){
  return {
    id:x.i||'',
    type:x.t==='C'?'COMPANION':'PATIENT',
    name:x.n||'',
    nickname:x.k||'',
    location:x.l||'',
    linkedPatientId:x.p||'',
    companionOf:x.o||'',
    registrationStatus:x.r||'CONFIRMED',
    arrived:!!x.a,arrivalAt:x.A||'',
    snack:!!x.s,snackAt:x.S||'',
    lunch:!!x.u,lunchAt:x.U||'',
    raffle:x.t==='C'?false:!!x.f,raffleAt:x.t==='C'?'':(x.F||'')
  };
}
function packTx(t){
  return {i:t.id||'',a:t.action||'',s:t.station||'',t:t.timestamp||'',n:t.staffName||'',r:t.staffRole||''};
}
function unpackTx(x){
  const ts=x.t||new Date().toISOString();
  let display='';
  try{display=new Date(ts).toLocaleTimeString()}catch(e){}
  return {id:x.i||'',action:x.a||'',station:x.s||'',timestamp:ts,time:display,staffName:x.n||'',staffRole:x.r||''};
}
function txKey(t){return [t.id,t.action,t.station,t.timestamp].join('|')}

function buildPackage(kind){
  const d=db();
  const isMaster=kind==='MASTER';
  const people=isMaster
    ? d.people
    : d.people.filter(p=>p.arrived||p.snack||p.lunch||p.raffle||p.registrationStatus==='CANCELLED'||p.registrationStatus==='NO SHOW');

  let winners=[];
  try{winners=JSON.parse(localStorage.getItem(RAFFLE_KEY)||'[]')}catch(e){}

  return {
    v:1,
    e:'PDW2027',
    k:kind,
    r:role||'UNKNOWN',
    n:staffName,
    c:new Date().toISOString(),
    m:localStorage.getItem('pdw2027RegistrationUpdatedAt')||'',
    p:people.map(packPerson),
    x:isMaster?[]:(d.tx||[]).map(packTx),
    w:Array.isArray(winners)?winners:[]
  };
}

async function encodePackage(pkg){
  const raw=new TextEncoder().encode(JSON.stringify(pkg));
  const z=await gzip(raw);
  const pin=makePin();
  const encrypted=await encrypt(z.bytes,pin);
  return {payload:bytesToB64(encrypted),pin,mode:z.compressed?'G':'J'};
}
async function decodePackage(payload,pin,mode){
  let bytes=await decrypt(b64ToBytes(payload),pin);
  if(mode==='G')bytes=await gunzip(bytes);
  return JSON.parse(new TextDecoder().decode(bytes));
}

function setPanel(name){
  ['homePanel','sendPanel','receivePanel'].forEach(id=>$('#'+id).classList.toggle('hidden',id!==name));
}
function updateHomeStats(){
  const d=db();
  const pats=d.people.filter(p=>p.type==='PATIENT').length;
  const comps=d.people.filter(p=>p.type==='COMPANION').length;
  $('#dbStats').textContent=pats+' patients • '+comps+' companions • '+(d.tx||[]).length+' event transactions';
}
function renderQR(text){
  const el=$('#sendQr');el.innerHTML='';
  new QRCode(el,{
    text,
    width:390,height:390,
    colorDark:'#000000',colorLight:'#ffffff',
    correctLevel:QRCode.CorrectLevel.L
  });
}
function showFrame(i){
  if(!sendFrames.length)return;
  sendIndex=(i+sendFrames.length)%sendFrames.length;
  renderQR(sendFrames[sendIndex]);
  $('#frameLabel').textContent='QR '+(sendIndex+1)+' of '+sendFrames.length;
  $('#frameProgress').style.width=((sendIndex+1)/sendFrames.length*100)+'%';
}
function stopAuto(){
  if(sendTimer){clearInterval(sendTimer);sendTimer=null}
  $('#autoBtn').textContent='AUTO PLAY';
}
function startAuto(){
  if(sendTimer){stopAuto();return}
  $('#autoBtn').textContent='STOP AUTO';
  sendTimer=setInterval(()=>showFrame(sendIndex+1),1200);
}

async function startSend(kind){
  if(!window.QRCode){alert('QR generator unavailable. Reload once while online, then try again.');return}
  if(!crypto.subtle){alert('Secure transfer requires the installed HTTPS/PWA version of this system.');return}
  if(kind==='MASTER'&&!isMasterRole){alert('Only Registration or Admin can send the Master Database.');return}

  stopAuto();
  $('#sendTitle').textContent=kind==='MASTER'?'Send Master Database':'Send This Device’s Updates';
  $('#sendInfo').textContent='Preparing protected offline transfer…';
  $('#sendQr').innerHTML='';
  $('#transferPin').textContent='------';
  setPanel('sendPanel');

  try{
    const pkg=buildPackage(kind);
    if(kind==='MASTER'&&!pkg.p.length)throw new Error('No attendees are loaded on this device.');
    const encoded=await encodePackage(pkg);
    const session=sessionCode();
    const checksum=fnv(encoded.payload);
    const chunks=[];
    for(let i=0;i<encoded.payload.length;i+=CHUNK_SIZE)chunks.push(encoded.payload.slice(i,i+CHUNK_SIZE));
    const total=chunks.length;
    sendFrames=chunks.map((chunk,i)=>[
      PREFIX,session,encoded.mode,(i+1)+'/'+total,checksum,chunk
    ].join('|'));
    sendIndex=0;
    $('#transferPin').textContent=encoded.pin;
    $('#sendInfo').textContent=
      (kind==='MASTER'
        ? pkg.p.length+' attendee records'
        : pkg.p.length+' updated attendee records • '+pkg.x.length+' transactions')+
      ' • '+total+' QR frame'+(total===1?'':'s');
    showFrame(0);
  }catch(e){
    $('#sendInfo').textContent='Could not prepare transfer: '+(e.message||e);
  }
}

function resetReceive(){
  receiveSession=null;
  receivedChunks=new Map();
  decodedEnvelope=null;
  $('#receiveProgress').style.width='0%';
  $('#receiveCount').textContent='0 QR frames received';
  $('#receiveStatus').textContent='Point this camera at the sending device.';
  $('#pinBox').classList.add('hidden');
  $('#previewBox').classList.add('hidden');
  $('#applyBtn').disabled=true;
  $('#receivePin').value='';
}

function parseFrame(text){
  const parts=String(text||'').split('|');
  if(parts.length<6||parts[0]!==PREFIX)return null;
  const session=parts[1],mode=parts[2],seq=parts[3].split('/'),checksum=parts[4];
  const index=parseInt(seq[0],10),total=parseInt(seq[1],10);
  if(!session||!['G','J'].includes(mode)||!Number.isFinite(index)||!Number.isFinite(total)||index<1||index>total)return null;
  return {session,mode,index,total,checksum,chunk:parts.slice(5).join('|')};
}
function acceptFrame(frame){
  if(!receiveSession){
    receiveSession={session:frame.session,mode:frame.mode,total:frame.total,checksum:frame.checksum};
  }
  if(frame.session!==receiveSession.session)return;
  if(frame.total!==receiveSession.total||frame.checksum!==receiveSession.checksum)return;
  receivedChunks.set(frame.index,frame.chunk);
  const got=receivedChunks.size,total=receiveSession.total;
  $('#receiveCount').textContent=got+' of '+total+' QR frames received';
  $('#receiveProgress').style.width=(got/total*100)+'%';
  $('#receiveStatus').textContent=got===total?'Transfer captured. Enter the 6-digit PIN from the sending device.':'Keep both devices steady. Frames can arrive in any order.';
  if(got===total){
    stopCamera();
    $('#pinBox').classList.remove('hidden');
    $('#receivePin').focus();
  }
}
async function unlockTransfer(){
  if(!receiveSession||receivedChunks.size!==receiveSession.total)return;
  const pin=$('#receivePin').value.replace(/\D/g,'').slice(0,6);
  if(pin.length!==6){$('#receiveStatus').textContent='Enter the 6-digit Transfer PIN.';return}
  const payload=Array.from({length:receiveSession.total},(_,i)=>receivedChunks.get(i+1)||'').join('');
  if(fnv(payload)!==receiveSession.checksum){
    $('#receiveStatus').textContent='Transfer check failed. Reset and scan again.';
    return;
  }
  $('#unlockBtn').disabled=true;
  $('#receiveStatus').textContent='Opening protected transfer…';
  try{
    const pkg=await decodePackage(payload,pin,receiveSession.mode);
    if(!pkg||pkg.e!=='PDW2027'||!Array.isArray(pkg.p))throw new Error('Invalid PD Warriors transfer.');
    decodedEnvelope=pkg;
    const patients=pkg.p.filter(x=>x.t!=='C').length;
    const companions=pkg.p.filter(x=>x.t==='C').length;
    $('#previewTitle').textContent=pkg.k==='MASTER'?'Master Database Ready':'Station Updates Ready';
    $('#previewText').innerHTML=
      '<strong>From:</strong> '+esc(pkg.n||'Staff')+' • '+esc(pkg.r||'')+'<br>'+
      '<strong>Created:</strong> '+esc(new Date(pkg.c).toLocaleString())+'<br>'+
      '<strong>Records:</strong> '+patients+' patients • '+companions+' companions'+
      (pkg.k==='UPDATES'?'<br><strong>Transactions:</strong> '+((pkg.x||[]).length):'');
    $('#previewBox').classList.remove('hidden');
    $('#applyBtn').disabled=false;
    $('#receiveStatus').textContent='Review the transfer summary, then apply it to this device.';
  }catch(e){
    decodedEnvelope=null;
    $('#previewBox').classList.add('hidden');
    $('#applyBtn').disabled=true;
    $('#receiveStatus').textContent='Could not open transfer. Check the PIN and try again.';
  }finally{
    $('#unlockBtn').disabled=false;
  }
}

function earlier(a,b){
  if(!a)return b||'';
  if(!b)return a||'';
  return new Date(a)<=new Date(b)?a:b;
}
function mergePackage(pkg){
  const d=db();
  d.people=Array.isArray(d.people)?d.people:[];
  d.tx=Array.isArray(d.tx)?d.tx:[];

  for(const packed of pkg.p||[]){
    const incoming=unpackPerson(packed);
    if(!incoming.id)continue;
    let p=d.people.find(x=>x.id===incoming.id);
    if(!p){
      p={
        ...incoming,
        biometric:false,verifyMethod:null,
        raffle:incoming.type==='COMPANION'?false:incoming.raffle,
        registeredAt:new Date().toISOString(),
        documents:{seniorId:'NOT REQUIRED',pwdId:'NOT REQUIRED',authorization:'NOT REQUIRED'}
      };
      d.people.push(p);
      continue;
    }

    p.type=incoming.type;
    if(incoming.name)p.name=incoming.name;
    if(incoming.nickname)p.nickname=incoming.nickname;
    if(incoming.location)p.location=incoming.location;
    if(incoming.linkedPatientId)p.linkedPatientId=incoming.linkedPatientId;
    if(incoming.companionOf)p.companionOf=incoming.companionOf;

    if(['CANCELLED','NO SHOW'].includes(incoming.registrationStatus)){
      p.registrationStatus=incoming.registrationStatus;
    }else if(!['CANCELLED','NO SHOW'].includes(p.registrationStatus)){
      p.registrationStatus=incoming.registrationStatus||p.registrationStatus||'CONFIRMED';
    }

    if(incoming.arrived){p.arrived=true;p.arrivalAt=earlier(p.arrivalAt,incoming.arrivalAt)}
    if(incoming.snack){p.snack=true;p.snackAt=earlier(p.snackAt,incoming.snackAt)}
    if(incoming.lunch){p.lunch=true;p.lunchAt=earlier(p.lunchAt,incoming.lunchAt)}
    if(p.type==='COMPANION'){
      p.raffle=false;p.raffleAt='';
    }else if(incoming.raffle){
      p.raffle=true;p.raffleAt=earlier(p.raffleAt,incoming.raffleAt);
    }
  }

  const known=new Set(d.tx.map(txKey));
  for(const packed of pkg.x||[]){
    const t=unpackTx(packed),key=txKey(t);
    if(!known.has(key)){d.tx.push(t);known.add(key)}
  }

  d.pending=d.tx.length;
  d.syncedAt=new Date().toISOString();
  saveDb(d);

  if(Array.isArray(pkg.w)&&pkg.w.length){
    let local=[];
    try{local=JSON.parse(localStorage.getItem(RAFFLE_KEY)||'[]')}catch(e){}
    const seen=new Set((Array.isArray(local)?local:[]).map(x=>typeof x==='string'?x:(x.id||JSON.stringify(x))));
    for(const w of pkg.w){
      const key=typeof w==='string'?w:(w.id||JSON.stringify(w));
      if(!seen.has(key)){local.push(w);seen.add(key)}
    }
    localStorage.setItem(RAFFLE_KEY,JSON.stringify(local));
  }

  if(pkg.m)localStorage.setItem('pdw2027RegistrationUpdatedAt',pkg.m);
  localStorage.setItem('pdw2027LastQuickTransfer',JSON.stringify({
    kind:pkg.k,fromRole:pkg.r,fromName:pkg.n,createdAt:pkg.c,receivedAt:new Date().toISOString()
  }));

  return d;
}

function applyTransfer(){
  if(!decodedEnvelope)return;
  const d=mergePackage(decodedEnvelope);
  const patients=d.people.filter(p=>p.type==='PATIENT').length;
  const companions=d.people.filter(p=>p.type==='COMPANION').length;
  $('#receiveStatus').textContent='TRANSFER COMPLETE ✓ '+patients+' patients • '+companions+' companions are ready on this device.';
  $('#applyBtn').disabled=true;
  $('#previewTitle').textContent='Transfer Complete ✓';
  $('#previewText').innerHTML='This device is ready for offline event use. Existing check-in and claim records were preserved.';
  updateHomeStats();
}

async function startCamera(){
  resetReceive();
  setPanel('receivePanel');
  if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia){
    $('#receiveStatus').textContent='Camera access is unavailable in this browser.';
    return;
  }
  try{
    cameraStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});
    const video=$('#camera');
    video.srcObject=cameraStream;
    await video.play();
    $('#receiveStatus').textContent='Camera ready. Point it at the sending device.';
    scanLoop();
  }catch(e){
    $('#receiveStatus').textContent='Camera permission is required to receive a Quick Transfer.';
  }
}
function stopCamera(){
  if(scanRAF){cancelAnimationFrame(scanRAF);scanRAF=0}
  if(cameraStream){cameraStream.getTracks().forEach(t=>t.stop());cameraStream=null}
}
function scanLoop(){
  const video=$('#camera'),canvas=$('#scanCanvas');
  if(!cameraStream)return;
  if(video.readyState>=2&&video.videoWidth){
    canvas.width=video.videoWidth;canvas.height=video.videoHeight;
    const ctx=canvas.getContext('2d',{willReadFrequently:true});
    ctx.drawImage(video,0,0,canvas.width,canvas.height);
    const img=ctx.getImageData(0,0,canvas.width,canvas.height);
    const code=window.jsQR?jsQR(img.data,img.width,img.height,{inversionAttempts:'dontInvert'}):null;
    if(code&&code.data){
      const frame=parseFrame(code.data);
      if(frame)acceptFrame(frame);
    }
  }
  scanRAF=requestAnimationFrame(scanLoop);
}

function init(){
  if(sessionStorage.getItem('pdwStaffSession')!=='1'){
    location.replace('./login.html?v=77');
    return;
  }
  $('#who').textContent=staffName+' • '+role;
  updateHomeStats();
  if(!isMasterRole)$('#sendMasterBtn').classList.add('hidden');

  $('#sendMasterBtn').onclick=()=>startSend('MASTER');
  $('#sendUpdatesBtn').onclick=()=>startSend('UPDATES');
  $('#receiveBtn').onclick=startCamera;
  $('#backHome1').onclick=()=>{stopAuto();setPanel('homePanel')};
  $('#backHome2').onclick=()=>{stopCamera();setPanel('homePanel')};
  $('#prevBtn').onclick=()=>showFrame(sendIndex-1);
  $('#nextBtn').onclick=()=>showFrame(sendIndex+1);
  $('#autoBtn').onclick=startAuto;
  $('#resetReceiveBtn').onclick=()=>{stopCamera();startCamera()};
  $('#unlockBtn').onclick=unlockTransfer;
  $('#applyBtn').onclick=applyTransfer;
  $('#receivePin').addEventListener('input',e=>{e.target.value=e.target.value.replace(/\D/g,'').slice(0,6)});
  $('#receivePin').addEventListener('keydown',e=>{if(e.key==='Enter')unlockTransfer()});
  window.addEventListener('beforeunload',()=>{stopAuto();stopCamera()});
}
document.addEventListener('DOMContentLoaded',init);
})();