'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),os=require('node:os'),Module=require('node:module');
const root=path.resolve(__dirname,'..'),admin=fs.readFileSync(root+'/public/admin.js','utf8');
const section=(a,b)=>admin.slice(admin.indexOf(a),admin.indexOf(b,admin.indexOf(a)));
const copy=x=>JSON.parse(JSON.stringify(x));
function setup({guests='2 възрастни',confirmed=true,adults=2,children=2,rooms=1,accept=true,editing=true,ticketAdults=2,noFlight=false,selected=true}={}){
 const fields={guests:{value:guests}},calls=[],prompts=[],alerts=[];
 const flight={airline:'Synthetic Air',route:'SOF -> CIA / CIA -> SOF',departure:'2099-11-21T21:45',arrival:'2099-11-29T08:40',price:200,passengers:ticketAdults,adults:ticketAdults,children:0,baggage:'Synthetic baggage',notes:`Билет: ${ticketAdults} възрастни; 0 деца.`,outboundSegments:[{from:'SOF',to:'CIA',departure:'2099-11-21T21:45',arrival:'2099-11-21T23:30',flightNumber:'TEST1'}],inboundSegments:[{from:'CIA',to:'SOF',departure:'2099-11-29T07:20',arrival:'2099-11-29T08:40',flightNumber:'TEST2'}]};
 const hotel={id:'qa-a',name:'Synthetic Hotel A',area:'Synthetic City',selected,price:100,room:'Family room',meal:'Breakfast',images:['https://example.test/a.jpg'],occupancy:{adults,children,rooms,confirmed}};
 const other={...copy(hotel),id:'qa-b',name:'Synthetic Hotel B',price:140,selected:!selected,occupancy:{adults:2,children:0,rooms:1,confirmed:true}};
 const base={destination:'Synthetic City',clientName:'QA ONLY',travelDates:'21.11.2099 - 29.11.2099',guests,flightPrice:noFlight?0:200,hotelPrice:100,markupPercent:5,currency:'EUR',status:'draft',flightRoute:noFlight?'':flight.route,flightAirline:noFlight?'':flight.airline,flightDeparture:noFlight?'':flight.departure,flightArrival:noFlight?'':flight.arrival,flightNotes:noFlight?'':flight.notes};
 const ctx=vm.createContext({console:{log(){}},AYAHotelOccupancy:require('../public/hotel-occupancy'),AYAFlightDataConsistency:require('../public/flight-data-consistency'),hotelPersistenceUI:{},editingOfferId:editing?'SYNTHETIC-GUEST-QA':null,editingOfferVersion:'synthetic-version',flights:noFlight?[]:[copy(flight)],hotels:[copy(hotel),copy(other)],$:id=>fields[id],hasCapability:()=>true,collectForm:()=>({...copy(base),guests:fields.guests.value}),dedupeHotelOptionImages:copy,getDestinationMismatchWarnings:()=>[],getHotelStayMismatchWarnings:()=>[],confirm:message=>{prompts.push(message);return accept;},alert:message=>alerts.push(message),window:{currentValidationWarnings:['[INFO] Keep operator note'],open(){}},setEditMode(){},setCreateSurfaceOpen(){},loadStats:async()=>{},loadOffers:async()=>{},fetchJson:async(url,options)=>{calls.push({url,method:options.method,payload:JSON.parse(options.body)});return {offer:{id:'SYNTHETIC-GUEST-QA'}};}});
 vm.runInContext(section('function normalizeText(', 'function destinationAlias(')+section('function reviewFlightDateConsistency(', 'function editFlightDateSummary(')+section('function parseAdultCount(', 'function parseHotelNightCount(')+section('function getFlightPassengerMismatchWarnings(', 'function confirmMismatchWarnings(')+section('async function saveOffer()', 'function formatOperatorFlightSegment('),ctx);
 return {ctx,fields,calls,prompts,alerts,flight,hotels:[hotel,other],base};
}
test('operator accepts confirmed2+2: full save sends corrected Guests, keeps exact hotels/flights/prices/dates/version',async()=>{
 const s=setup(),before=JSON.stringify(s.ctx.hotels);await s.ctx.saveOffer();assert.equal(s.prompts.length,1);assert.equal(s.calls.length,1);
 const r=s.calls[0];assert.equal(r.method,'PUT');assert.equal(r.payload.expectedVersion,'synthetic-version');assert.equal(r.payload.guests,'2 възрастни и 2 деца');assert.equal(s.fields.guests.value,r.payload.guests);assert.deepEqual(r.payload.hotels,s.hotels);assert.equal(JSON.stringify(s.ctx.hotels),before);
 assert.deepEqual(r.payload.flights,[s.flight]);for(const key of ['flightPrice','hotelPrice','markupPercent','currency','status','travelDates'])assert.deepEqual(r.payload[key],s.base[key]);assert(r.payload.validationWarnings.includes('[INFO] Keep operator note'));
});
test('operator refuses: Guests and form unchanged, original value is saved without confirming flight passengers',async()=>{
 const s=setup({accept:false});await s.ctx.saveOffer();assert.equal(s.prompts.length,1);assert.equal(s.fields.guests.value,'2 възрастни');assert.equal(s.calls[0].payload.guests,'2 възрастни');assert.deepEqual(s.calls[0].payload.flights,[s.flight]);
});
test('unconfirmed/invalid occupancy, different adults, no children or already-correct Guests never auto-replace',async()=>{
 for(const options of [{confirmed:false},{adults:3},{children:0},{rooms:0},{guests:'2 възрастни и 2 деца'},{guests:'2 adults and 2 children'}]){
  const s=setup(options),before=s.fields.guests.value;await s.ctx.saveOffer();assert.equal(s.prompts.length,0,JSON.stringify(options));assert.equal(s.fields.guests.value,before);assert.equal(s.calls[0].payload.guests,before);
 }
});
test('only selected hotel qualifies; unselected family hotel cannot replace Guests',async()=>{
 const s=setup({selected:false});await s.ctx.saveOffer();assert.equal(s.prompts.length,0);assert.equal(s.calls[0].payload.guests,'2 възрастни');
});
test('new-offer POST and English adults-only input use same explicit confirmation',async()=>{
 const s=setup({editing:false,guests:'2 adults'});await s.ctx.saveOffer();assert.equal(s.calls[0].method,'POST');assert.equal(s.calls[0].url,'/api/offers');assert.equal(s.calls[0].payload.guests,'2 възрастни и 2 деца');assert.equal(s.calls[0].payload.expectedVersion,undefined);
});
test('hotel family counts never rewrite independent ticket passenger counts or remove flight mismatch warnings',async()=>{
 const s=setup({ticketAdults:3});await s.ctx.saveOffer();const p=s.calls[0].payload;assert.equal(p.guests,'2 възрастни и 2 деца');assert.equal(p.flights[0].passengers,3);assert.equal(p.flights[0].adults,3);assert.equal(p.flights[0].children,0);assert(p.validationWarnings.some(w=>w.includes('полетът показва 3 възрастни')));
 const noFlight=setup({noFlight:true});await noFlight.ctx.saveOffer();assert.deepEqual(noFlight.calls[0].payload.flights,[]);
});
const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'aya-guest-pr33-'));
for(const [key,file]of Object.entries({DATA_DIR:'.',DB_FILE:'db.json',AIRPORT_CONFIG_FILE:'airports.json',OCR_PATTERN_CONFIG_FILE:'ocr.json',REGRESSION_LIBRARY_DIR:'library'}))process.env[key]=path.join(scratch,file);
process.env.SERPAPI_KEY='';process.on('exit',()=>fs.rmSync(scratch,{recursive:true,force:true}));
const filename=root+'/server.js',harness=new Module(filename,module);harness.filename=filename;harness.paths=Module._nodeModulePaths(root);harness._compile(fs.readFileSync(filename,'utf8')+'\nmodule.exports.guestTest={normalizeOffer,renderOfferHtml,renderGt63PrintOfferHtml};',filename);const server=harness.exports.guestTest;
test('accepted/refused saves survive normalize/reload and HTML/print preserve pricing, hotels, images and dates',async()=>{
 for(const accept of [true,false]){
  const s=setup({accept});await s.ctx.saveOffer();const saved=server.normalizeOffer(s.calls[0].payload),reloaded=copy(saved),before=JSON.stringify(reloaded);assert.equal(reloaded.guests,accept?'2 възрастни и 2 деца':'2 възрастни');assert.equal(Math.round(saved.finalPrice*100)/100,315);assert.equal(saved.hotels.length,2);assert.deepEqual(saved.hotels[0].images,s.hotels[0].images);
  const html=await server.renderOfferHtml(reloaded),print=server.renderGt63PrintOfferHtml(reloaded);for(const text of [html,print]){assert(text.includes('Synthetic Hotel A'));assert(text.includes('315'));assert(text.includes('2099'));assert(text.includes('TEST1'));}assert.equal(JSON.stringify(reloaded),before);
 }
});
test('family Guests derived from hotel cannot be labelled as confirmed flight passengers in UI or HTML',async()=>{
 const s=setup();await s.ctx.saveOffer();const html=await server.renderOfferHtml(server.normalizeOffer(s.calls[0].payload));
 assert.doesNotMatch(html,/Полетни пътници:<\/strong>\s*2 възрастни и 2 деца/);
 assert.match(s.prompts[0],/не потвърждава.*самолетн/i);
 const form=fs.readFileSync(root+'/public/admin.html','utf8');assert.doesNotMatch(form,/<label>Полетни пътници \(не хотелска заетост\)<\/label>/);
});
