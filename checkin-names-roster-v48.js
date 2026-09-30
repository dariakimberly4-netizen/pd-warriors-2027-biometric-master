(()=>{
  const ROSTER_KEY='pdw2027NamesRoster:CHECKIN';
  const STATUS_KEY='pdw2027NamesRosterCheckin:CHECKIN';
  const TX_KEY='pdw2027NamesRosterCheckinTx:CHECKIN';
  const REGISTRATION_DB_KEY='pdw2027BioDemoV1';
  let selectedName='';
  let visibleNames=[];

  const norm=v=>String(v||'').toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim();

  function read(key,fallback){
    try{return JSON.parse(localStorage.getItem(key)||JSON.stringify(fallback))}
    catch(e){return fallback}
  }
  function write(key,value){localStorage.setItem(key,JSON.stringify(value))}
  function roster(){return read(ROSTER_KEY,[])}
  function statusMap(){return read(STATUS_KEY,{})}
  function tx(){return read(TX_KEY,[])}

  function uniqueNames(list){
    const seen=new Set();
    return list
      .map(v=>String(v||'').replace(/\s+/g,' ').trim())
      .filter(Boolean)
      .filter(name=>{
        const key=norm(name);
        if(seen.has(key))return false;
        seen.add(key);
        return true;
      });
  }

  function syncFromRegistration(){
    const d=PDW.db();
    const registrationNames=uniqueNames(
      (d.people||[]).map(p=>p.name)
    );

    // The Check-In roster mirrors ALL names currently stored in Registration.
    // No filtering by attendee type or registration status.
    write(ROSTER_KEY,registrationNames);
    localStorage.setItem(ROSTER_KEY+':updatedAt',new Date().toISOString());
    localStorage.setItem(ROSTER_KEY+':source','REGISTRATION ALL NAMES AUTO-SYNC');
    return {registration:registrationNames.length,total:registrationNames.length};
  }

  function inject(){
    if(document.querySelector('#receivedNamesCheckin'))return;
    const recent=Array.from(document.querySelectorAll('.card')).find(c=>c.querySelector('#tx'));
    if(!recent)return;

    const card=document.createElement('div');
    card.className='card';
    card.id='receivedNamesCheckin';
    card.innerHTML=`
      <h2>Registration Names Check-In</h2>
      <div class="status" id="namesRosterSummary">Loading all Registration names…</div>

      <label for="namesSearch">Search Registration Name</label>
      <input id="namesSearch" type="search" autocomplete="off" placeholder="Type first name or last name">

      <div class="small" style="margin-top:10px"><b>Tap a name to select.</b></div>
      <div id="namesList" class="names-roster-list" style="margin-top:8px"></div>

      <div id="selectedNameStatus" class="status warn" style="margin-top:12px">
        No Registration name selected.
      </div>

      <button class="primary" id="confirmNameArrival">CONFIRM ARRIVAL BY NAME</button>

      <div class="status warn" style="margin-top:12px">
        <b>ALL NAMES AUTO-IMPORTED:</b> every name in Registration appears here automatically, including Patients and Companions. QR/Participant ID remains available for verified check-in.
      </div>
    `;
    recent.parentNode.insertBefore(card,recent);

    const style=document.createElement('style');
    style.textContent=`
      .names-roster-list{max-height:360px;overflow:auto;border:1px solid #e1d9ca;border-radius:15px;background:#fffdf8}
      .names-roster-item{
        width:100%;
        margin:0;
        border:0;
        border-bottom:1px solid #ece5d8;
        border-radius:0;
        background:#fffdf8;
        color:#0f5132;
        text-align:left;
        min-height:64px;
        padding:12px 14px;
        font-weight:900;
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:12px;
        cursor:pointer;
        touch-action:manipulation;
      }
      .names-roster-item:last-child{border-bottom:0}
      .names-roster-item.selected{
        background:#eaf5ef;
        box-shadow:inset 4px 0 0 #0f5132;
      }
      .names-roster-item.arrived{background:#f4f4ef}
      .names-roster-item .name-label{
        flex:1;
        min-width:0;
        font-size:17px;
        line-height:1.25;
        color:#0f5132;
      }
      .names-roster-item .status-badge{
        flex:0 0 auto;
        border-radius:999px;
        padding:7px 10px;
        font-size:12px;
        line-height:1;
        font-weight:1000;
        letter-spacing:.03em;
        background:#f3ead7;
        color:#6c531e;
        border:1px solid #dfcfaa;
      }
      .names-roster-item.arrived .status-badge{
        background:#e7f3ec;
        color:#0f5132;
        border-color:#c6decf;
      }
    `;
    document.head.appendChild(style);

    document.querySelector('#namesSearch').addEventListener('input',render);
    document.querySelector('#confirmNameArrival').onclick=confirmArrival;
    render();
  }

  function render(){
    const names=roster();
    const states=statusMap();
    const q=norm(document.querySelector('#namesSearch')?.value||'');
    const filtered=names.filter(name=>!q||norm(name).includes(q));
    visibleNames=filtered.slice();

    if(q && filtered.length===1 && !statusMap()[filtered[0]]?.arrived){
      selectedName=filtered[0];
    }else if(selectedName && !names.includes(selectedName)){
      selectedName='';
    }

    const summary=document.querySelector('#namesRosterSummary');
    if(summary){
      const arrived=names.filter(n=>states[n]?.arrived).length;
      summary.textContent=names.length+' total Registration names • '+arrived+' arrived • '+(names.length-arrived)+' waiting';
    }

    const list=document.querySelector('#namesList');
    if(!list)return;

    if(!names.length){
      list.innerHTML='<div class="small" style="padding:14px">No Registration names are available on this device yet. Open Registration first and load/import the attendee database.</div>';
      selectedName='';
      updateSelected();
      return;
    }

    list.innerHTML=filtered.length
      ? filtered.map(()=>'<button class="names-roster-item"></button>').join('')
      : '<div class="small" style="padding:14px">No matching received name.</div>';

    list.querySelectorAll('.names-roster-item').forEach((btn,i)=>{
      const name=filtered[i];
      const st=states[name]||{};
      btn.classList.toggle('selected',name===selectedName);
      btn.classList.toggle('arrived',!!st.arrived);

      const nameLabel=document.createElement('span');
      nameLabel.className='name-label';
      nameLabel.textContent=name;

      const badge=document.createElement('span');
      badge.className='status-badge';
      badge.textContent=st.arrived?'ARRIVED':'WAITING';

      btn.replaceChildren(nameLabel,badge);

      btn.onclick=()=>{
        selectedName=name;
        updateSelected();
        render();
        const list=document.querySelector('#namesList');
        if(list){
          const selected=list.querySelector('.names-roster-item.selected');
          if(selected)selected.scrollIntoView({block:'nearest'});
        }
      };
    });
    updateSelected();
  }

  function updateSelected(){
    const el=document.querySelector('#selectedNameStatus');
    const btn=document.querySelector('#confirmNameArrival');
    if(!el||!btn)return;

    btn.disabled=false;

    if(!selectedName){
      el.className='status warn';
      el.textContent=visibleNames.length===1
        ? 'Ready to select: '+visibleNames[0]
        : 'Search or tap a Registration name first.';
      btn.textContent='CONFIRM ARRIVAL BY NAME';
      return;
    }

    const st=statusMap()[selectedName];
    if(st?.arrived){
      el.className='status warn';
      el.textContent=selectedName+' — ALREADY ARRIVED';
      btn.textContent='ALREADY ARRIVED';
    }else{
      el.className='status';
      el.textContent='Selected: '+selectedName;
      btn.textContent='CONFIRM ARRIVAL — '+selectedName;
    }
  }

  function confirmArrival(){
    const states=statusMap();

    if(!selectedName){
      const waiting=visibleNames.filter(name=>!states[name]?.arrived);
      if(waiting.length===1){
        selectedName=waiting[0];
        updateSelected();
      }else{
        const el=document.querySelector('#selectedNameStatus');
        el.className='status warn';
        el.textContent=waiting.length
          ? 'Tap the correct name first. '+waiting.length+' matching names are shown.'
          : 'Search for a waiting Registration name first.';
        return;
      }
    }

    if(states[selectedName]?.arrived){
      updateSelected();
      return;
    }

    const now=new Date();
    let linkedRecordId='';
    let verified=false;

    // If this device also has exactly one local Registration record with this exact name,
    // update that full record too. Otherwise keep this strictly as a names-only roster arrival.
    const matches=PDW.db().people.filter(p=>norm(p.name)===norm(selectedName));
    if(matches.length===1){
      const out=PDW.process(matches[0].id,'ARRIVAL','CHECK-IN-01');
      if(out.ok || out.msg==='ALREADY ARRIVED'){
        linkedRecordId=matches[0].id;
        verified=true;
      }
    }

    states[selectedName]={
      arrived:true,
      time:now.toISOString(),
      staff:sessionStorage.getItem('pdwStaffName')||'Check-In Staff',
      linkedRecordId,
      verified
    };
    write(STATUS_KEY,states);

    const history=tx();
    history.push({
      name:selectedName,
      time:now.toISOString(),
      action:verified?'ARRIVAL CONFIRMED • MATCHED LOCAL RECORD':'ARRIVAL CONFIRMED • NAMES ROSTER'
    });
    write(TX_KEY,history.slice(-100));

    if(navigator.vibrate)navigator.vibrate(100);

    const el=document.querySelector('#selectedNameStatus');
    el.className='status';
    el.textContent=selectedName+' — ARRIVAL CONFIRMED';
    selectedName='';
    render();
    renderNameTransactions();
  }

  function renderNameTransactions(){
    const holder=document.querySelector('#namesTx');
    if(!holder)return;
    const rows=tx().slice().reverse().slice(0,20);
    holder.innerHTML=rows.length
      ? rows.map(r=>'<tr><td>'+new Date(r.time).toLocaleTimeString()+'</td><td></td><td>'+r.action+'</td></tr>').join('')
      : '<tr><td colspan="3">No names-roster transactions yet.</td></tr>';
    holder.querySelectorAll('tr').forEach((tr,i)=>{
      if(rows[i]){
        const cell=tr.children[1];
        if(cell)cell.textContent=rows[i].name;
      }
    });
  }

  function injectNameTransactions(){
    const recent=Array.from(document.querySelectorAll('.card')).find(c=>c.querySelector('#tx'));
    if(!recent||document.querySelector('#namesTx'))return;
    const block=document.createElement('div');
    block.style.marginTop='18px';
    block.innerHTML=`
      <h3>Recent Names-Roster Check-In</h3>
      <div class="tablewrap">
        <table>
          <thead><tr><th>Time</th><th>Name</th><th>Action</th></tr></thead>
          <tbody id="namesTx"></tbody>
        </table>
      </div>
    `;
    recent.appendChild(block);
    renderNameTransactions();
  }

  syncFromRegistration();
  inject();
  injectNameTransactions();

  window.addEventListener('storage',e=>{
    if(e.key===REGISTRATION_DB_KEY){
      syncFromRegistration();
      render();
      return;
    }
    if(e.key===ROSTER_KEY||e.key===STATUS_KEY){
      render();
      renderNameTransactions();
    }
  });
})();