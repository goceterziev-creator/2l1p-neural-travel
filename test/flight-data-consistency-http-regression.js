"use strict";
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),assert=require('node:assert/strict'),vm=require('node:vm'),{spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..'),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'aya-consistency-http-')),port=39000+Math.floor(Math.random()*1000),base=`http://127.0.0.1:${port}`,dbfile=tmp+'/db.json',secret=crypto.randomBytes(32).toString('hex');
for(const [k,v]of Object.entries({DATA_DIR:tmp,DB_FILE:dbfile,AIRPORT_CONFIG_FILE:tmp+'/airports.json',OCR_PATTERN_CONFIG_FILE:tmp+'/ocr.json',REGRESSION_LIBRARY_DIR:tmp+'/library',BETA_AUTH_BYPASS:'false',AUTH_SECRET:secret,SERPAPI_KEY:''}))process.env[k]=v;
const {normalizeOffer}=require('../server'),consistency=require('../public/flight-data-consistency'),puppeteer=require('puppeteer');
const fixture=normalizeOffer({id:'SYNTHETIC-CONSISTENCY-QA',clientName:'QA ONLY',destination:'Рим',travelDates:'16.11.2098 - 20.11.2098',guests:'2 adults',status:'draft',markupPercent:5,flights:[{airline:'Buzz + Malta Air',route:'SOF -> CIA / CIA -> SOF',departure:'SOF -> CIA, 2098-11-16T13:25 - 2098-11-16T14:15',arrival:'CIA -> SOF, 2098-11-20T12:25 - 2098-11-20T15:10',price:200,baggage:'Synthetic baggage',outboundSegments:[{from:'SOF',to:'CIA',departure:'2020-11-16T13:25',arrival:'2020-11-16T14:15',flightNumber:'FR625',airline:'Buzz'}],inboundSegments:[{from:'CIA',to:'SOF',departure:'2020-11-20T12:25',arrival:'2020-11-20T15:10',flightNumber:'FR626',airline:'Malta Air'}]}],hotels:[{id:'qa-hotel-a',name:'Synthetic QA Hotel',area:'Рим',room:'Synthetic room',meal:'Synthetic meal',price:100,selected:true,images:[base+'/images/hotels/ao-london-docklands.jpg'],occupancy:{adults:2,children:0,rooms:1,confirmed:true}}]});
fixture.agencyId='AGY-AYA';fixture.createdBy='QA';fixture.editorialRevision=0;
fs.writeFileSync(dbfile,JSON.stringify({offers:[fixture],users:[{id:'QA',name:'QA',agencyId:'AGY-AYA',role:'admin',email:'qa@example.test'},{id:'OTHER',name:'Other QA',agencyId:'OTHER',role:'admin',email:'other@example.test'}],activities:[]}));
const cookieFor=id=>{const p=Buffer.from(JSON.stringify({userId:id,exp:Date.now()+3600000})).toString('base64url');return 'aya_session='+p+'.'+crypto.createHmac('sha256',secret).update(p).digest('base64url');};const cookie=cookieFor('QA'),other=cookieFor('OTHER');
const snapshot=()=>fs.readFileSync(dbfile,'utf8'),record=id=>JSON.parse(snapshot()).offers.find(o=>o.id===id),rows=[];let child,browser;
async function request(url,method='GET',body,auth=cookie){const r=await fetch(base+url,{method,redirect:'manual',headers:{...(auth?{Cookie:auth}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});const bytes=Buffer.from(await r.arrayBuffer());let data;try{data=JSON.parse(bytes)}catch{}return {status:r.status,data,bytes,text:bytes.toString()};}
function pass(name,result){rows.push({name,result:'PASS',...result});console.log(JSON.stringify(rows.at(-1)));}
(async()=>{try{
 const fd=fs.openSync(tmp+'/server.log','w');child=spawn(process.execPath,[root+'/server.js'],{cwd:tmp,env:{PATH:process.env.PATH,HOME:process.env.HOME,PUPPETEER_EXECUTABLE_PATH:process.env.PUPPETEER_EXECUTABLE_PATH,PORT:String(port),DATA_DIR:tmp,DB_FILE:dbfile,AIRPORT_CONFIG_FILE:tmp+'/airports.json',OCR_PATTERN_CONFIG_FILE:tmp+'/ocr.json',REGRESSION_LIBRARY_DIR:tmp+'/library',AUTH_SECRET:secret,BETA_AUTH_BYPASS:'false',LIVE_BASE_URL:base,NODE_ENV:'test'},stdio:['ignore',fd,fd]});fs.closeSync(fd);
 for(let i=0;i<100;i++){try{if((await request('/api/health')).status===200)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 const url='/api/offers/'+fixture.id,opened=await request(url);assert.equal(opened.status,200);const oldVersion=opened.data.offerVersion;
 for(const [auth,status] of [['',401],[other,403]]){const before=snapshot(),r=await request(url,'PUT',{...opened.data.offer},auth);assert.equal(r.status,status);assert.equal(snapshot(),before);}pass('authentication and agency before version/consistency',{anonymous:401,otherAgency:403});
 for(const method of ['POST','PUT']){const before=snapshot(),r=await request(method==='POST'?'/api/offers':url,method,{...opened.data.offer,expectedVersion:oldVersion});assert.equal(r.status,422);assert.equal(r.data.error,'AYA_FLIGHT_DATA_CONFLICT');assert(JSON.stringify(r.data.details).includes('2020-11-16'));assert(JSON.stringify(r.data.details).includes('2098-11-16'));assert.equal(snapshot(),before);}pass('conflicting create and update are atomic refusals',{post:422,put:422,noMutation:true,noAudit:true});
 for(const broken of [null,'bad',[null],[{from:'SOF',to:'CIA',departure:'2020-11-16T13:25'}]]){const f=structuredClone(opened.data.offer);f.flights[0].outboundSegments=broken;const before=snapshot(),r=await request(url,'PUT',{...f,expectedVersion:oldVersion});assert.equal(r.status,422);assert.equal(snapshot(),before);}pass('invalid/incomplete segments fail closed',{status:422,noMutation:true});
 browser=await puppeteer.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});const page=await browser.newPage();
 await page.setCookie({name:'aya_session',value:cookie.slice('aya_session='.length),url:base});await page.goto(base+'/admin',{waitUntil:'networkidle0'});await page.evaluate(id=>editOffer(id),fixture.id);
 const beforeCancel=snapshot(),beforeLocal=await page.evaluate(()=>JSON.stringify(flights));let dialogs=[],mode='cancel',manualAnswers=[],guestAccept=true;
 page.on('dialog',async d=>{dialogs.push({type:d.type(),message:d.message()});if(d.type()==='prompt')return mode==='cancel'?d.dismiss():d.accept(mode==='manual'?manualAnswers.shift():'SUMMARY');if(d.type()==='confirm')return guestAccept?d.accept():d.dismiss();return d.accept();});
 await page.click('[onclick="reviewSavedFlightDates(0)"]');await page.click('[data-date-source="cancel"]');assert.equal(await page.evaluate(()=>JSON.stringify(flights)),beforeLocal);assert.equal(snapshot(),beforeCancel);pass('real admin browser cancel',{sourceUnchanged:true,dbUnchanged:true});
 await page.evaluate(()=>{const input=document.querySelector('#flightCards input[placeholder="Departure"]');input.value='SOF -> CIA, 2097-11-16T13:25 - 2097-11-16T14:15';input.dispatchEvent(new Event('change'));});await page.click('[data-date-source="cancel"]');assert.equal(await page.evaluate(()=>JSON.stringify(flights)),beforeLocal);assert.equal(snapshot(),beforeCancel);pass('flight-card summary edit refusal',{sourceUnchanged:true,dbUnchanged:true});
 await page.evaluate(()=>{latestUniversalTravelIntake={offerFlight:JSON.parse(JSON.stringify(flights[0])),offerHotel:{},offerHotelOptions:[]};applyUniversalTravelIntakeResult();});await page.click('[data-date-source="cancel"]');assert.equal(await page.evaluate(()=>JSON.stringify(flights)),beforeLocal);assert.equal(snapshot(),beforeCancel);pass('actual import Use Result refusal',{sourceUnchanged:true,dbUnchanged:true});
 mode='summary';await page.click('[onclick="reviewSavedFlightDates(0)"]');await page.click('[data-date-source="summary"]');await page.waitForFunction(()=>flights[0].outboundSegments[0].departure.startsWith('2098'));const reviewed=await page.evaluate(()=>JSON.parse(JSON.stringify(flights[0])));assert(consistency.inspect(reviewed).ok);assert.equal(reviewed.outboundSegments[0].departure,'2098-11-16T13:25');assert.equal(reviewed.inboundSegments[0].departure,'2098-11-20T12:25');assert(dialogs.some(x=>x.message.includes('2020-11-16')&&x.message.includes('2098-11-16')));assert(dialogs.some(x=>x.type==='confirm'));assert.equal(snapshot(),beforeCancel);
 const responsePromise=page.waitForResponse(r=>r.request().method()==='PUT'&&r.url()===base+url);await page.evaluate(()=>saveOffer());const savedResponse=await responsePromise;assert.equal(savedResponse.status(),200);
 let current=await request(url);assert.equal(current.data.offer.flights[0].outboundSegments[0].departure,'2098-11-16T13:25');assert.equal(current.data.offer.flights[0].inboundSegments[0].departure,'2098-11-20T12:25');assert.equal(current.data.offer.finalPrice,fixture.finalPrice);assert.deepEqual(current.data.offer.hotels,JSON.parse(JSON.stringify(fixture.hotels)));assert.equal(current.data.offer.agencyId,fixture.agencyId);assert.equal(current.data.offer.flightDateSafety.ready,true);assert.equal(JSON.parse(snapshot()).activities.filter(x=>x.type==='offer_updated').length,1);
 await page.evaluate(id=>editOffer(id),fixture.id);assert.equal(await page.evaluate(()=>flights[0].outboundSegments[0].departure),'2098-11-16T13:25');pass('real admin confirm -> save -> reopen',{put:200,summaryYear:2098,segmentYear:2098,auditEvents:1,pricesHotelsImagesPreserved:true});
 const staleBefore=snapshot(),stale=await request(url,'PUT',{...current.data.offer,expectedVersion:oldVersion});assert.equal(stale.status,409);assert.equal(snapshot(),staleBefore);pass('stale editor after explicit correction',{status:409,noMutation:true});
 const beforePresentation=record(fixture.id),version=current.data.offerVersion;
 const html=await request('/api/offers/view/'+fixture.id,'GET',undefined,''),print=await request(url+'/print','GET',undefined,''),pdf=await request(url+'/pdf','GET',undefined,'');assert.equal(html.status,200);assert.equal(print.status,200);assert.equal(pdf.status,200);assert.equal(pdf.bytes.subarray(0,4).toString(),'%PDF');
 assert(print.text.includes('16 ноември 2098')&&print.text.includes('20 ноември 2098'));assert(!print.text.includes('2020'));assert(html.text.includes('16 ноември 2098'));assert(!html.text.includes('2020-11-16'));
 const src=fs.readFileSync(root+'/scripts/print-presentation-route-regression.js','utf8'),pdfTools=vm.createContext({zlib:require('zlib')});vm.runInContext(src.slice(src.indexOf('function flateStreams('),src.indexOf('function assertValidPdf(')),pdfTools);const text=pdfTools.extractPdfText(pdf.bytes).compactText;for(const value of ['2098','FR625','FR626','13:25','14:15','12:25','15:10'])assert(text.includes(value));assert(!text.includes('2020'));
 const afterPresentation=record(fixture.id);assert.equal(afterPresentation.clientViews,(beforePresentation.clientViews||0)+1);assert.equal(afterPresentation.pdfDownloads,(beforePresentation.pdfDownloads||0)+1);for(const key of ['flights','hotels','finalPrice','markupPercent','agencyId','status'])assert.deepEqual(afterPresentation[key],beforePresentation[key]);current=await request(url);assert.equal(current.data.offerVersion,version);pass('HTML / print / real PDF consistency and telemetry',{html:200,print:200,pdf:200,clientViewsDelta:1,pdfDownloadsDelta:1,editorialVersionUnchanged:true});
 const historical={...fixture,id:undefined,flights:[consistency.resolve(fixture.flights[0],'segments')]};const created=await request('/api/offers','POST',historical);assert.equal(created.status,200);const historyId=created.data.offer.id;assert.equal(record(historyId).flights[0].outboundSegments[0].departure,'2020-11-16T13:25');
 for(const status of ['ready','sent','booked']){const before=snapshot(),r=await request('/api/offers/'+historyId+'/status','PATCH',{status});assert.equal(r.status,422);assert.equal(r.data.error,'AYA_FLIGHT_DATE_BLOCKED');assert.equal(snapshot(),before);}const bookBefore=snapshot(),book=await request('/api/offers/'+historyId+'/book','POST',{});assert.equal(book.status,422);assert.equal(snapshot(),bookBefore);pass('historical2020 never rewritten; status and alternate book safety intact',{createDraft:200,storedYear:2020,ready:422,sent:422,booked:422,alternateBook:422});
 const unconfirmed={...fixture,id:undefined,flights:[reviewed],hotels:fixture.hotels.map(h=>({...h,occupancy:{...h.occupancy,confirmed:false}}))};const un=await request('/api/offers','POST',unconfirmed);assert.equal(un.status,200);for(const status of ['ready','sent','booked']){const before=snapshot(),r=await request('/api/offers/'+un.data.offer.id+'/status','PATCH',{status});assert.equal(r.status,422);assert.equal(r.data.error,'AYA_HOTEL_OCCUPANCY_BLOCKED');assert.equal(snapshot(),before);}pass('independent occupancy gate remains unchanged',{ready:422,sent:422,booked:422});
 // The editor supplies an unclassified transfer note even though the server
 // already produces the material CIA advisory. Explicitly review that copy.
 const reopenedForReview=(await request(url)).data;
 const [transferNotice]=reopenedForReview.offer.noticeReview.notices;
 assert.equal(reopenedForReview.offer.noticeReview.unresolved,1);
 assert.match(transferNotice.message,/валидно летище за Рим/);
 const decision=await request(url+'/notice-classification','PATCH',{expectedVersion:reopenedForReview.offerVersion,noticeId:transferNotice.id,classification:'INTERNAL_DIAGNOSTIC'});
 assert.equal(decision.status,200,decision.text);
 for(const status of ['ready','sent','booked'])assert.equal((await request(url+'/status','PATCH',{status})).status,200);pass('valid coherent future flight permits existing workflow',{ready:200,sent:200,booked:200});
 const clockId='SYNTHETIC-CLOCK-ONLY',clockOffer=structuredClone(fixture);clockOffer.id=clockId;clockOffer.travelDates='16.11.2099 - 20.11.2099';
 for(const segment of [...clockOffer.flights[0].outboundSegments,...clockOffer.flights[0].inboundSegments,...clockOffer.flights[0].segments])for(const side of ['departure','arrival'])segment[side]=segment[side].match(/\d{2}:\d{2}/)[0];
 const clockDb=JSON.parse(snapshot());clockDb.offers.push(clockOffer);fs.writeFileSync(dbfile,JSON.stringify(clockDb));
 await page.evaluate(id=>editOffer(id),clockId);const clockBefore=snapshot();mode='manual';manualAnswers=['2099-11-16','2099-11-16','2099-11-20','2099-11-20'];
 await page.click('[onclick="reviewSavedFlightDates(0)"]');await page.click('[data-date-source="manual"]');await page.waitForFunction(()=>flights[0].outboundSegments[0].departure.startsWith('2099'));assert.equal(manualAnswers.length,0);assert.equal(snapshot(),clockBefore);
 const clockSaved=page.waitForResponse(r=>r.request().method()==='PUT'&&r.url()===base+'/api/offers/'+clockId);await page.evaluate(()=>saveOffer());assert.equal((await clockSaved).status(),200);
 const clockRead=await request('/api/offers/'+clockId);assert.equal(clockRead.status,200);assert.equal(clockRead.data.offer.flights[0].outboundSegments[0].departure,'2099-11-16T13:25');assert.equal(clockRead.data.offer.flights[0].inboundSegments[0].arrival,'2099-11-20T15:10');assert.deepEqual(clockRead.data.offer.hotels,JSON.parse(JSON.stringify(fixture.hotels)));assert.equal(clockRead.data.offer.finalPrice,fixture.finalPrice);assert.equal(clockRead.data.offer.flightDateSafety.ready,true);
 pass('clock-only legacy segments -> explicit browser MANUAL confirmation -> HTTP save/reload',{put:200,get:200,confirmedYear:2099,pricesHotelsUnchanged:true});
 for(const accept of [true,false]){
  const futureFlight=JSON.parse(JSON.stringify(consistency.resolve(fixture.flights[0],'summary')).replaceAll('2098','2099'));futureFlight.notes='Билет: 2 възрастни; 0 деца.';
  const body={...fixture,id:undefined,guests:'2 възрастни',travelDates:'16.11.2099 - 20.11.2099',flights:[futureFlight],hotels:fixture.hotels.map(h=>({...h,occupancy:{adults:2,children:2,rooms:1,confirmed:true}}))};
  const createdGuest=await request('/api/offers','POST',body);assert.equal(createdGuest.status,200);const guestId=createdGuest.data.offer.id,guestUrl='/api/offers/'+guestId,beforeGuest=(await request(guestUrl)).data;
  await page.evaluate(id=>editOffer(id),guestId);mode='summary';guestAccept=accept;const promptCount=dialogs.length;
  const guestSaved=page.waitForResponse(r=>r.request().method()==='PUT'&&r.url()===base+guestUrl);await page.evaluate(()=>saveOffer());assert.equal((await guestSaved).status(),200);
  const afterGuest=await request(guestUrl);assert.equal(afterGuest.status,200);assert.equal(afterGuest.data.offer.guests,accept?'2 възрастни и 2 деца':'2 възрастни');assert.notEqual(afterGuest.data.offerVersion,beforeGuest.offerVersion);
  for(const key of ['flights','hotels','flightPrice','hotelPrice','markupPercent','finalPrice','travelDates','status','agencyId'])assert.deepEqual(afterGuest.data.offer[key],beforeGuest.offer[key],key);
  assert(dialogs.slice(promptCount).some(d=>d.type==='confirm'&&d.message.includes('хотелска заетост')));
  await page.evaluate(id=>editOffer(id),guestId);assert.equal(await page.$eval('#guests',el=>el.value),afterGuest.data.offer.guests);
  const guestHtml=await request('/api/offers/view/'+guestId,'GET',undefined,'');assert.equal(guestHtml.status,200);assert(!guestHtml.text.includes('<strong>Полетни пътници:</strong>'));
  let pdfStatus=null;if(accept){const guestPdf=await request(guestUrl+'/pdf','GET',undefined,'');assert.equal(guestPdf.status,200);const txt=pdfTools.extractPdfText(guestPdf.bytes).compactText;assert(txt.includes('2възрастнии2деца'));assert(txt.includes('315'));assert(txt.includes('FR625'));pdfStatus=200;}
  pass('confirmed family Guests '+(accept?'accepted':'declined')+' through actual browser/save/reopen',{create:200,put:200,get:200,html:200,pdf:pdfStatus,guests:afterGuest.data.offer.guests,flightTicketEvidenceUnchanged:true,hotelsPricingDatesUnchanged:true});
 }
 const rawPegasus = {
   airline: 'Pegasus', route: 'SOF -> SAW / SAW -> SOF', price: 200,
   departure: 'SOF -> SAW, 2026-11-25T12:55 - 2026-11-25T15:10',
   arrival: 'SAW -> SOF, 2026-11-27T18:05 - 2026-11-27T18:25',
   outbound: { segments: [{ flightNumber: 'PC272', from: 'SOF', to: 'SAW', departure: '25-ноем. 12:55', arrival: '25-ноем. 15:10' }] },
   inbound: { segments: [{ flightNumber: 'PC273', from: 'SAW', to: 'SOF', departure: '27-ноем. 18:05', arrival: '27-ноем. 18:25' }] }
 };
 const pegasusDraft = { ...fixture, id: undefined, status: 'draft', destination: 'Истанбул',
   travelDates: '25.11.2026 - 27.11.2026', flightDeparture: rawPegasus.departure,
   flightArrival: rawPegasus.arrival, flights: [rawPegasus] };
 const beforePegasus = snapshot();
 const rejectedPegasus = await request('/api/offers', 'POST', pegasusDraft);
 assert.equal(rejectedPegasus.status, 422);
 assert.equal(rejectedPegasus.data.error, 'AYA_FLIGHT_DATA_CONFLICT');
 assert.equal(snapshot(), beforePegasus);

 const confirmedPegasus = consistency.resolve(rawPegasus, 'manual', {
   outbound: [{ departure: '2026-11-25', arrival: '2026-11-25' }],
   inbound: [{ departure: '2026-11-27', arrival: '2026-11-27' }]
 });
 const createdPegasus = await request('/api/offers', 'POST', {
   ...pegasusDraft, flights: [confirmedPegasus],
   flightDeparture: confirmedPegasus.departure, flightArrival: confirmedPegasus.arrival
 });
 assert.equal(createdPegasus.status, 200, createdPegasus.text);
 const persistedPegasus = await request('/api/offers/' + createdPegasus.data.offer.id);
 assert.equal(persistedPegasus.status, 200);
 const persistedFlight = persistedPegasus.data.offer.flights[0];
 assert.deepEqual(persistedFlight.segments.map(({flightNumber, departure, arrival}) => [flightNumber, departure, arrival]), [
   ['PC272', '2026-11-25T12:55', '2026-11-25T15:10'],
   ['PC273', '2026-11-27T18:05', '2026-11-27T18:25']
 ]);
 assert.equal(persistedFlight.departure, confirmedPegasus.departure);
 assert.equal(persistedFlight.arrival, confirmedPegasus.arrival);
 assert.deepEqual(consistency.offerConflicts({ flights: [persistedFlight] }), []);
 pass('PC272/PC273 unresolved draft blocked; explicit dates save and reopen', { unresolvedPost: 422, confirmedPost: 200, confirmedGet: 200 });
}catch(e){rows.push({result:'FAIL',error:e.stack});console.error(e);process.exitCode=1;}finally{if(browser)await browser.close();if(child&&child.exitCode===null){child.kill('SIGKILL');await new Promise(r=>child.once('exit',r));}if(process.env.AYA_CONSISTENCY_REPORT)fs.writeFileSync(process.env.AYA_CONSISTENCY_REPORT,JSON.stringify(rows,null,2));fs.rmSync(tmp,{recursive:true,force:true});}})();
