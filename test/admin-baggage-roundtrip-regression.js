'use strict';
// Isolated authenticated local admin; imports are synthetic responses, never OCR/provider calls.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto'),Module=require('node:module'),assert=require('node:assert/strict'),{spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'aya-admin-baggage-')),dbfile=path.join(temp,'db.json'),port=39000+Math.floor(Math.random()*800),base=`http://127.0.0.1:${port}`,secret=crypto.randomBytes(32).toString('hex');
for(const[k,v]of Object.entries({DATA_DIR:temp,DB_FILE:dbfile,AIRPORT_CONFIG_FILE:temp+'/airports.json',OCR_PATTERN_CONFIG_FILE:temp+'/ocr.json',SERPAPI_KEY:''}))process.env[k]=v;
const filename=path.join(root,'server.js'),h=new Module(filename,module);h.filename=filename;h.paths=Module._nodeModulePaths(root);h._compile(fs.readFileSync(filename,'utf8')+'\nmodule.exports.baggageTest={normalizeOffer,renderOfferHtml,renderGt63PrintOfferHtml};',filename);const api=h.exports.baggageTest;
const cases=[['zero',{confirmed:true,cabin:{pieces:0},personalItem:{pieces:0},evidence:{tag:'RAW-ZERO'}},'Ръчен багаж: 0 бр.; Личен багаж: 0 бр.'],['detail',{confirmed:true,cabin:{pieces:1,weightKg:8},evidence:{tag:'RAW-DETAIL'}},'Ръчен багаж: 1 бр., 8 кг'],['unknown',{confirmed:false,checked:{pieces:1,weightKg:23}},'Багажът подлежи на потвърждение'],['malformed',{unexpected:{source:'preserve'}},'Багажът подлежи на потвърждение']];
const flight=baggage=>({currency:'EUR',airline:'QA Airline',route:'SOF -> AUH / AUH -> SOF',departure:'2099-11-21T16:00',arrival:'2099-11-29T02:35',price:100,baggage,outboundSegments:[{from:'SOF',to:'AUH',departure:'2099-11-21T16:00',arrival:'2099-11-21T23:00'}],inboundSegments:[{from:'AUH',to:'SOF',departure:'2099-11-29T02:35',arrival:'2099-11-29T08:40'}]});
const hotel={currency:'EUR',id:'qa-hotel',name:'QA Abu Dhabi',area:'Abu Dhabi',price:200,meal:'Breakfast',selected:true,occupancy:{adults:2,children:0,rooms:1,confirmed:true}};
const body=baggage=>({clientName:'SYNTHETIC BAGGAGE QA',destination:'Abu Dhabi',travelDates:'21.11.2099 - 29.11.2099',guests:'2 adults',status:'draft',currency:'EUR',markupPercent:5,flights:[flight(baggage)],hotels:[hotel]});
const offers=cases.map(([name,baggage])=>({...api.normalizeOffer(body(baggage)),id:'QA-BAG-'+name,agencyId:'QA',createdBy:'QA',createdAt:new Date().toISOString()}));
const proposalBody=body(cases[1][1]);proposalBody.proposalInput=require('../gt63-core/legacy-offer-print-input').buildLegacyOfferPrintInput(proposalBody);proposalBody.proposalInput.proposalTemplate.selected='multi-hotel';proposalBody.proposalTemplate={selected:'multi-hotel'};proposalBody.proposalInput.flight.baggage=cases[1][1];offers.push({...api.normalizeOffer(proposalBody),id:'QA-BAG-proposal',agencyId:'QA',createdBy:'QA',createdAt:new Date().toISOString()});
fs.writeFileSync(dbfile,JSON.stringify({agencies:[{id:'QA',agencyId:'QA',name:'QA',status:'active',plan:'PRO',subscription:{plan:'PRO',status:'active'}}],users:[{id:'QA',agencyId:'QA',role:'admin',name:'QA Admin',email:'qa@example.test'}],offers,clients:[],activities:[],invites:[]}));
const session=Buffer.from(JSON.stringify({userId:'QA',exp:Date.now()+3600000})).toString('base64url'),cookie='aya_session='+session+'.'+crypto.createHmac('sha256',secret).update(session).digest('base64url');
const child=spawn(process.execPath,[filename],{cwd:temp,env:{PATH:process.env.PATH,HOME:process.env.HOME,NODE_ENV:'test',PORT:String(port),DATA_DIR:temp,DB_FILE:dbfile,AIRPORT_CONFIG_FILE:temp+'/airports.json',OCR_PATTERN_CONFIG_FILE:temp+'/ocr.json',REGRESSION_LIBRARY_DIR:temp+'/library',AUTH_SECRET:secret,BETA_AUTH_BYPASS:'false',LIVE_BASE_URL:base},stdio:['ignore','pipe','pipe']});let output='',browser;
child.stdout.on('data',v=>output+=v);child.stderr.on('data',v=>output+=v);
async function read(id){const r=await fetch(base+'/api/offers/'+id,{headers:{Cookie:cookie}});assert.equal(r.status,200);return (await r.json()).offer;}
(async()=>{try{
 let healthy=false;for(let i=0;i<100;i++){try{healthy=(await fetch(base+'/api/health')).ok;}catch{}if(healthy)break;await new Promise(r=>setTimeout(r,100));}assert(healthy,output);
 browser=await require('puppeteer').launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});const page=await browser.newPage();await page.setCookie({name:'aya_session',value:cookie.slice('aya_session='.length),url:base});
 await page.setRequestInterception(true);page.on('request',r=>r.url().startsWith(base)||r.url().startsWith('data:')?r.continue():r.abort());page.on('dialog',d=>d.type()==='confirm'?d.accept():d.dismiss());
 await page.goto(base+'/admin',{waitUntil:'networkidle0'});assert(!page.url().includes('/login'));
 for(const [name,baggage,label]of [...cases,['proposal',cases[1][1],cases[1][2]]]){
  const id='QA-BAG-'+name,before=await read(id);await page.evaluate(id=>editOffer(id),id);
  assert.equal(await page.$eval('#flightBaggage',e=>e.value),label);assert.equal(await page.$eval('#flightCards input[placeholder="Baggage"]',e=>e.value),label);
  const clientBefore=await api.renderOfferHtml(before),printBefore=api.renderGt63PrintOfferHtml(before);
  const request=page.waitForResponse(r=>r.url()===base+'/api/offers/'+id&&r.request().method()==='PUT');await page.evaluate(()=>saveOffer());const response=await request;assert.equal(response.status(),200,await response.text());
  const sent=JSON.parse(response.request().postData());assert.deepEqual(sent.flights[0].baggage,baggage);assert.deepEqual(sent.flightBaggage,baggage);const after=await read(id);assert.deepEqual(after.flights[0].baggage,baggage);if(name==='proposal')assert.deepEqual(after.proposalInput.flight.baggage,baggage);for(const field of ['flightPrice','hotelPrice','markupPercent','finalPrice'])assert.equal(after[field],before[field],field);for(const field of ['hotels','guests','travelDates','status'])assert.deepEqual(after[field],before[field],field);
  assert.equal(await api.renderOfferHtml(after),clientBefore);assert.equal(api.renderGt63PrintOfferHtml(after),printBefore);
  await page.evaluate(id=>editOffer(id),id);assert.equal(await page.$eval('#flightBaggage',e=>e.value),label);console.log('PASS authenticated edit/load/PUT/reopen + client output identity',name);
 }
 // Primary explicit edits survive sync/pricing; card edits follow the existing text contract.
 await page.evaluate(()=>editOffer('QA-BAG-malformed'));
 await page.evaluate(()=>{const input=$('flightBaggage');input.value='QA explicit text';input.dispatchEvent(new Event('input',{bubbles:true}));updateAutoPrice();});assert.equal(await page.$eval('#flightBaggage',e=>e.value),'QA explicit text');
 await page.evaluate(()=>editFlightBaggage(0,'QA card edit'));assert.equal(await page.$eval('#flightBaggage',e=>e.value),'QA card edit');
 const editId='QA-BAG-malformed',editedResponse=page.waitForResponse(r=>r.url()===base+'/api/offers/'+editId&&r.request().method()==='PUT');await page.evaluate(()=>saveOffer());assert.equal((await editedResponse).status(),200);assert.equal((await read(editId)).flights[0].baggage,'QA card edit');console.log('PASS explicit main/card text edits and pricing sync');
 // Synthetic responses only: exercise actual Smart Import and universal apply paths.
 await page.evaluate(()=>{setEditMode(null);flights=[];hotels=[];setValue('destination','Abu Dhabi');setValue('travelDates','21.11.2099 - 29.11.2099');});
 const imported=flight(cases[1][1]);await page.evaluate(async f=>{await applyFlightImportResult({flight:f,flightPrice:100});},imported);assert.equal(await page.$eval('#flightBaggage',e=>e.value),cases[1][2]);assert.deepEqual(await page.evaluate(()=>flights[0].baggage),cases[1][1]);console.log('PASS legacy flight screenshot apply');
 await page.evaluate(async data=>{renderUniversalTravelReview(data,[]);await applyUniversalTravelIntakeResult();},{mode:'GT63_SMART_IMPORT',offerFlight:flight(cases[0][1]),offerHotel:hotel,offerHotelOptions:[hotel],warnings:[]});assert.equal(await page.$eval('#flightBaggage',e=>e.value),cases[0][2]);assert.deepEqual(await page.evaluate(()=>flights[0].baggage),cases[0][1]);console.log('PASS Smart Import/universal review/apply lossless object');
 await page.evaluate(async data=>{
  const original=fetchJson;window.fetchJson=async(url,options)=>url==='/api/import-image'?{flight:data.flight,flightPrice:100}:url==='/api/import-hotel-image'?{hotel:data.hotel}:original(url,options);
  for(const id of ['flightImage','hotelImage']){const dt=new DataTransfer();dt.items.add(new File(['synthetic'],'qa.jpg',{type:'image/jpeg'}));$(id).files=dt.files;}
  await autoBuildOffer();window.fetchJson=original;
 },{flight:flight(cases[1][1]),hotel});assert.equal(await page.$eval('#flightBaggage',e=>e.value),cases[1][2]);assert.deepEqual(await page.evaluate(()=>flights[0].baggage),cases[1][1]);console.log('PASS AUTO BUILD synthetic import responses preserve object');
 // Legacy top-level payload is still accepted losslessly by the existing normalizer.
 const legacy=body(cases[0][1]);delete legacy.flights;Object.assign(legacy,{flightAirline:'QA Airline',flightRoute:'SOF-AUH',flightDeparture:'2099-11-21',flightArrival:'2099-11-29',flightBaggage:cases[0][1],flightPrice:100});const normalized=JSON.parse(JSON.stringify(api.normalizeOffer(legacy)));assert.deepEqual(normalized.flights[0].baggage,cases[0][1]);console.log('PASS legacy flat payload normalization');
 console.log('PASS admin baggage targeted regression');
}finally{if(browser)await browser.close();if(child.exitCode===null){const stopped=new Promise(r=>child.once('exit',r));child.kill('SIGKILL');await stopped;}fs.rmSync(temp,{recursive:true,force:true});}})().catch(e=>{console.error(e);process.exitCode=1;});
