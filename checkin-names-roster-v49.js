(()=>{
  const ROSTER_KEY='pdw2027NamesRoster:CHECKIN';
  const STATUS_KEY='pdw2027NamesRosterCheckin:CHECKIN';
  const TX_KEY='pdw2027NamesRosterCheckinTx:CHECKIN';
  const REGISTRATION_DB_KEY='pdw2027BioDemoV1';

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

      <div class="small" style="margin-top:10px"><b>Tap a name to confirm arrival immediately.</b></div>
      <div id="namesList" class="names-roster-list" style="margin-top:8px"></div>

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
      summary.textContent=names.length+' total Registration names • '+arrived+' arrived • '+(names.length-arrived)+' waiting';
    }

    const list=document.querySelector('#namesList');
    if(!list)return;

    if(!names.length){
      list.innerHTML='<div class="small" style="padding:14px">No Registration names are available on this device yet. Open Registration first and load/import the attendee database.</div>';
      return;
    }

    list.innerHTML=filtered.length
      ? filtered.map(()=>'<button class="names-roster-item"></button>').join('')
      : '<div class="small" style="padding:14px">No matching received name.</div>';

    list.querySelectorAll('.names-roster-item').forEach((btn,i)=>{
      const name=filtered[i];
      const st=states[name]||{};
      btn.classList.toggle('arrived',!!st.arrived);

      const nameLabel=document.createElement('span');
      nameLabel.className='name-label';
      nameLabel.textContent=name;

      const badge=document.createElement('span');
      badge.className='status-badge';
      badge.textContent=st.arrived?'ARRIVED':'WAITING';

      btn.replaceChildren(nameLabel,badge);

      btn.onclick=()=>{
        if(st.arrived){
          showInlineMessage(name+' — ALREADY ARRIVED',true);
          return;
        }
        confirmArrivalForName(name);
      };
    });
  }

  function ensureInlineMessage(){
    let el=document.querySelector('#directArrivalMessage');
    if(el)return el;
    const list=document.querySelector('#namesList');
    if(!list)return null;
    el=document.createElement('div');
    el.id='directArrivalMessage';
    el.className='status hidden';
    el.style.marginTop='12px';
    list.insertAdjacentElement('afterend',el);
    return el;
  }

  function showInlineMessage(message,warn=false){
    const el=ensureInlineMessage();
    if(!el)return;
    el.className=warn?'status warn':'status';
    el.textContent=message;
  }

  function confirmArrivalForName(name){
    const states=statusMap();

    if(states[name]?.arrived){
      showInlineMessage(name+' — ALREADY ARRIVED',true);
      return;
    }

    const now=new Date();
    let linkedRecordId='';
    let verified=false;

    const matches=PDW.db().people.filter(p=>norm(p.name)===norm(name));
    if(matches.length===1){
      const out=PDW.process(matches[0].id,'ARRIVAL','CHECK-IN-01');
      if(out.ok || out.msg==='ALREADY ARRIVED'){
        linkedRecordId=matches[0].id;
        verified=true;
      }else if(!out.ok && out.msg){
        showInlineMessage(name+' — '+out.msg,true);
        return;
      }
    }

    states[name]={
      arrived:true,
      time:now.toISOString(),
      staff:sessionStorage.getItem('pdwStaffName')||'Check-In Staff',
      linkedRecordId,
      verified
    };
    write(STATUS_KEY,states);

    const history=tx();
    history.push({
      name,
      time:now.toISOString(),
      action:verified?'ARRIVAL CONFIRMED • MATCHED LOCAL RECORD':'ARRIVAL CONFIRMED • NAMES ROSTER'
    });
    write(TX_KEY,history.slice(-100));

    if(navigator.vibrate)navigator.vibrate(100);

    showInlineMessage(name+' — ARRIVAL CONFIRMED');
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