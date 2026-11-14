"use strict";
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),assert=require('node:assert/strict'),{spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'aya-flight-gate-')),port=39000+Math.floor(Math.random()*1000),base=`http://127.0.0.1:${port}`,password=crypto.randomBytes(20).toString('hex'),salt=crypto.randomBytes(16).toString('hex');
const dbfile=temp+'/db.json',rows=[];let child,cookie='';
fs.writeFileSync(dbfile,JSON.stringify({offers:[],users:[{id:'QA',name:'QA',role:'admin',agencyId:'AGY-AYA',email:'qa@example.test',passwordHash:salt+':'+crypto.scryptSync(password,salt,64).toString('hex')},{id:'OTHER',name:'Other',role:'admin',agencyId:'B',email:'other@example.test',passwordHash:salt+':'+crypto.scryptSync(password,salt,64).toString('hex')}]}));
const snapshot=()=>fs.readFileSync(dbfile,'utf8');
async function http(route,method='GET',body,auth=cookie){const r=await fetch(base+route,{method,redirect:'manual',headers:{...(auth?{Cookie:auth}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});const bytes=Buffer.from(await r.arrayBuffer());let data;try{data=JSON.parse(bytes)}catch{}return {status:r.status,data,text:bytes.toString(),pdf:bytes.subarray(0,4).toString()==='%PDF',bytes,cookie:(r.headers.get('set-cookie')||'').split(';')[0]};}
function log(name,actual){rows.push({name,result:'PASS',actual});console.log(JSON.stringify(rows.at(-1)));}
function fixture(kind){const year=kind==='old'?2020:2099;const date=day=>kind==='missing'?`${day}.11 10:30`:kind==='ambiguous'?`${day}.11.99 10:30`:kind==='past'?`2025-11-${day}T10:30`:`${year}-11-${day}T10:30`;
return {clientName:'QA ONLY',destination:'Rome',travelDates:kind==='old'?'16.11 - 20.11.2026':kind==='past'?'16.11 - 20.11.2025':'16.11 - 20.11.2099',status:'draft',guests:'2 adults',markupPercent:5,flights:[{route:'SOF -> CIA / CIA -> SOF',price:200,outboundSegments:[{from:'SOF',to:'CIA',departure:date('16'),arrival:date('16'),flightNumber:'FR625'}],inboundSegments:[{from:'CIA',to:'SOF',departure:date('20'),arrival:date('20'),flightNumber:'FR626'}]}],hotels:[{id:'a',name:'QA Alpha',price:100,selected:true,images:[],occupancy:{adults:2,children:0,rooms:1,confirmed:true}},{id:'b',name:'QA Beta',price:140,selected:false,images:[],occupancy:{adults:2,children:0,rooms:1,confirmed:true}}]};}
(async()=>{try{
 const logfd=fs.openSync(temp+'/server.log','w');
 child=spawn(process.execPath,[root+'/server.js'],{cwd:temp,env:{PATH:process.env.PATH,HOME:process.env.HOME,PORT:String(port),DATA_DIR:temp,DB_FILE:dbfile,REGRESSION_LIBRARY_DIR:temp+'/library',LIVE_BASE_URL:base,AUTH_SECRET:crypto.randomBytes(32).toString('hex'),ADMIN_EMAIL:'qa@example.test',ADMIN_PASSWORD:password,BETA_AUTH_BYPASS:'false',NODE_ENV:'test'},stdio:['ignore',logfd,logfd]});fs.closeSync(logfd);
 for(let i=0;i<100;i++){try{const r=await http('/api/health');if(r.status===200)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 const login=await http('/api/auth/login','POST',{email:'qa@example.test',password},'');assert.equal(login.status,200);cookie=login.cookie;
 const other=(await http('/api/auth/login','POST',{email:'other@example.test',password},'')).cookie;
 const vm=require('node:vm'),admin=fs.readFileSync(root+'/public/admin.js','utf8'),ctx=vm.createContext({qaTone:(_,warnings)=>warnings.length?'warning':'ready',qaScore:()=>100,getOfferWarnings:o=>require('../public/hotel-occupancy').warning(o)?['occupancy']:[]});
 vm.runInContext(admin.slice(admin.indexOf('function flightDateClientReady('),admin.indexOf('function syncHomeFieldsToCreateSurface(')),ctx);
 const pdfSource=fs.readFileSync(root+'/scripts/print-presentation-route-regression.js','utf8'),pdfTools=vm.createContext({zlib:require('node:zlib')});
 vm.runInContext(pdfSource.slice(pdfSource.indexOf('function flateStreams('),pdfSource.indexOf('function assertValidPdf(')),pdfTools);
 for(const kind of ['old','past','missing','fr625','ambiguous','valid','proposal','arrival','connection','secondFlight','dateAlias','multiDate','isoPeriod','isoPast','aliasConflict','occupancy','mixed','dismissed']){
  if(process.env.AYA_GATE_CASES && !process.env.AYA_GATE_CASES.split(',').includes(kind)) continue;
  const payload=fixture(kind==='isoPast'?'past':(kind==='mixed'||kind==='dismissed')?'old':kind);
  if(kind==='occupancy'||kind==='mixed')payload.hotels[0].occupancy.confirmed=false;
  if(kind==='dismissed')payload.warningsDismissed=true;
  if(kind==='fr625'){payload.travelDates='16.11.2026 - 20.11.2026';Object.assign(payload.flights[0].outboundSegments[0],{departure:'Mon, 16 Nov 1:25 PM',arrival:'Mon, 16 Nov 2:15 PM'});Object.assign(payload.flights[0].inboundSegments[0],{departure:'Fri, 20 Nov 12:25 PM',arrival:'Fri, 20 Nov 3:10 PM'});}
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
  let detail=await http(url);assert.equal(detail.status,200);
  if(kind==='secondFlight')assert.equal(detail.data.offer.flights.length,2);
  const flightValid=['valid','isoPeriod','missing','fr625','occupancy'].includes(kind),valid=flightValid&&kind!=='occupancy';
  assert.equal(detail.data.offer.flightDateSafety.ready,flightValid);assert.equal(ctx.offerReadyToSend(detail.data.offer),valid);
  assert.equal(ctx.offerReadyToSend({...detail.data.offer,flightDateSafety:undefined}),false);
  assert.equal((await http('/api/offers')).data.offers.find(o=>o.id===id).flightDateSafety.ready,flightValid);
  log(kind+' draft and readiness',{get:200,flightReady:flightValid,ready:valid});
  // Protected admin operations must authenticate/scope before validation/version checks.
  for(const [auth,expected] of [['',401],[other,403]]){
   for(const [route,method,body] of [[url,'GET'],[url+'/qa-preview','GET'],[url,'PUT',{...detail.data.offer,status:'sent'}],...["ready","sent","booked"].map(status=>[url+'/status','PATCH',{status}])]){
    const before=snapshot(),r=await http(route,method,body,auth);assert.equal(r.status,expected);assert.equal(snapshot(),before);
   }
   log(kind+' authentication / agency boundary',{status:expected,dbUnchanged:true});
  }
  const protectedData=o=>Object.fromEntries(Object.entries(o).filter(([key])=>!['clientViews','clientViewed','pdfDownloads','updatedAt'].includes(key)));
  const beforeOffer=JSON.parse(snapshot()).offers.find(o=>o.id===id),otherOffers=JSON.parse(snapshot()).offers.filter(o=>o.id!==id);
  for(const route of [`/offer/${id}`,`/api/offers/view/${id}`,url+'/print',url+'/print?qa=1&bypass=true',url+'/print?selectedHotelId=b',url+'/pdf',url+'/pdf?selectedHotelId=b']){
   const before=snapshot(),r=await http(route,'GET',undefined,'');assert.equal(r.status,route.startsWith('/offer/')?302:200,kind+' '+route);
   if(route.includes('/print')){
    if(!flightValid)assert(r.text.includes('[FLIGHT_DATE_SAFETY]'),'current date warning must be visible');
    if(kind==='occupancy'||kind==='mixed'){
     // Alternate selected hotel B is confirmed; default hotel A is not.
     if(!route.includes('selectedHotelId=b'))assert(r.text.includes('непотвърдена заетост'));
    }
    if(route.includes('selectedHotelId=b'))assert(r.text.includes('QA Beta'));
   }
   if(route.includes('/view/')){
    if(!flightValid)assert(r.text.includes('[FLIGHT_DATE_SAFETY]'));
    if(kind==='occupancy'||kind==='mixed')assert(r.text.includes('непотвърдена заетост'));
   }
   if(route.includes('/pdf')){
    assert(r.pdf);const extracted=pdfTools.extractPdfText(r.bytes),text=extracted.compactText;
    assert(extracted.pageCount>0);assert(/\/Subtype\s*\/Image\b/.test(r.bytes.toString('latin1')),'controlled hotel image must be embedded');
    if(!flightValid)assert(text.includes('[FLIGHT_DATE_SAFETY]'),'PDF must include current warning');
    if((kind==='occupancy'||kind==='mixed')&&!route.includes('selectedHotelId=b'))assert(text.includes('непотвърденазаетост'));
    if(kind==='old'||kind==='mixed'||kind==='dismissed')assert(text.includes('2020'),'never repair the reported year');
    if(route.includes('selectedHotelId=b'))assert(text.includes('QABeta')&&!text.includes('QAAlpha'));
   }
   if(route.startsWith('/offer/')||route.includes('/print'))assert.equal(snapshot(),before,'redirect/print must not write metrics');
   const qaWarningAsserted=!route.startsWith('/offer/')&&(!flightValid||(kind==='occupancy'&&!route.includes('selectedHotelId=b')));
   log(kind+' presentation '+route,{status:r.status,pdf:r.pdf,qaWarningAsserted});
  }
  const after=JSON.parse(snapshot()).offers.find(o=>o.id===id);
  assert.deepEqual(protectedData(after),protectedData(beforeOffer));
  assert.equal(Number(after.clientViews||0),Number(beforeOffer.clientViews||0)+1);
  assert.equal(Number(after.pdfDownloads||0),Number(beforeOffer.pdfDownloads||0)+2);
  assert.equal(after.clientViewed,true);
  assert.deepEqual(JSON.parse(snapshot()).offers.filter(o=>o.id!==id),otherOffers);
  log(kind+' metrics / editorial isolation',{clientViewsDelta:1,pdfDownloadsDelta:2,otherOffersUnchanged:true,allEditorialFieldsUnchanged:true});
  if(kind==='old'||kind==='occupancy'||kind==='valid'){for(const suffix of ['/print?selectedHotelId=missing-hotel','/pdf?selectedHotelId=missing-hotel']){const before=snapshot(),bad=await http(url+suffix);assert.equal(bad.status,400);assert.equal(snapshot(),before);}log(kind+' rejected selection metrics',{status:400,noMutation:true});}
  detail=await http(url);
  if(!valid){
   const error=flightValid?'AYA_HOTEL_OCCUPANCY_BLOCKED':'AYA_FLIGHT_DATE_BLOCKED';
   const denied=[...['ready','sent','booked'].map(status=>[url+'/status','PATCH',{status}]),...['ready','sent','booked'].map(status=>[url,'PUT',{...detail.data.offer,status,expectedVersion:detail.data.offerVersion}]),[url+'/book','POST',{}]];
   if(!flightValid)denied.push([url+'/click','POST',{}]);
   for(const [route,method,body] of denied){const before=snapshot(),r=await http(route,method,body);assert.equal(r.status,422);assert.equal(r.data.error,error);assert.equal(snapshot(),before);log(kind+' denied '+method+' '+route,{status:422,error,noMutation:true});}
   for(const status of ['ready','sent','booked']){const before=snapshot(),r=await http('/api/offers','POST',{...payload,status});assert.equal(r.status,422);assert.equal(r.data.error,error);assert.equal(snapshot(),before);}
   const before=snapshot(),pre=await http(url+'/qa-preview');assert.equal(pre.status,200);assert(pre.text.includes('INTERNAL QA'));assert.equal(snapshot(),before);
   detail=await http(url);const edit=await http(url,'PUT',{...detail.data.offer,notes:'Draft edit allowed',expectedVersion:detail.data.offerVersion});assert.equal(edit.status,200);
   log(kind+' protected create / internal QA / draft edit',{createBlocked:422,preview:200,draftPut:200});
  }else{
   const edit=await http(url,'PUT',{...detail.data.offer,notes:'Advisory presentation QA',expectedVersion:detail.data.offerVersion});assert.equal(edit.status,200);
   detail=await http(url);for(const key of ['departure','arrival'])assert.equal(detail.data.offer.flights[0].outboundSegments[0][key],payload.flights[0].outboundSegments[0][key]);
   for(const status of ['ready','sent','booked'])assert.equal((await http(url+'/status','PATCH',{status})).status,200);
   log(kind+' valid protected workflow',{put:200,ready:200,sent:200,booked:200});
  }

 }
}catch(e){rows.push({result:'FAIL',error:e.stack});console.error(e);process.exitCode=1;}finally{if(child&&child.exitCode===null){child.kill('SIGKILL');await new Promise(r=>child.once('exit',r));}if(process.env.AYA_GATE_REPORT)fs.writeFileSync(process.env.AYA_GATE_REPORT,JSON.stringify(rows,null,2));fs.rmSync(temp,{recursive:true,force:true});}})();
