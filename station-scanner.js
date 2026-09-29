(function(){
  const body=document.body;
  const KIND=body.dataset.kind||'ARRIVAL';
  const STATION=body.dataset.station||'STAFF-01';

  const idEl=document.querySelector('#id');
  const resultEl=document.querySelector('#result');
  const actionEl=document.querySelector('#action');
  const findEl=document.querySelector('#find');
  const startEl=document.querySelector('#startScan');
  const stopEl=document.querySelector('#stopScan');
  const videoEl=document.querySelector('#scannerVideo');
  const canvasEl=document.querySelector('#scannerCanvas');
  const cameraBox=document.querySelector('#cameraBox');
  const txEl=document.querySelector('#tx');

  let selected='';
  let stream=null;
  let scanning=false;
  let detector=null;

  function recentTransactions(){
    const d=PDW.db();
    if(!txEl)return;
    txEl.innerHTML=d.tx
      .filter(t=>t.station===STATION)
      .slice()
      .reverse()
      .slice(0,20)
      .map(t=>'<tr><td>'+t.time+'</td><td>'+t.id+'</td><td>'+t.action+'</td></tr>')
      .join('')||'<tr><td colspan="3">No transactions yet.</td></tr>';
  }

  function show(msg,bad=false){
    resultEl.className=bad?'status bad':'status';
    resultEl.textContent=msg;
  }

  function choose(p){
    selected=p?p.id:'';
    if(!p){
      actionEl.disabled=true;
      show('Participant not found.',true);
      return;
    }
    idEl.value=p.id;

    if(KIND==='RAFFLE'&&p.type==='COMPANION'){
      actionEl.disabled=true;
      show(p.name+' — COMPANION — NOT ELIGIBLE FOR RAFFLE',true);
      return;
    }

    const labels=[];
    labels.push(p.name||p.id);
    labels.push(p.type==='COMPANION'?'Companion':'PD Warrior');
    if(p.nickname)labels.push('Nickname: '+p.nickname);
    if(p.location)labels.push(p.location);

    actionEl.disabled=false;
    show(labels.join(' • '));
  }

  function handleScanned(raw){
    const p=PDW.importFromEventPass(raw);
    if(!p){
      show('This is not a valid PD Warriors 2027 event pass.',true);
      return false;
    }
    choose(p);
    stopCamera();
    if(navigator.vibrate)navigator.vibrate(120);
    return true;
  }

  function manualFind(){
    const raw=idEl.value.trim();
    if(!raw){
      show('Scan a QR code or enter a Participant ID.',true);
      return;
    }
    if(raw.startsWith('PDW2027|PASS|')){
      handleScanned(raw);
      return;
    }
    choose(PDW.person(raw.toUpperCase()));
  }

  async function startCamera(){
    if(scanning)return;
    if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia){
      show('Camera scanning is not supported on this device. Use Participant ID instead.',true);
      return;
    }
    try{
      stream=await navigator.mediaDevices.getUserMedia({
        audio:false,
        video:{facingMode:{ideal:'environment'}}
      });
      videoEl.srcObject=stream;
      await videoEl.play();
      cameraBox.classList.remove('hidden');
      scanning=true;
      startEl.disabled=true;
      stopEl.disabled=false;

      if('BarcodeDetector' in window){
        try{
          detector=new BarcodeDetector({formats:['qr_code']});
        }catch(e){detector=null}
      }
      scanLoop();
    }catch(e){
      show('Camera permission was not available. Allow camera access or enter the Participant ID.',true);
    }
  }

  function stopCamera(){
    scanning=false;
    if(stream){
      stream.getTracks().forEach(t=>t.stop());
      stream=null;
    }
    if(videoEl)videoEl.srcObject=null;
    if(cameraBox)cameraBox.classList.add('hidden');
    if(startEl)startEl.disabled=false;
    if(stopEl)stopEl.disabled=true;
  }

  async function scanLoop(){
    if(!scanning)return;
    try{
      if(detector&&videoEl.readyState>=2){
        const codes=await detector.detect(videoEl);
        if(codes&&codes.length){
          if(handleScanned(codes[0].rawValue||''))return;
        }
      }else if(window.jsQR&&videoEl.videoWidth&&videoEl.videoHeight){
        const ctx=canvasEl.getContext('2d',{willReadFrequently:true});
        canvasEl.width=videoEl.videoWidth;
        canvasEl.height=videoEl.videoHeight;
        ctx.drawImage(videoEl,0,0,canvasEl.width,canvasEl.height);
        const img=ctx.getImageData(0,0,canvasEl.width,canvasEl.height);
        const code=jsQR(img.data,img.width,img.height,{inversionAttempts:'dontInvert'});
        if(code&&code.data){
          if(handleScanned(code.data))return;
        }
      }
    }catch(e){}
    setTimeout(scanLoop,220);
  }

  findEl.onclick=manualFind;
  startEl.onclick=startCamera;
  stopEl.onclick=stopCamera;

  actionEl.onclick=()=>{
    if(!selected)return;
    const out=PDW.process(selected,KIND,STATION);
    show(out.msg,!out.ok);
    recentTransactions();
    if(out.ok){
      actionEl.disabled=true;
      idEl.value='';
      selected='';
    }
  };

  window.addEventListener('pagehide',stopCamera);
  recentTransactions();
})();