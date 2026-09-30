(()=>{
  const NEW_VERSION='33';
  let activeFilter='ALL';
  let currentProfileId='';
  let addCompanionPatientId='';

  const esc=v=>String(v==null?'':v)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');

  const norm=v=>String(v||'').toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim();

  const fmtTime=v=>{
    if(!v)return '—';
    try{return new Date(v).toLocaleString()}catch(e){return String(v)}
  };

  function scrollToEl(el){
    if(el)el.scrollIntoView({behavior:'smooth',block:'start'});
  }

  function injectStyles(){
    if(document.querySelector('#registrationEnhancementStyles'))return;
    const s=document.createElement('style');
    s.id='registrationEnhancementStyles';
    s.textContent=`
      .reg-tools-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
      .reg-filterbar{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}
      .reg-filterbar button{width:auto;min-height:46px;margin:0;padding:9px 13px;font-size:14px}
      .reg-filterbar button.active{background:#0f5132;color:#fff;border-color:#0f5132}
      .reg-profile-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
      .reg-profile-item{background:#f6f2e8;border-radius:14px;padding:12px}
      .reg-profile-item b{display:block;color:#0f5132;font-size:13px;margin-bottom:3px}
      .reg-companion-row{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:11px 0;border-bottom:1px solid #e8e1d3}
      .reg-companion-row:last-child{border-bottom:0}
      .reg-actions{display:flex;gap:7px;flex-wrap:wrap}.reg-actions button{width:auto;min-height:42px;margin:0;padding:8px 11px;font-size:14px;border-radius:11px}
      @media(max-width:650px){
        .reg-tools-grid,.reg-profile-grid{grid-template-columns:1fr}
        .reg-filterbar{display:grid;grid-template-columns:1fr 1fr}
        .reg-filterbar button{width:100%}
        .reg-companion-row{align-items:flex-start;flex-direction:column}
      }
    `;
    document.head.appendChild(s);
  }

  function injectTools(){
    const uploadCard=Array.from(document.querySelectorAll('.card')).find(c=>c.querySelector('#csvFile'));
    if(!uploadCard||document.querySelector('#registrationToolsCard'))return;

    const card=document.createElement('div');
    card.className='card';
    card.id='registrationToolsCard';
    card.innerHTML=`
      <h2>Registration Tools</h2>
      <div class="reg-tools-grid">
        <button class="primary" id="addWalkinBtn" data-new-feature="walk-in-v33">+ ADD WALK-IN ATTENDEE</button>
        <button class="ghost" id="showReviewBtn" data-new-feature="needs-review-v33">SHOW NEEDS REVIEW</button>
      </div>
    `;
    uploadCard.parentNode.insertBefore(card,uploadCard);

    const walk=document.createElement('div');
    walk.className='card hidden';
    walk.id='walkinCard';
    walk.innerHTML=`
      <h2>Add Walk-In Attendee</h2>
      <div class="editgrid">
        <div class="full"><label for="walkName">Full Name</label><input id="walkName" placeholder="Enter full name"></div>
        <div><label for="walkNickname">Nickname</label><input id="walkNickname" placeholder="Optional"></div>
        <div><label for="walkType">Type</label><select id="walkType"><option value="PATIENT">PATIENT / PD WARRIOR</option><option value="COMPANION">COMPANION</option></select></div>
        <div><label for="walkAge">Age</label><input id="walkAge" inputmode="numeric" placeholder="Optional"></div>
        <div><label for="walkLocation">City / Area</label><input id="walkLocation" placeholder="Optional"></div>
        <div class="full hidden" id="walkLinkedWrap"><label for="walkLinkedPatient">Linked Patient</label><select id="walkLinkedPatient"></select></div>
      </div>
      <button class="primary" id="saveWalkin">SAVE WALK-IN</button>
      <button class="ghost" id="cancelWalkin">CANCEL</button>
      <div id="walkinMsg" class="status hidden" style="margin-top:12px"></div>
    `;
    uploadCard.parentNode.insertBefore(walk,uploadCard);

    document.querySelector('#addWalkinBtn').onclick=()=>{
      fillPatientSelect();
      walk.classList.remove('hidden');
      document.querySelector('#walkinMsg').classList.add('hidden');
      scrollToEl(walk);
    };
    document.querySelector('#cancelWalkin').onclick=()=>walk.classList.add('hidden');
    document.querySelector('#walkType').onchange=e=>{
      document.querySelector('#walkLinkedWrap').classList.toggle('hidden',e.target.value!=='COMPANION');
    };
    document.querySelector('#saveWalkin').onclick=saveWalkin;
    document.querySelector('#showReviewBtn').onclick=()=>{
      setFilter('REVIEW');
      scrollToEl(document.querySelector('#registrationSearch'));
    };
  }

  function fillPatientSelect(){
    const sel=document.querySelector('#walkLinkedPatient');
    if(!sel)return;
    const patients=PDW.db().people.filter(p=>p.type==='PATIENT').sort((a,b)=>String(a.name).localeCompare(String(b.name)));
    sel.innerHTML='<option value="">Select patient</option>'+patients.map(p=>'<option value="'+esc(p.id)+'">'+esc(p.name)+'</option>').join('');
  }

  function saveWalkin(){
    const name=document.querySelector('#walkName').value.trim();
    const type=document.querySelector('#walkType').value;
    if(!name){alert('Full Name is required.');return}

    const d=PDW.db();
    const id=PDW.nextId(type,d);
    let linkedPatientId='',companionOf='';

    if(type==='COMPANION'){
      linkedPatientId=document.querySelector('#walkLinkedPatient').value;
      if(!linkedPatientId){alert('Select the patient linked to this companion.');return}
      const patient=d.people.find(p=>p.id===linkedPatientId);
      companionOf=patient?patient.name:'';
    }

    const now=new Date().toISOString();
    d.people.push({
      id,type,name,
      nickname:document.querySelector('#walkNickname').value.trim(),
      age:document.querySelector('#walkAge').value.trim(),
      location:document.querySelector('#walkLocation').value.trim(),
      linkedPatientId,companionOf,walkIn:true,sourceKey:'WALKIN-'+Date.now(),
      biometric:false,verifyMethod:null,arrived:false,snack:false,lunch:false,raffle:false,
      needsReview:false,registeredAt:now
    });
    PDW.save(d);
    PDW.addTx(id,'WALK-IN REGISTERED','REGISTRATION');

    const msg=document.querySelector('#walkinMsg');
    msg.className='status';
    msg.textContent='Walk-in saved: '+name+' • '+id;
    ['walkName','walkNickname','walkAge','walkLocation'].forEach(x=>document.querySelector('#'+x).value='');
    fillPatientSelect();
    if(typeof render==='function')render();
    enhanceRowsAndFilter();
  }

  function injectFilters(){
    const count=document.querySelector('#searchCount');
    if(!count||document.querySelector('#regFilterBar'))return;
    const bar=document.createElement('div');
    bar.className='reg-filterbar';
    bar.id='regFilterBar';
    bar.innerHTML=`
      <button class="ghost active regFilterBtn" data-filter="ALL" data-new-feature="registration-filters-v33">ALL</button>
      <button class="ghost regFilterBtn" data-filter="PATIENT" data-new-feature="registration-filters-v33">PATIENTS</button>
      <button class="ghost regFilterBtn" data-filter="COMPANION" data-new-feature="registration-filters-v33">COMPANIONS</button>
      <button class="ghost regFilterBtn" data-filter="NOT_ARRIVED" data-new-feature="registration-filters-v33">NOT ARRIVED</button>
      <button class="ghost regFilterBtn" data-filter="REVIEW" data-new-feature="registration-filters-v33">NEEDS REVIEW</button>
    `;
    count.parentNode.insertBefore(bar,count);
    bar.querySelectorAll('.regFilterBtn').forEach(btn=>btn.onclick=()=>setFilter(btn.dataset.filter));
  }

  function setFilter(filter){
    activeFilter=filter;
    document.querySelectorAll('.regFilterBtn').forEach(b=>b.classList.toggle('active',b.dataset.filter===filter));
    applyFilters();
  }

  function filterMatch(p){
    if(activeFilter==='PATIENT')return p.type==='PATIENT';
    if(activeFilter==='COMPANION')return p.type==='COMPANION';
    if(activeFilter==='NOT_ARRIVED')return !p.arrived;
    if(activeFilter==='REVIEW')return !!p.needsReview;
    return true;
  }

  function enhanceRowsAndFilter(){
    const tbody=document.querySelector('#rows');
    if(!tbody)return;
    const d=PDW.db();

    Array.from(tbody.querySelectorAll('tr')).forEach((tr,index)=>{
      const cells=tr.querySelectorAll('td');
      if(cells.length<2)return;
      const id=(cells[0].textContent||'').trim();
      const p=d.people.find(x=>x.id===id);
      if(!p)return;

      tr.dataset.personId=id;

      const actions=tr.querySelector('.actions');
      if(actions&&!actions.querySelector('.profileBtn')){
        const btn=document.createElement('button');
        btn.className='ghost profileBtn';
        btn.textContent='PROFILE';
        btn.dataset.id=id;
        if(index===0)btn.setAttribute('data-new-feature','full-profile-v33');
        btn.onclick=()=>openProfile(id);
        actions.insertBefore(btn,actions.firstChild);
      }
    });

    applyFilters();
    if(window.refreshFeatureHighlights)window.refreshFeatureHighlights();
  }

  function applyFilters(){
    const tbody=document.querySelector('#rows');
    if(!tbody)return;
    const d=PDW.db();
    let shown=0;
    tbody.querySelectorAll('tr').forEach(tr=>{
      const id=tr.dataset.personId;
      if(!id){return}
      const p=d.people.find(x=>x.id===id);
      const show=p&&filterMatch(p);
      tr.style.display=show?'':'none';
      if(show)shown++;
    });
    const count=document.querySelector('#searchCount');
    if(count)count.textContent=shown+' shown • '+d.people.length+' total';
  }

  function injectProfileCards(){
    const editCard=document.querySelector('#editCard');
    if(!editCard||document.querySelector('#profileCard'))return;

    const profile=document.createElement('div');
    profile.className='card hidden';
    profile.id='profileCard';
    profile.innerHTML=`
      <h2>Full Attendee Profile</h2>
      <div id="profileDetails" class="reg-profile-grid"></div>
      <div id="companionManager" class="hidden" style="margin-top:18px">
        <h3>Companion Management</h3>
        <div id="companionList"></div>
        <button class="primary" id="profileAddCompanion" data-new-feature="companion-management-v33">+ ADD COMPANION</button>
      </div>
      <div class="reg-tools-grid" style="margin-top:12px">
        <button class="ghost" id="profileEdit">EDIT PROFILE</button>
        <button class="primary" id="profileQr">OPEN QR PASS</button>
      </div>
      <button class="ghost" id="closeProfile">CLOSE PROFILE</button>
    `;
    editCard.parentNode.insertBefore(profile,editCard);

    const add=document.createElement('div');
    add.className='card hidden';
    add.id='addCompanionCard';
    add.innerHTML=`
      <h2>Add Companion</h2>
      <div id="companionPatientName" class="status"></div>
      <div class="editgrid">
        <div class="full"><label for="newCompanionName">Companion Full Name</label><input id="newCompanionName"></div>
        <div><label for="newCompanionNickname">Nickname</label><input id="newCompanionNickname"></div>
        <div><label for="newCompanionAge">Age</label><input id="newCompanionAge" inputmode="numeric"></div>
      </div>
      <button class="primary" id="saveCompanion">SAVE COMPANION</button>
      <button class="ghost" id="cancelCompanion">CANCEL</button>
      <div id="companionMsg" class="status hidden" style="margin-top:12px"></div>
    `;
    editCard.parentNode.insertBefore(add,editCard);

    document.querySelector('#profileEdit').onclick=()=>{if(currentProfileId&&typeof openEdit==='function')openEdit(currentProfileId)};
    document.querySelector('#profileQr').onclick=()=>{if(currentProfileId){PDW.setActive(currentProfileId);location.href='./pass.html?staff=1&v='+NEW_VERSION}};
    document.querySelector('#profileAddCompanion').onclick=()=>{if(currentProfileId)openAddCompanion(currentProfileId)};
    document.querySelector('#closeProfile').onclick=()=>{profile.classList.add('hidden');currentProfileId=''};
    document.querySelector('#saveCompanion').onclick=saveCompanion;
    document.querySelector('#cancelCompanion').onclick=()=>add.classList.add('hidden');
  }

  function openProfile(id){
    currentProfileId=id;
    renderProfile();
    const card=document.querySelector('#profileCard');
    card.classList.remove('hidden');
    scrollToEl(card);
  }

  function renderProfile(){
    const p=PDW.person(currentProfileId);
    const card=document.querySelector('#profileCard');
    if(!p||!card){if(card)card.classList.add('hidden');currentProfileId='';return}

    const raffleText=p.type==='COMPANION'?'NOT ELIGIBLE':p.raffle?'CLAIMED ✓':'AVAILABLE';
    document.querySelector('#profileDetails').innerHTML=
      '<div class="reg-profile-item"><b>ID</b>'+esc(p.id)+'</div>'+
      '<div class="reg-profile-item"><b>Type</b>'+esc(p.type)+'</div>'+
      '<div class="reg-profile-item"><b>Full Name</b>'+esc(p.name)+'</div>'+
      '<div class="reg-profile-item"><b>Nickname</b>'+esc(p.nickname||'—')+'</div>'+
      '<div class="reg-profile-item"><b>Age</b>'+esc(p.age||'—')+'</div>'+
      '<div class="reg-profile-item"><b>City / Area</b>'+esc(p.location||'—')+'</div>'+
      '<div class="reg-profile-item"><b>Linked Patient</b>'+esc(p.companionOf||'—')+'</div>'+
      '<div class="reg-profile-item"><b>Walk-In</b>'+(p.walkIn?'YES':'NO')+'</div>'+
      '<div class="reg-profile-item"><b>Biometric</b>'+(p.biometric?'VERIFIED ✓':'NOT VERIFIED')+'</div>'+
      '<div class="reg-profile-item"><b>Arrival</b>'+(p.arrived?'ARRIVED ✓ • '+esc(fmtTime(p.arrivalAt)):'NOT ARRIVED')+'</div>'+
      '<div class="reg-profile-item"><b>Snack</b>'+(p.snack?'CLAIMED ✓ • '+esc(fmtTime(p.snackAt)):'AVAILABLE')+'</div>'+
      '<div class="reg-profile-item"><b>Lunch</b>'+(p.lunch?'CLAIMED ✓ • '+esc(fmtTime(p.lunchAt)):'AVAILABLE')+'</div>'+
      '<div class="reg-profile-item"><b>Raffle</b>'+esc(raffleText)+'</div>'+
      '<div class="reg-profile-item"><b>Registered</b>'+esc(fmtTime(p.registeredAt))+'</div>'+
      '<div class="reg-profile-item"><b>Needs Review</b>'+(p.needsReview?'YES ⚠':'NO')+'</div>'+
      '<div class="reg-profile-item"><b>Last Updated</b>'+esc(fmtTime(p.updatedAt))+'</div>';

    const manager=document.querySelector('#companionManager');
    if(p.type==='PATIENT'){
      manager.classList.remove('hidden');
      const d=PDW.db();
      const companions=d.people.filter(c=>c.type==='COMPANION'&&(c.linkedPatientId===p.id||norm(c.companionOf)===norm(p.name)));
      document.querySelector('#companionList').innerHTML=companions.length?companions.map(c=>
        '<div class="reg-companion-row"><div><b>'+esc(c.name)+'</b><div class="small">'+esc(c.nickname||'No nickname')+(c.age?' • Age '+esc(c.age):'')+'</div></div>'+
        '<div class="reg-actions"><button class="ghost companionEditBtn" data-id="'+esc(c.id)+'">EDIT</button><button class="ghost companionUnlinkBtn" data-id="'+esc(c.id)+'">UNLINK</button><button class="primary companionQrBtn" data-id="'+esc(c.id)+'">QR</button></div></div>'
      ).join(''):'<div class="status warn">No companions linked to this patient.</div>';

      document.querySelectorAll('.companionEditBtn').forEach(b=>b.onclick=()=>{if(typeof openEdit==='function')openEdit(b.dataset.id)});
      document.querySelectorAll('.companionQrBtn').forEach(b=>b.onclick=()=>{PDW.setActive(b.dataset.id);location.href='./pass.html?staff=1&v='+NEW_VERSION});
      document.querySelectorAll('.companionUnlinkBtn').forEach(b=>b.onclick=()=>unlinkCompanion(b.dataset.id,p));
    }else{
      manager.classList.add('hidden');
    }
  }

  function openAddCompanion(patientId){
    const p=PDW.person(patientId);
    if(!p||p.type!=='PATIENT')return;
    addCompanionPatientId=patientId;
    document.querySelector('#companionPatientName').textContent='Patient: '+p.name;
    ['newCompanionName','newCompanionNickname','newCompanionAge'].forEach(x=>document.querySelector('#'+x).value='');
    document.querySelector('#companionMsg').classList.add('hidden');
    const card=document.querySelector('#addCompanionCard');
    card.classList.remove('hidden');
    scrollToEl(card);
  }

  function saveCompanion(){
    const patient=PDW.person(addCompanionPatientId);
    const name=document.querySelector('#newCompanionName').value.trim();
    if(!patient||patient.type!=='PATIENT'){alert('Linked patient was not found.');return}
    if(!name){alert('Companion full name is required.');return}

    const d=PDW.db();
    const id=PDW.nextId('COMPANION',d);
    const now=new Date().toISOString();
    d.people.push({
      id,type:'COMPANION',name,
      nickname:document.querySelector('#newCompanionNickname').value.trim(),
      age:document.querySelector('#newCompanionAge').value.trim(),
      linkedPatientId:patient.id,companionOf:patient.name,location:patient.location||'',
      sourceKey:'COMPANION-'+Date.now(),manualCompanion:true,
      biometric:false,verifyMethod:null,arrived:false,snack:false,lunch:false,raffle:false,
      needsReview:false,registeredAt:now
    });
    PDW.save(d);
    PDW.addTx(id,'COMPANION ADDED','REGISTRATION');

    const msg=document.querySelector('#companionMsg');
    msg.className='status';
    msg.textContent='Companion added: '+name+' • '+id;

    if(typeof render==='function')render();
    enhanceRowsAndFilter();
    renderProfile();
  }

  function unlinkCompanion(id,patient){
    const p=PDW.person(id);
    if(!p)return;
    if(!confirm('Unlink '+p.name+' from '+patient.name+'? The companion record will be kept.'))return;
    PDW.updatePerson(id,x=>{
      x.linkedPatientId='';
      x.companionOf='';
      x.needsReview=true;
      x.updatedAt=new Date().toISOString();
    });
    PDW.addTx(id,'COMPANION UNLINKED','REGISTRATION');
    if(typeof render==='function')render();
    enhanceRowsAndFilter();
    renderProfile();
  }

  function hookExistingEdit(){
    const save=document.querySelector('#saveEdit');
    if(!save)return;
    save.addEventListener('click',()=>{
      setTimeout(()=>{
        if(currentProfileId)renderProfile();
        enhanceRowsAndFilter();
      },0);
    });
  }

  function observeRows(){
    const tbody=document.querySelector('#rows');
    if(!tbody)return;
    let busy=false;
    new MutationObserver(()=>{
      if(busy)return;
      busy=true;
      requestAnimationFrame(()=>{
        enhanceRowsAndFilter();
        busy=false;
      });
    }).observe(tbody,{childList:true});
  }

  injectStyles();
  injectTools();
  injectFilters();
  injectProfileCards();
  hookExistingEdit();
  observeRows();

  const search=document.querySelector('#registrationSearch');
  if(search)search.addEventListener('input',()=>setTimeout(applyFilters,0));

  fillPatientSelect();
  enhanceRowsAndFilter();
})();