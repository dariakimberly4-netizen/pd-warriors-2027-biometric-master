const KEY='pdw2027BioDemoV1';
const PDW={
  db(){return JSON.parse(localStorage.getItem(KEY)||'{"people":[],"tx":[],"pending":0,"syncedAt":null}')},
  save(d){localStorage.setItem(KEY,JSON.stringify(d))},
  activeId(){return sessionStorage.getItem('pdwParticipantId')||''},
  setActive(id){sessionStorage.setItem('pdwParticipantId',id)},
  person(id){const d=this.db();return d.people.find(p=>p.id===id)||null},
  active(){return this.person(this.activeId())},
  staff(){
    return {
      active:sessionStorage.getItem('pdwStaffSession')==='1',
      role:sessionStorage.getItem('pdwStaffRole')||'',
      name:sessionStorage.getItem('pdwStaffName')||'Staff'
    };
  },
  staffAllowed(...roles){
    const s=this.staff();
    return s.active && (s.role==='ADMIN' || roles.includes(s.role));
  },
  nextId(type,d){
    const prefix=type==='PATIENT'?'PDW-':'COM-';
    const nums=d.people
      .map(p=>String(p.id||''))
      .filter(id=>id.startsWith(prefix))
      .map(id=>parseInt(id.slice(prefix.length),10))
      .filter(Number.isFinite);
    const next=(nums.length?Math.max(...nums):0)+1;
    return prefix+String(next).padStart(4,'0');
  },
  masterId(sourceKey,name){
    const s=String(sourceKey||'')+'|'+String(name||'');
    let h=2166136261;
    for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}
    return 'PDW-'+String(Math.abs(h>>>0)%1000000).padStart(6,'0');
  },
  selectMasterRecord(record){
    const d=this.db();
    const id=this.masterId(record.sourceKey,record.name);
    let p=d.people.find(x=>x.id===id);
    if(!p){
      p={
        id,
        type:'PATIENT',
        name:record.name||'',
        nickname:record.nickname||'',
        mobile:record.mobile||'',
        location:record.location||'',
        fromMaster:true,
        sourceKey:record.sourceKey||'',
        biometric:false,
        verifyMethod:null,
        arrived:false,
        snack:false,
        lunch:false,
        raffle:false,
        eventPassCode:'PDW2027|PASS|'+id+'|PATIENT',
        eventPassCreated:true,
        passCreatedAt:new Date().toISOString(),
        registeredAt:new Date().toISOString()
      };
      d.people.push(p);
    }else{
      p.name=record.name||p.name;
      p.nickname=record.nickname||p.nickname;
      p.mobile=record.mobile||p.mobile;
      p.location=record.location||p.location;
      p.fromMaster=true;
      p.sourceKey=record.sourceKey||p.sourceKey;
      p.eventPassCode=p.eventPassCode||('PDW2027|PASS|'+id+'|PATIENT');
      p.eventPassCreated=true;
      p.passCreatedAt=p.passCreatedAt||new Date().toISOString();
    }
    this.save(d);
    this.setActive(id);
    return id;
  },
  register(name,type,extra={}){
    const d=this.db();
    const id=this.nextId(type,d);
    d.people.push({
      id,name,type,
      nickname:extra.nickname||'',
      facebookName:extra.facebookName||'',
      mobile:extra.mobile||'',
      civilStatus:extra.civilStatus||'',
      age:extra.age||'',
      location:extra.location||'',
      ageDiagnosed:extra.ageDiagnosed||'',
      yearsLivingPD:extra.yearsLivingPD||'',
      pdManagement:extra.pdManagement||[],
      participation:extra.participation||[],
      email:extra.email||'',
      linkedPatientId:extra.linkedPatientId||'',
      companionOf:extra.companionOf||'',
      consent:extra.consent===true,
      registeredAt:new Date().toISOString(),
      biometric:false,verifyMethod:null,arrived:false,snack:false,lunch:false,raffle:false
    });
    this.save(d);
    this.setActive(id);
    return id;
  },
  registerPatientGroup(patient,companions=[]){
    const d=this.db();
    const patientId=this.nextId('PATIENT',d);
    const base={
      biometric:false,verifyMethod:null,arrived:false,
      snack:false,lunch:false,raffle:false,
      registeredAt:new Date().toISOString()
    };
    d.people.push({
      ...base,
      id:patientId,
      type:'PATIENT',
      name:patient.name,
      nickname:patient.nickname||'',
      facebookName:patient.facebookName||'',
      mobile:patient.mobile||'',
      civilStatus:patient.civilStatus||'',
      age:patient.age||'',
      location:patient.location||'',
      ageDiagnosed:patient.ageDiagnosed||'',
      yearsLivingPD:patient.yearsLivingPD||'',
      pdManagement:patient.pdManagement||[],
      participation:patient.participation||[],
      email:patient.email||'',
      companionCount:companions.length,
      consent:patient.consent===true
    });
    const companionIds=[];
    for(const c of companions){
      const cid=this.nextId('COMPANION',d);
      d.people.push({
        ...base,
        id:cid,
        type:'COMPANION',
        name:c.name,
        nickname:c.nickname||'',
        age:c.age||'',
        linkedPatientId:patientId,
        companionOf:patient.name,
        mobile:'',
        facebookName:'',
        civilStatus:'',
        location:patient.location||'',
        ageDiagnosed:'',
        yearsLivingPD:'',
        pdManagement:[],
        participation:['Companion'],
        email:'',
        consent:patient.consent===true,
        raffle:false
      });
      companionIds.push(cid);
    }
    this.save(d);
    this.setActive(patientId);
    return {patientId,companionIds};
  },
  eventPassPayload(p){
    if(!p)return '';
    return [
      'PDW2027','PASS',
      p.id||'',
      p.type==='COMPANION'?'COMPANION':'PATIENT',
      encodeURIComponent(p.name||''),
      encodeURIComponent(p.nickname||''),
      encodeURIComponent(p.location||''),
      encodeURIComponent(p.sourceKey||'')
    ].join('|');
  },
  parseEventPassPayload(payload){
    const parts=String(payload||'').split('|');
    if(parts.length<4||parts[0]!=='PDW2027'||parts[1]!=='PASS')return null;
    const dec=v=>{try{return decodeURIComponent(v||'')}catch(e){return v||''}};
    return {
      id:parts[2]||'',
      type:parts[3]==='COMPANION'?'COMPANION':'PATIENT',
      name:dec(parts[4]),
      nickname:dec(parts[5]),
      location:dec(parts[6]),
      sourceKey:dec(parts[7])
    };
  },
  importFromEventPass(payload){
    const rec=this.parseEventPassPayload(payload);
    if(!rec||!rec.id)return null;
    const d=this.db();
    let p=d.people.find(x=>x.id===rec.id);
    if(!p){
      p={
        id:rec.id,
        type:rec.type,
        name:rec.name||rec.id,
        nickname:rec.nickname||'',
        location:rec.location||'',
        sourceKey:rec.sourceKey||'',
        fromEventPass:true,
        biometric:false,
        verifyMethod:null,
        arrived:false,
        snack:false,
        lunch:false,
        raffle:false,
        registeredAt:new Date().toISOString()
      };
      d.people.push(p);
    }else{
      if(rec.name)p.name=rec.name;
      if(rec.nickname)p.nickname=rec.nickname;
      if(rec.location)p.location=rec.location;
      if(rec.sourceKey)p.sourceKey=rec.sourceKey;
    }
    this.save(d);
    return p;
  },
  updatePerson(id,fn){const d=this.db();const p=d.people.find(x=>x.id===id);if(!p)return null;fn(p,d);this.save(d);return p},
  addTx(id,action,station){
    const d=this.db(),s=this.staff(),now=new Date();
    d.tx.push({
      id,action,station,
      time:now.toLocaleTimeString(),
      timestamp:now.toISOString(),
      staffName:s.name,
      staffRole:s.role
    });
    d.pending=(d.pending||0)+1;
    this.save(d)
  },
  process(id,kind,station){
    let result={ok:false,msg:'Participant not found'};
    this.updatePerson(id,(p,d)=>{
      if(kind==='ARRIVAL'){if(p.arrived){result={ok:false,msg:'ALREADY ARRIVED'};return}p.arrived=true;result={ok:true,msg:'ARRIVAL CONFIRMED'}}
      if(kind==='SNACK'){if(p.snack){result={ok:false,msg:'SNACK ALREADY CLAIMED'};return}p.snack=true;result={ok:true,msg:'SNACK CLAIMED'}}
      if(kind==='LUNCH'){if(p.lunch){result={ok:false,msg:'LUNCH ALREADY CLAIMED'};return}p.lunch=true;result={ok:true,msg:'LUNCH CLAIMED'}}
      if(kind==='RAFFLE'){if(p.type==='COMPANION'){result={ok:false,msg:'COMPANION — NOT ELIGIBLE FOR RAFFLE'};return}if(p.raffle){result={ok:false,msg:'RAFFLE ALREADY CLAIMED'};return}p.raffle=true;result={ok:true,msg:'RAFFLE CLAIMED'}}
      if(result.ok){
        const s=this.staff(),now=new Date();
        d.tx.push({
          id:p.id,action:result.msg,station,
          time:now.toLocaleTimeString(),
          timestamp:now.toISOString(),
          staffName:s.name,
          staffRole:s.role
        });
        p.lastActionAt=now.toISOString();
        if(kind==='ARRIVAL')p.arrivalAt=now.toISOString();
        if(kind==='SNACK')p.snackAt=now.toISOString();
        if(kind==='LUNCH')p.lunchAt=now.toISOString();
        if(kind==='RAFFLE')p.raffleAt=now.toISOString();
        d.pending=(d.pending||0)+1
      }
    });
    return result
  },
  qr(el,id){
    el.innerHTML='';
    let seed=[...id].reduce((a,c)=>a+c.charCodeAt(0),0);
    for(let i=0;i<81;i++){const x=document.createElement('i');seed=(seed*9301+49297)%233280;if(seed/233280>.48)x.className='off';el.appendChild(x)}
  }
};
if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});