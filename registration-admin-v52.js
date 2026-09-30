(()=>{
  const DRAW_WINNERS_KEY='pdw2027RaffleDrawWinnersV51';
  let activeProfileId='';
  let correctionKind='';

  const esc=v=>String(v==null?'':v)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');

  const norm=v=>String(v||'').toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim();

  const fmt=v=>{
    if(!v)return '—';
    try{return new Date(v).toLocaleString()}catch(e){return String(v)}
  };

  function drawStatus(p){
    if(!p)return '—';
    if(p.type==='COMPANION')return 'NOT ELIGIBLE';
    return p.raffleWinner?'WINNER ✓':'NOT DRAWN';
  }

  function syncRaffleDrawColumn(){
    const table=document.querySelector('#rows')?.closest('table');
    if(!table)return;

    const headers=[...table.querySelectorAll('thead th')];
    const raffleIndex=headers.findIndex(th=>/raffle/i.test(th.textContent||''));
    if(raffleIndex<0)return;

    headers[raffleIndex].textContent='Raffle Draw';

    const d=PDW.db();
    table.querySelectorAll('#rows tr').forEach(tr=>{
      const cells=tr.querySelectorAll('td');
      if(cells.length<=raffleIndex)return;
      const id=(cells[0].textContent||'').trim();
      const p=d.people.find(x=>x.id===id);
      if(!p)return;
      cells[raffleIndex].textContent=drawStatus(p);
    });
  }

  function injectRegistrationTools(){
    const tools=document.querySelector('#registrationToolsCard');
    if(!tools||document.querySelector('#resolveDuplicatesBtn'))return;

    const grid=tools.querySelector('.reg-tools-grid');
    if(grid){
      const btn=document.createElement('button');
      btn.className='ghost';
      btn.id='resolveDuplicatesBtn';
      btn.setAttribute('data-new-feature','merge-duplicates-v52');
      btn.textContent='RESOLVE DUPLICATES';
      grid.appendChild(btn);
      btn.onclick=openDuplicateResolver;
    }

    const note=document.createElement('div');
    note.className='status';
    note.style.marginTop='10px';
    note.innerHTML='<b>Raffle is now a Draw.</b> Registration shows WINNER / NOT DRAWN / NOT ELIGIBLE.';
    tools.appendChild(note);
  }

  function duplicatePairs(){
    const d=PDW.db();
    const map=new Map();
    d.people.forEach(p=>{
      const key=p.type+'|'+norm(p.name);
      if(!norm(p.name))return;
      if(!map.has(key))map.set(key,[]);
      map.get(key).push(p);
    });
    return [...map.values()].filter(g=>g.length>1);
  }

  function optionLabel(p){
    const flags=[
      p.arrived?'ARRIVED':'',
      p.snack?'SNACK':'',
      p.lunch?'LUNCH':'',
      p.raffleWinner?'RAFFLE WINNER':''
    ].filter(Boolean).join(', ');
    return p.name+' • '+p.id+' • '+p.type+(flags?' • '+flags:'');
  }

  function injectDuplicateResolver(){
    if(document.querySelector('#duplicateResolverCard'))return;
    const edit=document.querySelector('#editCard');
    if(!edit)return;

    const card=document.createElement('div');
    card.className='card hidden';
    card.id='duplicateResolverCard';
    card.innerHTML=`
      <h2>Resolve Duplicate Records</h2>
      <div id="duplicateSummary" class="status warn"></div>

      <label for="keepDuplicateRecord">KEEP THIS RECORD</label>
      <select id="keepDuplicateRecord"></select>

      <label for="mergeDuplicateRecord">MERGE THIS DUPLICATE INTO THE RECORD ABOVE</label>
      <select id="mergeDuplicateRecord"></select>

      <div id="duplicatePreview" class="status warn" style="margin-top:12px"></div>

      <button class="primary" id="confirmDuplicateMerge">MERGE DUPLICATE RECORDS</button>
      <button class="ghost" id="closeDuplicateResolver">CLOSE</button>
      <div id="duplicateMergeMessage" class="status hidden" style="margin-top:12px"></div>
    `;
    edit.parentNode.insertBefore(card,edit);

    document.querySelector('#keepDuplicateRecord').onchange=renderDuplicatePreview;
    document.querySelector('#mergeDuplicateRecord').onchange=renderDuplicatePreview;
    document.querySelector('#confirmDuplicateMerge').onclick=mergeDuplicateRecords;
    document.querySelector('#closeDuplicateResolver').onclick=()=>card.classList.add('hidden');
  }

  function fillDuplicateSelects(){
    const d=PDW.db();
    const records=d.people.slice().sort((a,b)=>String(a.name).localeCompare(String(b.name)));
    const opts='<option value="">Select record</option>'+
      records.map(p=>'<option value="'+esc(p.id)+'">'+esc(optionLabel(p))+'</option>').join('');

    const keep=document.querySelector('#keepDuplicateRecord');
    const merge=document.querySelector('#mergeDuplicateRecord');
    if(!keep||!merge)return;
    keep.innerHTML=opts;
    merge.innerHTML=opts;

    const groups=duplicatePairs();
    const summary=document.querySelector('#duplicateSummary');
    summary.className=groups.length?'status warn':'status';
    summary.textContent=groups.length
      ? groups.length+' possible exact-name duplicate group'+(groups.length===1?'':'s')+' found.'
      : 'No exact-name duplicate groups detected. You can still manually select two records to merge.';

    if(groups.length){
      keep.value=groups[0][0].id;
      merge.value=groups[0][1].id;
    }
    renderDuplicatePreview();
  }

  function openDuplicateResolver(){
    injectDuplicateResolver();
    fillDuplicateSelects();
    const card=document.querySelector('#duplicateResolverCard');
    card.classList.remove('hidden');
    card.scrollIntoView({behavior:'smooth',block:'start'});
  }

  function renderDuplicatePreview(){
    const keepId=document.querySelector('#keepDuplicateRecord')?.value||'';
    const mergeId=document.querySelector('#mergeDuplicateRecord')?.value||'';
    const box=document.querySelector('#duplicatePreview');
    if(!box)return;

    if(!keepId||!mergeId){
      box.textContent='Select the record to keep and the duplicate to merge.';
      return;
    }
    if(keepId===mergeId){
      box.className='status bad';
      box.textContent='Choose two different records.';
      return;
    }

    const keep=PDW.person(keepId),dup=PDW.person(mergeId);
    if(!keep||!dup)return;
    box.className='status warn';
    box.innerHTML=
      '<b>KEEP:</b> '+esc(optionLabel(keep))+'<br>'+
      '<b>MERGE:</b> '+esc(optionLabel(dup))+'<br><br>'+
      'Arrival, Snack, Lunch, biometric verification, Raffle Winner status, document progress, and audit history will be preserved.';
  }

  function bestDoc(a,b){
    const rank={'NOT REQUIRED':0,'PENDING':1,'RECEIVED':2,'VERIFIED':3};
    a=a||'NOT REQUIRED';b=b||'NOT REQUIRED';
    return (rank[b]||0)>(rank[a]||0)?b:a;
  }

  function mergeDuplicateRecords(){
    const keepId=document.querySelector('#keepDuplicateRecord').value;
    const dupId=document.querySelector('#mergeDuplicateRecord').value;
    const msg=document.querySelector('#duplicateMergeMessage');

    if(!keepId||!dupId||keepId===dupId){
      msg.className='status bad';
      msg.textContent='Select two different records.';
      return;
    }

    const d=PDW.db();
    const keep=d.people.find(p=>p.id===keepId);
    const dup=d.people.find(p=>p.id===dupId);
    if(!keep||!dup){
      msg.className='status bad';
      msg.textContent='One of the selected records could not be found.';
      return;
    }
    if(keep.type!==dup.type){
      msg.className='status bad';
      msg.textContent='For safety, only records of the same attendee type can be merged.';
      return;
    }

    if(!confirm('Merge '+dup.name+' ('+dup.id+') into '+keep.name+' ('+keep.id+')?\n\nThe duplicate record will be removed, but its event history will be preserved.'))return;

    const bools=['biometric','arrived','snack','lunch','raffleWinner'];
    bools.forEach(k=>keep[k]=!!keep[k]||!!dup[k]);

    const times=['arrivalAt','snackAt','lunchAt','raffleWinnerAt','registeredAt','updatedAt'];
    times.forEach(k=>{if(!keep[k]&&dup[k])keep[k]=dup[k]});

    ['nickname','age','mobile','location','companionOf','linkedPatientId','sourceKey'].forEach(k=>{
      if(!keep[k]&&dup[k])keep[k]=dup[k];
    });

    const kd=keep.documents||{},dd=dup.documents||{};
    keep.documents={
      seniorId:bestDoc(kd.seniorId,dd.seniorId),
      pwdId:bestDoc(kd.pwdId,dd.pwdId),
      authorization:bestDoc(kd.authorization,dd.authorization)
    };
    keep.needsReview=!!keep.needsReview&&!!dup.needsReview;
    keep.updatedAt=new Date().toISOString();

    if(keep.type==='PATIENT'){
      d.people.forEach(p=>{
        if(p.linkedPatientId===dup.id){
          p.linkedPatientId=keep.id;
          p.companionOf=keep.name;
          p.updatedAt=new Date().toISOString();
        }
      });
    }

    d.tx.forEach(t=>{if(t.id===dup.id)t.id=keep.id});
    d.people=d.people.filter(p=>p.id!==dup.id);

    const now=new Date();
    d.tx.push({
      id:keep.id,
      action:'DUPLICATE RECORD MERGED: '+dup.id+' → '+keep.id,
      station:'REGISTRATION',
      time:now.toLocaleTimeString(),
      timestamp:now.toISOString(),
      staffName:sessionStorage.getItem('pdwStaffName')||'Registration Staff',
      staffRole:sessionStorage.getItem('pdwStaffRole')||'REGISTRATION'
    });
    d.pending=(d.pending||0)+1;
    PDW.save(d);

    msg.className='status';
    msg.textContent='Duplicate merged successfully into '+keep.name+' • '+keep.id+'.';
    fillDuplicateSelects();
    if(typeof window.render==='function')window.render();
    syncRaffleDrawColumn();
  }

  function injectProfileAdditions(){
    const profile=document.querySelector('#profileCard');
    if(!profile||document.querySelector('#registrationActivityV52'))return;

    const close=document.querySelector('#closeProfile');

    const correction=document.createElement('div');
    correction.id='registrationCorrectionV52';
    correction.style.marginTop='18px';
    correction.innerHTML=`
      <h3>Correct Event Transaction</h3>
      <div class="status warn">
        Use only to correct an accidental staff tap. A reason is required and the correction is added to the audit trail.
      </div>
      <div class="reg-tools-grid" style="margin-top:10px">
        <button class="ghost correctionBtn" data-kind="ARRIVAL">UNDO ARRIVAL</button>
        <button class="ghost correctionBtn" data-kind="SNACK">UNDO SNACK</button>
        <button class="ghost correctionBtn" data-kind="LUNCH">UNDO LUNCH</button>
      </div>
      <div id="correctionReasonBox" class="hidden" style="margin-top:12px">
        <div id="correctionKindLabel" class="status warn"></div>
        <label for="correctionReason">Reason for correction</label>
        <input id="correctionReason" placeholder="Example: Staff tapped the wrong attendee">
        <button class="primary" id="confirmCorrection">CONFIRM CORRECTION</button>
        <button class="ghost" id="cancelCorrection">CANCEL</button>
      </div>
      <div id="correctionMessage" class="status hidden" style="margin-top:10px"></div>
    `;

    const activity=document.createElement('div');
    activity.id='registrationActivityV52';
    activity.style.marginTop='18px';
    activity.innerHTML=`
      <h3>Attendee Activity History</h3>
      <div class="tablewrap">
        <table>
          <thead><tr><th>Time</th><th>Activity</th><th>Staff / Station</th></tr></thead>
          <tbody id="registrationActivityRows"></tbody>
        </table>
      </div>
    `;

    profile.insertBefore(correction,close);
    profile.insertBefore(activity,close);

    correction.querySelectorAll('.correctionBtn').forEach(btn=>{
      btn.onclick=()=>openCorrection(btn.dataset.kind);
    });
    document.querySelector('#confirmCorrection').onclick=confirmCorrection;
    document.querySelector('#cancelCorrection').onclick=()=>{
      correctionKind='';
      document.querySelector('#correctionReasonBox').classList.add('hidden');
      document.querySelector('#correctionReason').value='';
    };
  }

  function openCorrection(kind){
    if(!activeProfileId)return;
    const p=PDW.person(activeProfileId);
    if(!p)return;

    const field=kind==='ARRIVAL'?'arrived':kind.toLowerCase();
    if(!p[field]){
      const msg=document.querySelector('#correctionMessage');
      msg.className='status warn';
      msg.textContent='Nothing to undo for '+kind+'.';
      return;
    }

    correctionKind=kind;
    document.querySelector('#correctionKindLabel').textContent='Correction: UNDO '+kind+' for '+p.name;
    document.querySelector('#correctionReasonBox').classList.remove('hidden');
    document.querySelector('#correctionReason').focus();
  }

  function confirmCorrection(){
    if(!activeProfileId||!correctionKind)return;
    const reason=document.querySelector('#correctionReason').value.trim();
    const msg=document.querySelector('#correctionMessage');
    if(reason.length<3){
      msg.className='status bad';
      msg.textContent='Enter a reason for the correction.';
      return;
    }

    const kind=correctionKind;
    PDW.updatePerson(activeProfileId,p=>{
      if(kind==='ARRIVAL'){p.arrived=false;p.arrivalAt=null}
      if(kind==='SNACK'){p.snack=false;p.snackAt=null}
      if(kind==='LUNCH'){p.lunch=false;p.lunchAt=null}
      p.updatedAt=new Date().toISOString();
    });
    PDW.addTx(activeProfileId,'CORRECTION — UNDO '+kind+' — '+reason,'REGISTRATION');

    msg.className='status';
    msg.textContent=kind+' correction saved and added to the audit trail.';
    correctionKind='';
    document.querySelector('#correctionReasonBox').classList.add('hidden');
    document.querySelector('#correctionReason').value='';

    if(typeof window.render==='function')window.render();
    syncRaffleDrawColumn();
    renderProfileExtras();

    setTimeout(()=>{
      const btn=[...document.querySelectorAll('.profileBtn')].find(b=>b.dataset.id===activeProfileId);
      if(btn)btn.click();
    },50);
  }

  function updateRaffleProfileLabel(){
    if(!activeProfileId)return;
    const p=PDW.person(activeProfileId);
    const details=document.querySelector('#profileDetails');
    if(!p||!details)return;

    [...details.querySelectorAll('.reg-profile-item')].forEach(item=>{
      const b=item.querySelector('b');
      if(b&&/^raffle$/i.test(b.textContent.trim())){
        item.innerHTML='<b>Raffle Draw</b>'+esc(drawStatus(p));
      }
    });
  }

  function renderActivity(){
    const body=document.querySelector('#registrationActivityRows');
    if(!body||!activeProfileId)return;

    const p=PDW.person(activeProfileId);
    if(!p)return;

    const d=PDW.db();
    const rows=[];

    if(p.registeredAt)rows.push({
      timestamp:p.registeredAt,
      time:fmt(p.registeredAt),
      action:'REGISTERED',
      staff:'Registration'
    });

    d.tx.filter(t=>t.id===p.id).forEach(t=>{
      rows.push({
        timestamp:t.timestamp||'',
        time:t.timestamp?fmt(t.timestamp):(t.time||'—'),
        action:t.action||'—',
        staff:(t.staffName||'Staff')+' • '+(t.station||'—')
      });
    });

    if(p.raffleWinner&&p.raffleWinnerAt&&!rows.some(r=>/RAFFLE WINNER DRAWN/i.test(r.action))){
      rows.push({
        timestamp:p.raffleWinnerAt,
        time:fmt(p.raffleWinnerAt),
        action:'RAFFLE WINNER DRAWN',
        staff:'Raffle Draw'
      });
    }

    rows.sort((a,b)=>String(b.timestamp).localeCompare(String(a.timestamp)));

    body.innerHTML=rows.length
      ? rows.map(r=>'<tr><td>'+esc(r.time)+'</td><td>'+esc(r.action)+'</td><td>'+esc(r.staff)+'</td></tr>').join('')
      : '<tr><td colspan="3">No activity recorded yet.</td></tr>';
  }

  function renderProfileExtras(){
    updateRaffleProfileLabel();
    renderActivity();

    if(!activeProfileId)return;
    const p=PDW.person(activeProfileId);
    if(!p)return;

    document.querySelectorAll('.correctionBtn').forEach(btn=>{
      const kind=btn.dataset.kind;
      const field=kind==='ARRIVAL'?'arrived':kind.toLowerCase();
      btn.disabled=!p[field];
    });
  }

  function exportRegistrationCSVV52(){
    const d=PDW.db();
    const rows=[[
      'ID','Full Name','Nickname','Type','Age','Mobile','City / Area','Linked Patient',
      'Registration Status','Needs Review','Senior ID','PWD ID','Authorization Letter',
      'Biometric','Arrived','Snack','Lunch','Raffle Draw','Walk-In','Registered At','Updated At'
    ]];

    d.people.forEach(p=>{
      const docs=p.documents||{};
      rows.push([
        p.id,p.name,p.nickname||'',p.type,p.age||'',p.mobile||'',p.location||'',p.companionOf||'',
        p.registrationStatus||'CONFIRMED',p.needsReview?'YES':'NO',
        docs.seniorId||'NOT REQUIRED',docs.pwdId||'NOT REQUIRED',docs.authorization||'NOT REQUIRED',
        p.biometric?'YES':'NO',p.arrived?'YES':'NO',p.snack?'YES':'NO',p.lunch?'YES':'NO',
        drawStatus(p),p.walkIn?'YES':'NO',p.registeredAt||'',p.updatedAt||''
      ]);
    });

    const csv=rows.map(row=>row.map(v=>'"'+String(v??'').replaceAll('"','""')+'"').join(',')).join('\n');
    const blob=new Blob([csv],{type:'text/csv;charset=utf-8'});
    const a=document.createElement('a');
    a.href=URL.createObjectURL(blob);
    a.download='PDW2027-registration-export-v52.csv';
    document.body.appendChild(a);
    a.click();
    setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},0);
  }

  function hookExport(){
    const btn=document.querySelector('#exportRegistrationBtn');
    if(btn)btn.onclick=exportRegistrationCSVV52;
  }

  function hookProfileButtons(){
    document.addEventListener('click',e=>{
      const btn=e.target.closest&&e.target.closest('.profileBtn');
      if(!btn)return;
      activeProfileId=btn.dataset.id||'';
      setTimeout(()=>{
        injectProfileAdditions();
        renderProfileExtras();
      },0);
    });
  }

  function observeTable(){
    const rows=document.querySelector('#rows');
    if(!rows)return;
    let scheduled=false;
    new MutationObserver(()=>{
      if(scheduled)return;
      scheduled=true;
      requestAnimationFrame(()=>{
        syncRaffleDrawColumn();
        scheduled=false;
      });
    }).observe(rows,{childList:true,subtree:true});
  }

  injectRegistrationTools();
  injectDuplicateResolver();
  injectProfileAdditions();
  hookExport();
  hookProfileButtons();
  observeTable();
  syncRaffleDrawColumn();

  window.addEventListener('storage',e=>{
    if(e.key==='pdw2027BioDemoV1'||e.key===DRAW_WINNERS_KEY){
      syncRaffleDrawColumn();
      renderProfileExtras();
    }
  });
})();