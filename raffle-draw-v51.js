(()=>{
  const WINNERS_KEY='pdw2027RaffleDrawWinnersV51';
  const DRAW_STATION='RAFFLE-DRAW-01';

  function readWinners(){
    try{
      const value=JSON.parse(localStorage.getItem(WINNERS_KEY)||'[]');
      return Array.isArray(value)?value:[];
    }catch(e){return []}
  }

  function saveWinners(value){
    localStorage.setItem(WINNERS_KEY,JSON.stringify(value));
  }

  function patients(){
    return (PDW.db().people||[]).filter(p=>p.type==='PATIENT');
  }

  function secureIndex(max){
    if(max<=1)return 0;
    if(window.crypto&&window.crypto.getRandomValues){
      const range=0x100000000;
      const limit=range-(range%max);
      const a=new Uint32Array(1);
      do{window.crypto.getRandomValues(a)}while(a[0]>=limit);
      return a[0]%max;
    }
    return Math.floor(Math.random()*max);
  }

  function winnerIds(){
    return new Set(readWinners().map(w=>w.id));
  }

  function remaining(){
    const used=winnerIds();
    return patients().filter(p=>!used.has(p.id));
  }

  function render(){
    const eligible=patients();
    const winners=readWinners();
    const left=remaining();

    document.querySelector('#eligibleCount').textContent=eligible.length;
    document.querySelector('#remainingCount').textContent=left.length;
    document.querySelector('#winnerCount').textContent=winners.length;

    const btn=document.querySelector('#drawBtn');
    btn.disabled=!left.length;
    btn.textContent=left.length
      ? (winners.length?'DRAW ANOTHER WINNER':'DRAW WINNER')
      : 'NO MORE ELIGIBLE PATIENTS';

    const history=document.querySelector('#winnerHistory');
    history.innerHTML=winners.length
      ? winners.slice().reverse().map((w,i)=>{
          const number=winners.length-i;
          return '<div class="winner-row">'+
            '<span class="winner-no">#'+number+'</span>'+
            '<div style="flex:1"><b></b><div class="small"></div></div>'+
          '</div>';
        }).join('')
      : '<div class="small">No winners drawn yet.</div>';

    if(winners.length){
      const rows=history.querySelectorAll('.winner-row');
      winners.slice().reverse().forEach((w,i)=>{
        const b=rows[i].querySelector('b');
        const small=rows[i].querySelector('.small');
        b.textContent=w.name||w.id;
        small.textContent=new Date(w.drawnAt).toLocaleString();
      });
    }
  }

  function drawWinner(){
    const pool=remaining();
    const msg=document.querySelector('#drawMessage');

    if(!pool.length){
      msg.className='status warn';
      msg.textContent='No eligible Patient / PD Warrior remains in the raffle pool.';
      render();
      return;
    }

    const winner=pool[secureIndex(pool.length)];
    const now=new Date();
    const winners=readWinners();

    const entry={
      id:winner.id,
      name:winner.name||winner.id,
      drawnAt:now.toISOString(),
      staffName:sessionStorage.getItem('pdwStaffName')||'Raffle Staff'
    };
    winners.push(entry);
    saveWinners(winners);

    PDW.updatePerson(winner.id,p=>{
      p.raffleWinner=true;
      p.raffleWinnerAt=now.toISOString();
    });
    PDW.addTx(winner.id,'RAFFLE WINNER DRAWN',DRAW_STATION);

    document.querySelector('#drawName').textContent=winner.name||winner.id;
    document.querySelector('#drawSub').textContent='WINNER #'+winners.length+' • PATIENT / PD WARRIOR';
    msg.className='status';
    msg.textContent='Winner recorded. This patient is removed from the remaining raffle pool.';

    if(navigator.vibrate)navigator.vibrate([100,60,100]);

    render();
  }

  document.querySelector('#drawBtn').onclick=drawWinner;
  render();

  window.addEventListener('storage',e=>{
    if(e.key==='pdw2027BioDemoV1'||e.key===WINNERS_KEY)render();
  });
})();