"use strict";
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),assert=require('node:assert/strict'),{spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'aya-flight-gate-')),port=3987,base=`http://127.0.0.1:${port}`,password=crypto.randomBytes(20).toString('hex'),salt=crypto.randomBytes(16).toString('hex');
const dbfile=temp+'/db.json',rows=[];let child,cookie='';
fs.writeFileSync(dbfile,JSON.stringify({offers:[],users:[{id:'QA',name:'QA',role:'admin',agencyId:'AGY-AYA',email:'qa@example.test',passwordHash:salt+':'+crypto.scryptSync(password,salt,64).toString('hex')},{id:'OTHER',name:'Other',role:'admin',agencyId:'B',email:'other@example.test',passwordHash:salt+':'+crypto.scryptSync(password,salt,64).toString('hex')}]}));
const snapshot=()=>fs.readFileSync(dbfile,'utf8');
async function http(route,method='GET',body,auth=cookie){const r=await fetch(base+route,{method,redirect:'manual',headers:{...(auth?{Cookie:auth}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});const bytes=Buffer.from(await r.arrayBuffer());let data;try{data=JSON.parse(bytes)}catch{}return {status:r.status,data,text:bytes.toString(),pdf:bytes.subarray(0,4).toString()==='%PDF',cookie:(r.headers.get('set-cookie')||'').split(';')[0]};}
function log(name,actual){rows.push({name,result:'PASS',actual});console.log(JSON.stringify(rows.at(-1)));}
function fixture(kind){const year=kind==='old'?2020:2099;const date=day=>kind==='missing'?`${day}.11 10:30`:kind==='ambiguous'?`${day}.11.99 10:30`:kind==='past'?`2025-11-${day}T10:30`:`${year}-11-${day}T10:30`;
return {clientName:'QA ONLY',destination:'Rome',travelDates:kind==='old'?'16.11 - 20.11.2026':kind==='past'?'16.11 - 20.11.2025':'16.11 - 20.11.2099',status:'draft',guests:'2 adults',markupPercent:5,flights:[{route:'SOF -> CIA / CIA -> SOF',price:200,outboundSegments:[{from:'SOF',to:'CIA',departure:date('16'),arrival:date('16'),flightNumber:'FR625'}],inboundSegments:[{from:'CIA',to:'SOF',departure:date('20'),arrival:date('20'),flightNumber:'FR626'}]}],hotels:[{id:'a',name:'QA Alpha',price:100,selected:true,images:[],occupancy:{adults:2,children:0,rooms:1,confirmed:true}},{id:'b',name:'QA Beta',price:140,selected:false,images:[],occupancy:{adults:2,children:0,rooms:1,confirmed:true}}]};}
(async()=>{try{
 const logfd=fs.openSync(temp+'/server.log','w');
 child=spawn(process.execPath,[root+'/server.js'],{cwd:temp,env:{PATH:process.env.PATH,HOME:process.env.HOME,PORT:String(port),DATA_DIR:temp,DB_FILE:dbfile,REGRESSION_LIBRARY_DIR:temp+'/library',LIVE_BASE_URL:base,AUTH_SECRET:crypto.randomBytes(32).toString('hex'),ADMIN_EMAIL:'qa@example.test',ADMIN_PASSWORD:password,BETA_AUTH_BYPASS:'false',NODE_ENV:'test'},stdio:['ignore',logfd,logfd]});fs.closeSync(logfd);
 for(let i=0;i<100;i++){try{const r=await http('/api/health');if(r.status===200)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 const login=await http('/api/auth/login','POST',{email:'qa@example.test',password},'');assert.equal(login.status,200);cookie=login.cookie;
 const other=(await http('/api/auth/login','POST',{email:'other@example.test',password},'')).cookie;
 const vm=require('node:vm'),admin=fs.readFileSync(root+'/public/admin.js','utf8'),ctx=vm.createContext({qaTone:()=> 'ready',qaScore:()=>100,getOfferWarnings:()=>[]});
 vm.runInContext(admin.slice(admin.indexOf('function flightDateClientReady('),admin.indexOf('function syncHomeFieldsToCreateSurface(')),ctx);
 for(const kind of ['old','past','missing','ambiguous','valid','proposal','arrival','connection','secondFlight','dateAlias','multiDate','isoPeriod','isoPast','aliasConflict']){
  const payload=fixture(kind==='isoPast'?'past':kind);
  payload.hotels[0].images=[base+'/images/hotels/ao-london-docklands.jpg'];
  payload.hotels[1].images=[base+'/images/hotels/eden-au-lac-zurich.jpg'];
  if(kind==='arrival')payload.flights[0].inboundSegments[0].arrival='2020-11-20T10:30';
  if(kind==='connection')payload.flights[0].outboundSegments.push({from:'CIA',to:'SOF',departure:'2020-11-16T10:30',arrival:'2020-11-16T11:30'});
  if(kind==='secondFlight')payload.flights.push({...fixture('past').flights[0],airline:'Different synthetic airline',price:201});
  if(kind==='isoPeriod')payload.travelDates='2099-11-16 - 2099-11-20';
  if(kind==='isoPast')payload.travelDates='2025-11-16 - 2025-11-20';
  if(kind==='multiDate')payload.flights[0].outboundSegments[0].departure='2099-11-16T10:30 / 2020-11-16T10:30';
  if(kind==='dateAlias'||kind==='aliasConflict'){
    payload.proposalInput=structuredClone(require('../gt63-core/legacy-offer-print-input').buildLegacyOfferPrintInput({...payload,id:'synthetic'}));
    const segment=payload.proposalInput.flight.outboundSegments[0];
    if(kind==='dateAlias'){segment.departureDate=segment.departure;delete segment.departure;segment.date='2020-11-16T10:30';}
    else segment.arrivalDate='2099-11-17T10:30';
  }
  if(kind==='proposal'){payload.proposalInput=require('../gt63-core/legacy-offer-print-input').buildLegacyOfferPrintInput({...payload,id:'synthetic'});payload.proposalInput.flight.outboundSegments[0].departure='2020-11-16T10:30';}
  const created=await http('/api/offers','POST',payload);assert.equal(created.status,200);const id=created.data.offer.id,url='/api/offers/'+id;
  let detail=await http(url);assert.equal(detail.status,200);if(kind==='secondFlight')assert.equal(detail.data.offer.flights.length,2);const valid=kind==='valid'||kind==='isoPeriod';assert.equal(detail.data.offer.flightDateSafety.ready,valid);assert.equal(ctx.offerReadyToSend(detail.data.offer),valid);
  assert.equal(ctx.offerReadyToSend({...detail.data.offer,flightDateSafety:undefined}),false);
  log(kind+' draft and READY',{get:200,ready:valid});
  const list=(await http('/api/offers')).data.offers.find(o=>o.id===id);assert.equal(list.flightDateSafety.ready,valid);
  if(!valid){
   for(const [route,method,body] of [[`/offer/${id}`,'GET'],[url.replace('/api/offers/','/api/offers/view/'),'GET'],[url+'/print','GET'],[url+'/pdf','GET'],[url+'/print?qa=1&bypass=true','GET'],[url+'/pdf?selectedHotelId=b','GET'],[url+'/click','POST',{}],[url+'/book','POST',{}],[url+'/status','PATCH',{status:'sent'}],[url+'/status','PATCH',{status:'ready'}],[url+'/status','PATCH',{status:'booked'}],[url,'PUT',{...detail.data.offer,status:'sent',expectedVersion:detail.data.offerVersion}]]){
    const before=snapshot(),r=await http(route,method,body);assert.equal(r.status,422,kind+' '+method+' '+route);assert.equal(r.data.error,'AYA_FLIGHT_DATE_BLOCKED');assert.equal(snapshot(),before);log(kind+' '+method+' '+route,{status:r.status,noMutation:true});
   }
   const before=snapshot(),pre=await http(url+'/qa-preview');assert.equal(pre.status,200);assert(pre.text.includes('INTERNAL QA'));assert.equal(snapshot(),before);assert.equal((await http(url+'/qa-preview','GET',undefined,'')).status,401);assert.equal((await http(url+'/qa-preview','GET',undefined,other)).status,403);
   detail=await http(url);assert.equal((await http(url,'PUT',{...detail.data.offer,notes:'Draft edit allowed',expectedVersion:detail.data.offerVersion})).status,200);
   log(kind+' protected QA preview and draft edit',{preview:200,anonymous:401,otherAgency:403,draftPut:200});
   const createBefore=snapshot(),blockedCreate=await http('/api/offers','POST',{...payload,status:'sent'});assert.equal(blockedCreate.status,422);assert.equal(snapshot(),createBefore);log(kind+' create sent',{status:422,noMutation:true});
  }else{
   const offerBefore=JSON.parse(snapshot()).offers.find(o=>o.id===id);
   for(const route of [`/offer/${id}`,`/api/offers/view/${id}`,url+'/print',url+'/print?selectedHotelId=b',url+'/pdf']){const r=await http(route);assert.equal(r.status,route.startsWith('/offer/')?302:200);if(route.endsWith('/pdf'))assert(r.pdf);if(route.includes('selectedHotelId=b'))assert(r.text.includes('QA Beta'));log('valid GET '+route,{status:r.status,pdf:r.pdf});}
   const after=JSON.parse(snapshot()).offers.find(o=>o.id===id);for(const key of ['hotels','flights','finalPrice','markupPercent'])assert.deepEqual(after[key],offerBefore[key]);
   assert.equal((await http(url+'/status','PATCH',{status:'sent'})).status,200);log('valid sent and protected hotel/price data',{status:200,preserved:true});
  }
 }
}catch(e){rows.push({result:'FAIL',error:e.stack});console.error(e);process.exitCode=1;}finally{if(child&&child.exitCode===null){child.kill();await new Promise(r=>child.once('exit',r));}if(process.env.AYA_GATE_REPORT)fs.writeFileSync(process.env.AYA_GATE_REPORT,JSON.stringify(rows,null,2));fs.rmSync(temp,{recursive:true,force:true});}})();
