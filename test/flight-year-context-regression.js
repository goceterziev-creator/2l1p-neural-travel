'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const api=require('../public/flight-data-consistency');
const fixture=()=>({price:7173.89,baggage:'UNKNOWN',outboundSegments:[{from:'SOF',to:'IST',flightNumber:'TK1030',departure:'21-11T21:45',arrival:'22-11T00:15'},{from:'IST',to:'AUH',flightNumber:'TK866',departure:'22-11T01:15',arrival:'22-11T06:45'}],inboundSegments:[{from:'AUH',to:'IST',flightNumber:'TK869',departure:'29-11T02:35',arrival:'29-11T07:00'},{from:'IST',to:'SOF',flightNumber:'TK1027',departure:'29-11T08:20',arrival:'29-11T08:40'}]});
const context={now:new Date('2026-11-19T12:00:00Z'),verifiedTravelDates:'21.11.2026 - 29.11.2026'};
test('21–29 November, all four segments, midnight, raw evidence and non-date data',()=>{const f=fixture(),before=JSON.stringify(f),r=api.resolveYearContext(f,context);assert(r.ok,r.reason);assert.equal(r.flight.outboundSegments[0].arrival,'2026-11-22T00:15');assert.equal(r.flight.inboundSegments[1].departure,'2026-11-29T08:20');assert.equal(r.flight.price,f.price);assert.equal(r.flight.baggage,'UNKNOWN');assert.equal(r.flight.dateResolution.evidence[0].raw,'21-11T21:45');assert(r.flight.dateResolution.evidence.every(e=>e.provenance==='CONTEXT_RESOLVED_YEAR'));assert.equal(JSON.stringify(f),before);assert(api.inspect(r.flight).ok);});
test('explicit 2027 stays explicit, 2026 context cannot replace it',()=>{const f=fixture();for(const leg of ['outboundSegments','inboundSegments'])for(const s of f[leg])for(const side of ['departure','arrival']){const [d,m]=s[side].slice(0,5).split('-');s[side]=`2027-${m}-${d}${s[side].slice(5)}`;}const r=api.resolveYearContext(f,{...context,verifiedTravelDates:'21.11.2027 - 29.11.2027'});assert(r.ok,r.reason);assert(r.flight.dateResolution.evidence.every(e=>e.provenance==='EXPLICIT_SOURCE_YEAR'));assert.equal(api.resolveYearContext(f,context).ok,false);});
test('past dates and historical explicit dates remain unresolved',()=>{assert.equal(api.resolveYearContext(fixture(),{now:new Date('2026-12-01')} ).ok,false);const f=fixture();f.outboundSegments[0].departure='2020-11-21T21:45';assert.equal(api.resolveYearContext(f,context).ok,false);});
test('rollover requires full period and resolves both years',()=>{const f={outboundSegments:[{from:'SOF',to:'IST',departure:'12-31T23:30',arrival:'01-01T01:30'}]};assert.equal(api.resolveYearContext(f,{now:new Date('2026-12-20')}).ok,false);const r=api.resolveYearContext(f,{now:new Date('2026-12-20'),verifiedTravelDates:'31.12.2026 - 02.01.2027'});assert(r.ok,r.reason);assert.equal(r.flight.outboundSegments[0].arrival,'2027-01-01T01:30');});
test('ambiguous month/day, invalid period, aliases and summary conflicts stay manual',()=>{for(const change of [f=>f.outboundSegments[0].departure='05-06T21:45',f=>f.outboundSegments[0].departureDate='2027-11-21',f=>f.departure='21.11.2027']){const f=fixture();change(f);assert.equal(api.resolveYearContext(f,context).ok,false);}assert.equal(api.resolveYearContext(fixture(),{...context,verifiedTravelDates:'21.11 - 29.11'}).ok,false);});
test('future current year without context, no rollover or ambiguous numeric guessing',()=>{assert(api.resolveYearContext(fixture(),{now:context.now}).ok);const f=fixture();f.outboundSegments[0].departure='05-06T21:45';assert.equal(api.resolveYearContext(f,{now:new Date('2026-01-01')}).ok,false);});
test('UI approval and cancellation do not mutate source',async()=>{const source=fs.readFileSync(require.resolve('../public/admin.js'),'utf8');const f=fixture(),before=JSON.stringify(f);for(const approved of [false,true]){const ctx=vm.createContext({globalThis:{AYAFlightDataConsistency:api},$:()=>({value:context.verifiedTravelDates}),confirm:()=>approved});vm.runInContext(source.slice(source.indexOf('async function reviewFlightDateConsistencyUI('),source.indexOf('function reviewFlightDateConsistency(')),ctx);const result=await ctx.reviewFlightDateConsistencyUI(f);assert.equal(Boolean(result),approved);assert.equal(JSON.stringify(f),before);}});

test('explicit source year precedes current year and conflicting copies stay manual',()=>{const f=fixture();f.inboundSegments[1].arrival='2027-11-29T08:40';const r=api.resolveYearContext(f,{now:context.now});assert(r.ok,r.reason);assert.equal(r.flight.outboundSegments[0].departure,'2027-11-21T21:45');assert.equal(r.flight.dateResolution.evidence[0].basis,'explicitSourceYear');const bad=fixture();bad.segments=JSON.parse(JSON.stringify([...bad.outboundSegments,...bad.inboundSegments]));bad.segments[0].departure='2020-11-21T21:45';assert.equal(api.resolveYearContext(bad,context).ok,false);});
test('connection chronology and exact requested 21-11T16:00 format',()=>{const f=fixture();f.outboundSegments[0].departure='21-11T16:00';assert.equal(api.resolveYearContext(f,context).flight.outboundSegments[0].departure,'2026-11-21T16:00');f.outboundSegments[1].departure='22-11T00:05';assert.equal(api.resolveYearContext(f,context).ok,false);});

test('normal save/reopen retains provenance; READY/SENT/BOOKED remain safety gated',()=>{
 const os=require('node:os'),path=require('node:path'),Module=require('node:module');
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'aya-year-v2-'));
 for(const [key,file] of Object.entries({DATA_DIR:'.',DB_FILE:'db.json',AIRPORT_CONFIG_FILE:'airports.json',OCR_PATTERN_CONFIG_FILE:'ocr.json'}))process.env[key]=path.join(temp,file);
 try {
  const filename=path.resolve(__dirname,'../server.js'),harness=new Module(filename,module);harness.filename=filename;harness.paths=Module._nodeModulePaths(path.dirname(filename));
  harness._compile(fs.readFileSync(filename,'utf8')+'\nmodule.exports.yearTest={normalizeOffer,assertClientStatusSafety,flightDateSafety};',filename);
  const server=harness.exports.yearTest,r=api.resolveYearContext(fixture(),context);
  const offer={clientName:'SYNTHETIC QA',destination:'Abu Dhabi',guests:'2 adults',travelDates:context.verifiedTravelDates,status:'draft',flights:[r.flight],hotels:[]};
  const saved=JSON.parse(JSON.stringify(server.normalizeOffer(offer)));
  assert.deepEqual(saved.flights[0].dateResolution,r.flight.dateResolution);
  assert.equal(server.flightDateSafety(saved,context.now).ready,true);
  const before=JSON.stringify(saved);for(const status of ['ready','sent','booked']) {const invalid=JSON.parse(JSON.stringify(saved));invalid.status=status;invalid.flights[0].outboundSegments[0].departure='2020-11-21T21:45';const snapshot=JSON.stringify(invalid);assert.throws(()=>server.assertClientStatusSafety(invalid),e=>e.status===422&&e.code==='AYA_FLIGHT_DATE_BLOCKED');assert.equal(JSON.stringify(invalid),snapshot);}
  const corrected=api.resolve(r.flight,'manual',{outbound:r.flight.outboundSegments.map(segment=>({departure:segment.departure.slice(0,10).replace('2026','2027'),arrival:segment.arrival.slice(0,10).replace('2026','2027')})),inbound:r.flight.inboundSegments.map(segment=>({departure:segment.departure.slice(0,10).replace('2026','2027'),arrival:segment.arrival.slice(0,10).replace('2026','2027')}))});
  const reopened=JSON.parse(JSON.stringify(server.normalizeOffer({...offer,flights:[corrected]})));
  assert.equal(reopened.flights[0].outboundSegments[0].departure,'2027-11-21T21:45');
  assert.equal(reopened.flights[0].dateResolution.status,'INVALIDATED');
  assert.deepEqual(reopened.flights[0].dateResolution.evidence,[]);
  assert.equal(reopened.flights[0].dateResolution.supersededEvidence[0].resolved,'2026-11-21');
  assert.deepEqual(reopened.flights[0].dateResolution.rawDates,r.flight.dateResolution.rawDates);
  assert.equal(JSON.stringify(saved),before);
 } finally {fs.rmSync(temp,{recursive:true,force:true});}
});

test('yearless combined copies and yearless summaries cannot be silently overwritten',()=>{const f=fixture();f.segments=JSON.parse(JSON.stringify([...f.outboundSegments,...f.inboundSegments]));f.segments[0].departure='23-11T21:45';assert.equal(api.resolveYearContext(f,context).ok,false);const g=fixture();g.departure='SOF -> AUH, 11-23T21:45 - 11-22T06:45';assert.equal(api.resolveYearContext(g,context).ok,false);g.departure='SOF -> AUH, 11-21T21:45 - 11-22T06:45';assert(api.resolveYearContext(g,context).ok);});

test('F1: explicit aliases in all raw copies force manual review without mutation',()=>{
 for(const representation of ['nested','combined'])for(const alias of ['date','departureDate','arrivalDate']){
  const f=fixture();f.dateResolution={version:2,evidence:[],rawDates:{existing:'retained'}};
  const list=JSON.parse(JSON.stringify(representation==='nested'?f.outboundSegments:[...f.outboundSegments,...f.inboundSegments]));
  list[0][alias]=alias==='arrivalDate'?'2027-11-22':'2027-11-21';
  if(representation==='nested')f.outbound={segments:list};else f.segments=list;
  const before=JSON.stringify(f),r=api.resolveYearContext(f,context);assert.equal(r.ok,false,`${representation}.${alias}`);assert.equal(JSON.stringify(f),before);
 }
 const compatible=fixture();compatible.outbound={segments:JSON.parse(JSON.stringify(compatible.outboundSegments))};compatible.outbound.segments[0].departureDate='2026-11-21';assert(api.resolveYearContext(compatible,context).ok);
});
test('F3: recognized yearless inputs require resolution; explicit dates retain the existing path',async()=>{
 const f={outboundSegments:[{from:'SOF',to:'IST',departure:'21 Nov 21:45',arrival:'22 Nov 00:15'}]};assert(api.inspect(f).ok);assert(api.needsYearResolution(f));
 const source=fs.readFileSync(require.resolve('../public/admin.js'),'utf8');
 for(const approved of [false,true]){let confirmations=0;const ctx=vm.createContext({globalThis:{AYAFlightDataConsistency:api},$:()=>({value:context.verifiedTravelDates}),confirm:()=>{confirmations++;return approved;}});vm.runInContext(source.slice(source.indexOf('async function reviewFlightDateConsistencyUI('),source.indexOf('function reviewFlightDateConsistency(')),ctx);const before=JSON.stringify(f),result=await ctx.reviewFlightDateConsistencyUI(f);assert.equal(confirmations,1);assert.equal(JSON.stringify(f),before);if(approved){assert.equal(result.dateResolution.evidence[0].raw,'21 Nov 21:45');assert.equal(result.dateResolution.evidence[0].provenance,'CONTEXT_RESOLVED_YEAR');}else assert.equal(result,null);}
 const explicit=api.resolveYearContext(f,context).flight;assert.equal(api.needsYearResolution(explicit),false);
});
