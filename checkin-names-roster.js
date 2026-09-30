(()=>{
  const ROSTER_KEY='pdw2027NamesRoster:CHECKIN';
  const STATUS_KEY='pdw2027NamesRosterCheckin:CHECKIN';
  const TX_KEY='pdw2027NamesRosterCheckinTx:CHECKIN';
  let selectedName='';

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

  function inject(){
    if(document.querySelector('#receivedNamesCheckin'))return;
    const recent=Array.from(document.querySelectorAll('.card')).find(c=>c.querySelector('#tx'));
    if(!recent)return;

    const card=document.createElement('div');
    card.className='card';
    card.id='receivedNamesCheckin';
    card.innerHTML=`
      <h2>Received Names Check-In</h2>
      <div class="status" id="namesRosterSummary">0 names received for CHECK-IN.</div>
      <a class="btn blue" href="./staff-names-share.html?v=41">OPEN NAMES QUICK SHARE / RECEIVE NAMES</a>

      <label for="namesSearch">Search Received Name</label>
      <input id="namesSearch" type="search" autocomplete="off" placeholder="Type first name or last name">

      <div id="namesList" class="names-roster-list" style="margin-top:12px"></div>

      <div id="selectedNameStatus" class="status warn" style="margin-top:12px">
        No received name selected.
      </div>

      <button class="primary" id="confirmNameArrival" disabled>CONFIRM ARRIVAL BY NAME</button>

      <div class="status warn" style="margin-top:12px">
        <b>Names-only roster:</b> this does not contain IDs or attendee type. QR/Participant ID remains the verified check-in method.
      </div>
    `;
    recent.parentNode.insertBefore(card,recent);

    const style=document.createElement('style');
    style.textContent=`
      .names-roster-list{max-height:360px;overflow:auto;border:1px solid #e1d9ca;border-radius:15px;background:#fffdf8}
      .names-roster-item{width:100%;margin:0;border:0;border-bottom:1px solid #ece5d8;border-radius:0;background:transparent;color:#0f5132;text-align:left;min-height:54px;padding:12px 14px;font-weight:900}
      .names-roster-item:last-child{border-bottom:0}
      .names-roster-item.selected{background:#eaf5ef}
      .names-roster-item.arrived{opacity:.7}
      .names-roster-item small{display:block;font-weight:700;color:#59655d;margin-top:3px}
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

    const summary=document.querySelector('#namesRosterSummary');
    if(summary){
      const arrived=names.filter(n=>states[n]?.arrived).length;
      summary.textContent=names.length+' names received • '+arrived+' arrived • '+(names.length-arrived)+' waiting';
    }

    const list=document.querySelector('#namesList');
    if(!list)return;

    if(!names.length){
      list.innerHTML='<div class="small" style="padding:14px">No names received yet. Use Staff Menu → Names Quick Share → Receive Names File while logged in as CHECK-IN.</div>';
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
      btn.textContent=name;
      const small=document.createElement('small');
      small.textContent=st.arrived?'ARRIVED'+(st.time?' • '+new Date(st.time).toLocaleTimeString():''):'WAITING';
      btn.appendChild(small);
      btn.onclick=()=>{
        selectedName=name;
        updateSelected();
        render();
      };
    });
    updateSelected();
  }

  function updateSelected(){
    const el=document.querySelector('#selectedNameStatus');
    const btn=document.querySelector('#confirmNameArrival');
    if(!el||!btn)return;

    if(!selectedName){
      el.className='status warn';
      el.textContent='No received name selected.';
      btn.disabled=true;
      return;
    }

    const st=statusMap()[selectedName];
    if(st?.arrived){
      el.className='status warn';
      el.textContent=selectedName+' — ALREADY ARRIVED';
      btn.disabled=true;
    }else{
      el.className='status';
      el.textContent='Selected: '+selectedName;
      btn.disabled=false;
    }
  }

  function confirmArrival(){
    if(!selectedName)return;

    const states=statusMap();
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

  inject();
  injectNameTransactions();

  window.addEventListener('storage',e=>{
    if(e.key===ROSTER_KEY||e.key===STATUS_KEY){
      render();
      renderNameTransactions();
    }
  });
})();