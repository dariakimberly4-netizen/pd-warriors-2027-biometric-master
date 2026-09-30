(()=>{
  const NEW_VERSION='37';
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
      .reg-verify-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:12px}
      .reg-verify-grid label{margin-top:0}
      .reg-tools-note{margin-top:10px}
      @media(max-width:650px){
        .reg-tools-grid,.reg-profile-grid,.reg-verify-grid{grid-template-columns:1fr}
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
        <button class="primary" id="addWalkinBtn" data-new-feature="walk-in-v37">+ ADD WALK-IN ATTENDEE</button>
        <button class="ghost" id="showReviewBtn" data-new-feature="needs-review-v37">SHOW NEEDS REVIEW</button>
        <button class="gold" id="exportRegistrationBtn" data-new-feature="registration-export-v37">EXPORT REGISTRATION CSV</button>
        <a class="btn primary" id="namesQuickShareBtn" data-new-feature="names-quickshare-registration-v37" href="./staff-names-share.html?v=39">NAMES QUICK SHARE</a>
      </div>
      <div class="status" style="margin-top:10px"><b>Names Quick Share transfers names only.</b> No Registration details or claim data are sent.</div>
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
        <div><label for="walkMobile">Mobile #</label><input id="walkMobile" inputmode="tel" placeholder="Optional"></div>
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
    document.querySelector('#exportRegistrationBtn').onclick=exportRegistrationCSV;
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

  function duplicateMatches(name,mobile,type,excludeId=''){
    const n=norm(name),m=String(mobile||'').replace(/\D/g,'');
    return PDW.db().people.filter(p=>{
      if(excludeId&&p.id===excludeId)return false;
      if(type&&p.type!==type)return false;
      const sameName=n&&norm(p.name)===n;
      const pm=String(p.mobile||'').replace(/\D/g,'');
      const sameMobile=m.length>=7&&pm.length>=7&&m===pm;
      return sameName||sameMobile;
    });
  }

  function confirmDuplicate(name,mobile,type){
    const matches=duplicateMatches(name,mobile,type);
    if(!matches.length)return true;
    const list=matches.slice(0,4).map(p=>p.name+' • '+p.id).join('\n');
    return confirm('POSSIBLE DUPLICATE FOUND:\n\n'+list+'\n\nSave this record anyway?');
  }

  function saveWalkin(){
    const name=document.querySelector('#walkName').value.trim();
    const type=document.querySelector('#walkType').value;
    const mobile=document.querySelector('#walkMobile').value.trim();
    if(!name){alert('Full Name is required.');return}
    if(!confirmDuplicate(name,mobile,type))return;

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
      mobile,
      linkedPatientId,companionOf,walkIn:true,sourceKey:'WALKIN-'+Date.now(),
      biometric:false,verifyMethod:null,arrived:false,snack:false,lunch:false,raffle:false,
      registrationStatus:'CONFIRMED',
      documents:{seniorId:'NOT REQUIRED',pwdId:'NOT REQUIRED',authorization:'NOT REQUIRED'},
      needsReview:false,registeredAt:now
    });
    PDW.save(d);
    PDW.addTx(id,'WALK-IN REGISTERED','REGISTRATION');

    const msg=document.querySelector('#walkinMsg');
    msg.className='status';
    msg.textContent='Walk-in saved: '+name+' • '+id;
    ['walkName','walkNickname','walkAge','walkLocation','walkMobile'].forEach(x=>document.querySelector('#'+x).value='');
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
      <button class="ghost active regFilterBtn" data-filter="ALL" data-new-feature="registration-filters-v37">ALL</button>
      <button class="ghost regFilterBtn" data-filter="PATIENT" data-new-feature="registration-filters-v37">PATIENTS</button>
      <button class="ghost regFilterBtn" data-filter="COMPANION" data-new-feature="registration-filters-v37">COMPANIONS</button>
      <button class="ghost regFilterBtn" data-filter="NOT_ARRIVED" data-new-feature="registration-filters-v37">NOT ARRIVED</button>
      <button class="ghost regFilterBtn" data-filter="REVIEW" data-new-feature="registration-filters-v37">NEEDS REVIEW</button>
      <button class="ghost regFilterBtn" data-filter="CONFIRMED" data-new-feature="registration-status-filter-v37">CONFIRMED</button>
      <button class="ghost regFilterBtn" data-filter="CANCELLED" data-new-feature="registration-status-filter-v37">CANCELLED</button>
      <button class="ghost regFilterBtn" data-filter="DOCS_PENDING" data-new-feature="document-filter-v37">DOCS PENDING</button>
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
    if(activeFilter==='REVIEW')return !!p.needsReview || p.registrationStatus==='NEEDS REVIEW';
    if(activeFilter==='CONFIRMED')return (p.registrationStatus||'CONFIRMED')==='CONFIRMED';
    if(activeFilter==='CANCELLED')return p.registrationStatus==='CANCELLED';
    if(activeFilter==='DOCS_PENDING'){
      const docs=p.documents||{};
      return ['seniorId','pwdId','authorization'].some(k=>docs[k]==='PENDING'||docs[k]==='RECEIVED');
    }
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
        if(index===0)btn.setAttribute('data-new-feature','full-profile-v37');
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
      <div class="status" style="margin-top:16px"><b>Registration & Document Verification</b></div>
      <div class="reg-verify-grid" data-new-feature="document-verification-v37">
        <div><label for="profileRegStatus">Registration Status</label><select id="profileRegStatus">
          <option value="CONFIRMED">CONFIRMED</option>
          <option value="NEEDS REVIEW">NEEDS REVIEW</option>
          <option value="CANCELLED">CANCELLED</option>
          <option value="NO SHOW">NO SHOW</option>
        </select></div>
        <div><label for="profileSeniorId">Senior ID</label><select id="profileSeniorId">
          <option>NOT REQUIRED</option><option>PENDING</option><option>RECEIVED</option><option>VERIFIED</option>
        </select></div>
        <div><label for="profilePwdId">PWD ID</label><select id="profilePwdId">
          <option>NOT REQUIRED</option><option>PENDING</option><option>RECEIVED</option><option>VERIFIED</option>
        </select></div>
        <div><label for="profileAuthorization">Authorization Letter</label><select id="profileAuthorization">
          <option>NOT REQUIRED</option><option>PENDING</option><option>RECEIVED</option><option>VERIFIED</option>
        </select></div>
      </div>
      <button class="primary" id="saveVerification" data-new-feature="save-verification-v37">SAVE STATUS / DOCUMENTS</button>
      <div id="verificationMsg" class="status hidden" style="margin-top:10px"></div>
      <div id="companionManager" class="hidden" style="margin-top:18px">
        <h3>Companion Management</h3>
        <div id="companionList"></div>
        <button class="primary" id="profileAddCompanion" data-new-feature="companion-management-v37">+ ADD COMPANION</button>
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
    document.querySelector('#saveVerification').onclick=saveProfileVerification;
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
      '<div class="reg-profile-item"><b>Registration Status</b>'+esc(p.registrationStatus||'CONFIRMED')+'</div>'+
      '<div class="reg-profile-item"><b>Needs Review</b>'+(p.needsReview?'YES ⚠':'NO')+'</div>'+
      '<div class="reg-profile-item"><b>Last Updated</b>'+esc(fmtTime(p.updatedAt))+'</div>';

    const docs=p.documents||{seniorId:'NOT REQUIRED',pwdId:'NOT REQUIRED',authorization:'NOT REQUIRED'};
    document.querySelector('#profileRegStatus').value=p.registrationStatus||'CONFIRMED';
    document.querySelector('#profileSeniorId').value=docs.seniorId||'NOT REQUIRED';
    document.querySelector('#profilePwdId').value=docs.pwdId||'NOT REQUIRED';
    document.querySelector('#profileAuthorization').value=docs.authorization||'NOT REQUIRED';

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
    if(!confirmDuplicate(name,'','COMPANION'))return;

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
      registrationStatus:'CONFIRMED',
      documents:{seniorId:'NOT REQUIRED',pwdId:'NOT REQUIRED',authorization:'NOT REQUIRED'},
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
      x.registrationStatus='NEEDS REVIEW';
      x.updatedAt=new Date().toISOString();
    });
    PDW.addTx(id,'COMPANION UNLINKED','REGISTRATION');
    if(typeof render==='function')render();
    enhanceRowsAndFilter();
    renderProfile();
  }

  function saveProfileVerification(){
    if(!currentProfileId)return;
    const status=document.querySelector('#profileRegStatus').value;
    PDW.updatePerson(currentProfileId,p=>{
      p.registrationStatus=status;
      p.needsReview=status==='NEEDS REVIEW';
      p.documents={
        seniorId:document.querySelector('#profileSeniorId').value,
        pwdId:document.querySelector('#profilePwdId').value,
        authorization:document.querySelector('#profileAuthorization').value
      };
      p.updatedAt=new Date().toISOString();
    });
    PDW.addTx(currentProfileId,'REGISTRATION / DOCUMENT STATUS UPDATED','REGISTRATION');
    const msg=document.querySelector('#verificationMsg');
    msg.className='status';
    msg.textContent='Registration status and document verification saved.';
    if(typeof render==='function')render();
    enhanceRowsAndFilter();
    renderProfile();
  }

  function downloadBlob(filename,type,content){
    const a=document.createElement('a');
    a.href=URL.createObjectURL(new Blob([content],{type}));
    a.download=filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},0);
  }

  function exportRegistrationCSV(){
    const d=PDW.db();
    const rows=[[
      'ID','Full Name','Nickname','Type','Age','Mobile','City / Area','Linked Patient',
      'Registration Status','Needs Review','Senior ID','PWD ID','Authorization Letter',
      'Biometric','Arrived','Snack','Lunch','Raffle','Walk-In','Registered At','Updated At'
    ]];
    d.people.forEach(p=>{
      const docs=p.documents||{};
      rows.push([
        p.id,p.name,p.nickname||'',p.type,p.age||'',p.mobile||'',p.location||'',p.companionOf||'',
        p.registrationStatus||'CONFIRMED',p.needsReview?'YES':'NO',
        docs.seniorId||'NOT REQUIRED',docs.pwdId||'NOT REQUIRED',docs.authorization||'NOT REQUIRED',
        p.biometric?'YES':'NO',p.arrived?'YES':'NO',p.snack?'YES':'NO',p.lunch?'YES':'NO',
        p.type==='COMPANION'?'NOT ELIGIBLE':p.raffle?'YES':'NO',
        p.walkIn?'YES':'NO',p.registeredAt||'',p.updatedAt||''
      ]);
    });
    const csv=rows.map(row=>row.map(v=>'"'+String(v??'').replaceAll('"','""')+'"').join(',')).join('\n');
    downloadBlob('PDW2027-registration-export.csv','text/csv;charset=utf-8',csv);

  }

  function hookExistingEdit(){
    const save=document.querySelector('#saveEdit');
    if(!save)return;

    const grid=document.querySelector('#editCard .editgrid');
    if(grid&&!document.querySelector('#editRegistrationStatus')){
      grid.insertAdjacentHTML('beforeend',
        '<div><label for="editRegistrationStatus">Registration Status</label><select id="editRegistrationStatus">'+
        '<option value="CONFIRMED">CONFIRMED</option><option value="NEEDS REVIEW">NEEDS REVIEW</option><option value="CANCELLED">CANCELLED</option><option value="NO SHOW">NO SHOW</option></select></div>'+
        '<div><label for="editSeniorId">Senior ID</label><select id="editSeniorId"><option>NOT REQUIRED</option><option>PENDING</option><option>RECEIVED</option><option>VERIFIED</option></select></div>'+
        '<div><label for="editPwdId">PWD ID</label><select id="editPwdId"><option>NOT REQUIRED</option><option>PENDING</option><option>RECEIVED</option><option>VERIFIED</option></select></div>'+
        '<div><label for="editAuthorization">Authorization Letter</label><select id="editAuthorization"><option>NOT REQUIRED</option><option>PENDING</option><option>RECEIVED</option><option>VERIFIED</option></select></div>'
      );
    }

    const originalOpen=window.openEdit;
    if(typeof originalOpen==='function'){
      window.openEdit=function(id){
        originalOpen(id);
        const p=PDW.person(id);if(!p)return;
        const docs=p.documents||{};
        document.querySelector('#editRegistrationStatus').value=p.registrationStatus||'CONFIRMED';
        document.querySelector('#editSeniorId').value=docs.seniorId||'NOT REQUIRED';
        document.querySelector('#editPwdId').value=docs.pwdId||'NOT REQUIRED';
        document.querySelector('#editAuthorization').value=docs.authorization||'NOT REQUIRED';
      };
    }

    save.addEventListener('click',()=>{
      const id=document.querySelector('#editId').value;
      if(id){
        PDW.updatePerson(id,p=>{
          p.registrationStatus=document.querySelector('#editRegistrationStatus').value;
          p.needsReview=p.registrationStatus==='NEEDS REVIEW';
          p.documents={
            seniorId:document.querySelector('#editSeniorId').value,
            pwdId:document.querySelector('#editPwdId').value,
            authorization:document.querySelector('#editAuthorization').value
          };
          p.updatedAt=new Date().toISOString();
        });
        PDW.addTx(id,'ATTENDEE PROFILE UPDATED','REGISTRATION');
      }
      setTimeout(()=>{
        if(currentProfileId)renderProfile();
        if(typeof render==='function')render();
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