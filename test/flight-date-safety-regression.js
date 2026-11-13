"use strict";
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.resolve(__dirname,'../server.js'),'utf8'),context=vm.createContext({normalizeTravelDate:require('../server/travel-normalizers/date-normalizer').normalizeTravelDate,safeArray:v=>Array.isArray(v)?v:[],getFlights:o=>(o.flights||[]).length?o.flights:o.flightOptions||[],toNumber:(v,f=0)=>Number(v)||f});
vm.runInContext(source.slice(source.indexOf('function inferYearFromText('),source.indexOf('function flightDateKey(')),context);
const date=new Date('2026-11-11T12:00:00Z'),check=o=>context.flightDateSafety(o,date),valid=()=>({travelDates:'16.11 - 20.11.2026',flights:[{outboundSegments:[{departure:'2026-11-16T10:30',arrival:'2026-11-16T11:30'}],inboundSegments:[{departure:'2026-11-20T10:30',arrival:'2026-11-20T11:30'}]}]});
test('deterministic future/past/mismatch/unknown year without rewriting dates',()=>{
 assert.equal(check(valid()).ready,true);
 const partial=valid();partial.flights[0].outboundSegments[0].departure='16.11 10:30';assert.equal(check(partial).ready,true);
 for(const travelDates of ['16–20 November 2026','16 November 2026 - 20 November 2026','16–20 ноември 2026'])assert.equal(check({...valid(),travelDates}).ready,true);
 for(const date of ['2020-11-16T10:30','2026-01-16T10:30','16.11.26 10:30','2026-13-16T10:30']){
  const offer=valid();offer.flights[0].outboundSegments[0].departure=date;const before=JSON.stringify(offer);assert.equal(check(offer).ready,false,date);assert.equal(JSON.stringify(offer),before);
 }
});
test('all segment aliases/arrivals and saved proposal independently participate; empty arrays cannot hide nested segments',()=>{
 const offer=valid();offer.flights[0].outbound={segments:[{departure:'2020-11-16T10:30',arrival:'2020-11-16T11:30'}]};assert.equal(check(offer).ready,false);
 const proposal=valid();proposal.proposalInput={flight:{...proposal.flights[0],outboundSegments:[],outbound:{segments:offer.flights[0].outbound.segments}}};assert.equal(check(proposal).ready,false);
 const arrival=valid();arrival.flights[0].inboundSegments[0].arrival='2020-11-20T10:30';assert.equal(check(arrival).ready,false);
});
test('dismissed warnings or cached ready verdict cannot bypass live safety, including next UTC day',()=>{
 const offer=valid();offer.warningsDismissed=true;offer.flightDateSafety={ready:true};offer.flights[0].outboundSegments[0].departure='2020-11-16T10:30';assert.equal(check(offer).ready,false);
 assert.equal(context.flightDateSafety(valid(),new Date('2026-11-17T00:00:00Z')).ready,false);
});
test('hotel-only offers are not flight-gated; priced/legacy flights require dates',()=>{
 assert.equal(check({hotels:[{id:'hotel-only'}]}).applicable,false);
 assert.equal(check({flightPrice:200,travelDates:'16.11 - 20.11.2026'}).ready,false);
});
test('admin READY and WhatsApp text fail closed on missing/stale/blocked verdicts',()=>{
 const admin=fs.readFileSync(path.resolve(__dirname,'../public/admin.js'),'utf8');let offer={id:'QA',status:'draft'};
 const ui=vm.createContext({getOfferById:()=>offer,getPublicOfferUrl:()=> 'https://example.test/offer/QA',qaTone:()=> 'ready',qaScore:()=>100,getOfferWarnings:()=>[]});
 vm.runInContext(admin.slice(admin.indexOf('function getWhatsAppText('),admin.indexOf('function offerTimestamp('))+admin.slice(admin.indexOf('function flightDateClientReady('),admin.indexOf('function syncHomeFieldsToCreateSurface(')),ui);
 for(const flightDateSafety of [undefined,{ready:false,checkedOn:new Date().toISOString().slice(0,10)},{ready:true,checkedOn:'2020-01-01'}]){offer={...offer,flightDateSafety};assert.equal(ui.offerReadyToSend(offer),false);assert.equal(ui.getWhatsAppText('QA'),'');}
 offer.flightDateSafety={ready:true,checkedOn:new Date().toISOString().slice(0,10)};assert.equal(ui.offerReadyToSend(offer),true);assert(ui.getWhatsAppText('QA').includes('/offer/QA'));
});

test('only the reserved generated warning prefix is recomputed; operator text survives',()=>{
 context.uniqueWarnings=values=>[...new Set(values)];
 const offer=valid();offer.validationWarnings=['Operator note mentioning [FLIGHT_DATE_SAFETY] remains','[WARNING] [FLIGHT_DATE_SAFETY] obsolete generated finding'];
 const warnings=Array.from(context.flightSafetyWarnings(offer));
 assert.deepEqual(warnings,['Operator note mentioning [FLIGHT_DATE_SAFETY] remains']);
});
test('review F1: every renderer date alias participates and conflicts fail closed',()=>{
 for(const key of ['date','departure','departureDate','arrival','arrivalDate']){
  const offer=valid(),segment=offer.flights[0].outboundSegments[0];
  Object.assign(segment,{date:'2026-11-16',departureDate:'2026-11-16',arrivalDate:'2026-11-16'});
  assert.equal(check(offer).ready,true);
  segment[key]='2026-11-17T10:30';const before=JSON.stringify(offer);assert.equal(check(offer).ready,false,key);assert.equal(JSON.stringify(offer),before);
 }
 const overnight=valid();overnight.flights[0].outboundSegments[0].arrival='2026-11-17T01:30';assert.equal(check(overnight).ready,true);
});
test('review F2: contradictory dates/years in one field fail closed; repeated identical dates remain valid',()=>{
 for(const value of ['2026-11-16T10:30 / 2020-11-16T10:30','16 November 2026 / 17 November 2026','16.11.2026 (2020)','16–20 November 2026','16.11.2026 / 16.11']){
  const offer=valid();offer.flights[0].outboundSegments[0].departure=value;assert.equal(check(offer).ready,false,value);
 }
 const offer=valid();offer.flights[0].outboundSegments[0].departure='2026-11-16 / 2026-11-16';assert.equal(check(offer).ready,true);
});
test('review F3: ISO periods use ISO semantics and still reject elapsed dates and invalid calendar days',()=>{
 const offer=valid();offer.travelDates='2026-11-16 - 2026-11-20';assert.equal(check(offer).ready,true);
 offer.travelDates='2020-11-16 - 2020-11-20';for(const segment of [...offer.flights[0].outboundSegments,...offer.flights[0].inboundSegments]){segment.departure=segment.departure.replace('2026','2020');segment.arrival=segment.arrival.replace('2026','2020');}assert.equal(check(offer).ready,false);
 const invalid=valid();invalid.travelDates='2026-02-30 - 2026-11-20';assert.equal(check(invalid).ready,false);
});
