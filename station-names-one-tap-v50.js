(()=>{
  const body=document.body;
  const KIND=String(body.dataset.kind||'').toUpperCase();
  const STATION=String(body.dataset.station||'STAFF-01');

  if(!['SNACK','LUNCH','RAFFLE'].includes(KIND))return;

  const LABELS={
    SNACK:{title:'Registration Names — Snack',action:'Tap a name to release Snack immediately.',waiting:'WAITING',done:'CLAIMED',doneMsg:'SNACK CLAIMED'},
    LUNCH:{title:'Registration Names — Lunch',action:'Tap a name to release Lunch immediately.',waiting:'WAITING',done:'CLAIMED',doneMsg:'LUNCH CLAIMED'},
    RAFFLE:{title:'Registration Names — Raffle',action:'Tap an eligible Patient name to claim Raffle immediately.',waiting:'ELIGIBLE',done:'CLAIMED',doneMsg:'RAFFLE CLAIMED'}
  };
  const cfg=LABELS[KIND];

  const norm=v=>String(v||'').toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim();

  function people(){
    return (PDW.db().people||[]).slice();
  }

  function isDone(p){
    if(KIND==='SNACK')return !!p.snack;
    if(KIND==='LUNCH')return !!p.lunch;
    if(KIND==='RAFFLE')return !!p.raffle;
    return false;
  }

  function isEligible(p){
    if(KIND==='RAFFLE'&&p.type==='COMPANION')return false;
    return true;
  }

  function inject(){
    if(document.querySelector('#stationNamesRoster'))return;

    const recent=Array.from(document.querySelectorAll('.card')).find(c=>c.querySelector('#tx'));
    if(!recent)return;

    const card=document.createElement('div');
    card.className='card';
    card.id='stationNamesRoster';
    card.innerHTML=`
      <h2>${cfg.title}</h2>
      <div class="status" id="stationNamesSummary">Loading Registration names…</div>

      <label for="stationNamesSearch">Search Registration Name</label>
      <input id="stationNamesSearch" type="search" autocomplete="off" placeholder="Type first name or last name">

      <div class="small" style="margin-top:10px"><b>${cfg.action}</b></div>
      <div id="stationNamesList" class="station-names-list" style="margin-top:8px"></div>
      <div id="stationNamesMessage" class="status hidden" style="margin-top:12px"></div>

      <div class="status warn" style="margin-top:12px">
        <b>ALL NAMES AUTO-IMPORTED:</b> every name in Registration appears here automatically.
        ${KIND==='RAFFLE'?' Companions remain NOT ELIGIBLE for raffle.':''}
      </div>
    `;

    recent.parentNode.insertBefore(card,recent);

    const style=document.createElement('style');
    style.textContent=`
      .station-names-list{
        max-height:360px;
        overflow:auto;
        border:1px solid #e1d9ca;
        border-radius:15px;
        background:#fffdf8
      }
      .station-name-row{
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
        touch-action:manipulation
      }
      .station-name-row:last-child{border-bottom:0}
      .station-name-row.done{background:#f4f4ef}
      .station-name-row.ineligible{background:#f7f1f1;cursor:not-allowed}
      .station-name-row .name-wrap{flex:1;min-width:0}
      .station-name-row .name-label{
        display:block;
        font-size:17px;
        line-height:1.25;
        color:#0f5132
      }
      .station-name-row .type-label{
        display:block;
        margin-top:3px;
        font-size:12px;
        font-weight:800;
        color:#6a746d
      }
      .station-name-row .status-badge{
        flex:0 0 auto;
        border-radius:999px;
        padding:7px 10px;
        font-size:12px;
        line-height:1;
        font-weight:1000;
        letter-spacing:.03em;
        background:#f3ead7;
        color:#6c531e;
        border:1px solid #dfcfaa
      }
      .station-name-row.done .status-badge{
        background:#e7f3ec;
        color:#0f5132;
        border-color:#c6decf
      }
      .station-name-row.ineligible .status-badge{
        background:#f6e7e7;
        color:#8a2d2d;
        border-color:#e5c4c4
      }
    `;
    document.head.appendChild(style);

    document.querySelector('#stationNamesSearch').addEventListener('input',render);
    render();
  }

  function showMessage(message,bad=false){
    const el=document.querySelector('#stationNamesMessage');
    if(!el)return;
    el.className=bad?'status bad':'status';
    el.textContent=message;
  }

  function render(){
    const all=people();
    const q=norm(document.querySelector('#stationNamesSearch')?.value||'');
    const filtered=all.filter(p=>!q||norm(p.name).includes(q)||norm(p.nickname).includes(q));

    const eligible=all.filter(isEligible);
    const completed=eligible.filter(isDone).length;

    const summary=document.querySelector('#stationNamesSummary');
    if(summary){
      if(KIND==='RAFFLE'){
        const companions=all.filter(p=>p.type==='COMPANION').length;
        summary.textContent=
          all.length+' total Registration names • '+
          completed+' raffle claimed • '+
          (eligible.length-completed)+' eligible waiting • '+
          companions+' companions not eligible';
      }else{
        summary.textContent=
          all.length+' total Registration names • '+
          completed+' claimed • '+
          (all.length-completed)+' waiting';
      }
    }

    const list=document.querySelector('#stationNamesList');
    if(!list)return;

    if(!all.length){
      list.innerHTML='<div class="small" style="padding:14px">No Registration names are available on this device yet. Open Registration first and load/import the attendee database.</div>';
      return;
    }

    list.innerHTML=filtered.length
      ? filtered.map(()=>'<button class="station-name-row"></button>').join('')
      : '<div class="small" style="padding:14px">No matching Registration name.</div>';

    list.querySelectorAll('.station-name-row').forEach((btn,i)=>{
      const p=filtered[i];
      const eligibleNow=isEligible(p);
      const done=isDone(p);

      btn.classList.toggle('done',done);
      btn.classList.toggle('ineligible',!eligibleNow);

      const wrap=document.createElement('span');
      wrap.className='name-wrap';

      const nameLabel=document.createElement('span');
      nameLabel.className='name-label';
      nameLabel.textContent=p.name||p.id;

      const typeLabel=document.createElement('span');
      typeLabel.className='type-label';
      typeLabel.textContent=p.type==='COMPANION'?'COMPANION':'PATIENT / PD WARRIOR';

      wrap.append(nameLabel,typeLabel);

      const badge=document.createElement('span');
      badge.className='status-badge';
      badge.textContent=!eligibleNow?'NOT ELIGIBLE':done?cfg.done:cfg.waiting;

      btn.replaceChildren(wrap,badge);

      btn.onclick=()=>{
        if(!eligibleNow){
          showMessage((p.name||'Companion')+' — COMPANION — NOT ELIGIBLE FOR RAFFLE',true);
          return;
        }
        if(done){
          showMessage((p.name||p.id)+' — '+cfg.doneMsg+' ALREADY',true);
          return;
        }

        const out=PDW.process(p.id,KIND,STATION);
        showMessage((p.name||p.id)+' — '+out.msg,!out.ok);

        if(out.ok&&navigator.vibrate)navigator.vibrate(100);

        render();
        refreshStationTransactions();
      };
    });
  }

  function refreshStationTransactions(){
    const txEl=document.querySelector('#tx');
    if(!txEl)return;

    const rows=PDW.db().tx
      .filter(t=>t.station===STATION)
      .slice()
      .reverse()
      .slice(0,20);

    txEl.innerHTML=rows.length
      ? rows.map(t=>'<tr><td>'+t.time+'</td><td>'+t.id+'</td><td>'+t.action+'</td></tr>').join('')
      : '<tr><td colspan="3">No transactions yet.</td></tr>';
  }

  inject();

  window.addEventListener('storage',e=>{
    if(e.key==='pdw2027BioDemoV1'){
      render();
      refreshStationTransactions();
    }
  });
})();