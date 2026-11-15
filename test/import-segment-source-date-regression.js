'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),Module=require('node:module'),vm=require('node:vm');
const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'aya-source-date-'));
for(const [key,file] of Object.entries({DATA_DIR:'.',DB_FILE:'db.json',AIRPORT_CONFIG_FILE:'airports.json',OCR_PATTERN_CONFIG_FILE:'ocr.json',REGRESSION_LIBRARY_DIR:'library'}))process.env[key]=path.join(scratch,file);
process.on('exit',()=>fs.rmSync(scratch,{recursive:true,force:true}));
const filename=path.resolve(__dirname,'../server.js'),source=fs.readFileSync(filename,'utf8'),harness=new Module(filename,module);
harness.filename=filename;harness.paths=Module._nodeModulePaths(path.dirname(filename));
harness._compile(source+'\nmodule.exports.sourceDateTest={normalizeVisionSegment,normalizeUniversalSegment,universalFlightToOfferFlight,flightDateSafety,offerWithResolvedFlightDates,normalizeOffer,renderOfferHtml,renderGt63PrintOfferHtml,extractFlightWithGeminiVision,extractFlightWithOpenAiVision,extractUniversalTravelWithGemini};',filename);
const server=harness.exports.sourceDateTest,c=require('../public/flight-data-consistency'),now=new Date('2026-11-15T12:00:00Z');
const raw=()=>({outbound:{segments:[{from:'SOF',to:'IST',flightNumber:'TK1030',departure:'21:45',departureDate:'21 Nov',departureTime:'21:45',arrival:'00:15',arrivalDate:'22 Nov',arrivalTime:'00:15'},{from:'IST',to:'AUH',flightNumber:'TK866',departure:'01:15',departureDate:'22 Nov',departureTime:'01:15',arrival:'06:45',arrivalDate:'22 Nov',arrivalTime:'06:45'}]},inbound:{segments:[{from:'AUH',to:'IST',flightNumber:'TK869',departure:'02:35',departureDate:'29 Nov',departureTime:'02:35',arrival:'07:00',arrivalDate:'29 Nov',arrivalTime:'07:00'},{from:'IST',to:'SOF',flightNumber:'TK1027',departure:'08:20',departureDate:'29 Nov',departureTime:'08:20',arrival:'08:40',arrivalDate:'29 Nov',arrivalTime:'08:40'}]},price:{amount:7173.89,currency:'EUR'}});
const flight=()=>server.universalFlightToOfferFlight(raw());
const offer=()=>({id:'SYNTHETIC-SOURCE-DATE',clientName:'QA ONLY',destination:'Abu Dhabi',travelDates:'21.11.2026 - 29.11.2026',guests:'2 adults, 2 children',status:'draft',markupPercent:5,flights:[flight()],hotels:[{id:'qa-a',name:'Synthetic Hotel',selected:true,price:2288.34,room:'Test room',images:[],occupancy:{adults:2,children:2,rooms:1,confirmed:true}}]});
test('all actual screenshot legs keep separate source days when canonical values contain only clocks',()=>{
 const input=raw(),before=JSON.stringify(input),f=server.universalFlightToOfferFlight(input);
 assert.deepEqual(f.outboundSegments.map(s=>[s.departure,s.arrival]),[['21 Nov 21:45','22 Nov 00:15'],['22 Nov 01:15','22 Nov 06:45']]);
 assert.deepEqual(f.inboundSegments.map(s=>[s.departure,s.arrival]),[['29 Nov 02:35','29 Nov 07:00'],['29 Nov 08:20','29 Nov 08:40']]);
 assert.equal(c.inspect(f).ok,true);assert.equal(f.price,7173.89);assert.equal(JSON.stringify(input),before);
});
test('Vision and Universal normalizers preserve source dates, explicit old years and canonical datetime inputs',()=>{
 for(const normalize of [server.normalizeVisionSegment,server.normalizeUniversalSegment]){
  assert.equal(normalize(raw().outbound.segments[0]).arrival,'22 Nov 00:15');
  assert.equal(normalize({departure:'21 Nov',departureTime:'21:45'}).departure,'21 Nov 21:45');
  assert.equal(normalize({departureDate:'21 Nov 2026 21:45',departureTime:'21:45'}).departure,'21 Nov 2026 21:45');
  assert.equal(normalize({from:'SOF',to:'IST',departure:'2020-11-21T21:45',arrival:'2020-11-22T00:15'}).departure,'2020-11-21T21:45');
  assert.equal(normalize({from:'SOF',to:'IST',departure:'21 Nov 21:45',departureDate:'21 Nov 2026',arrival:'22 Nov 00:15'}).departure,'21 Nov 2026 21:45');
 }
});
test('existing period resolver supplies2026 uniquely without rewriting raw screenshot evidence or other offer data',()=>{
 const o=offer(),before=JSON.stringify(o);assert.equal(server.flightDateSafety(o,now).ready,true);
 const resolved=server.offerWithResolvedFlightDates(o,now);
 assert.equal(resolved.flights[0].outboundSegments[0].departure,'2026-11-21T21:45');assert.equal(resolved.flights[0].outboundSegments[0].arrival,'2026-11-22T00:15');
 assert.equal(resolved.flights[0].outboundSegments[1].departure,'2026-11-22T01:15');assert.equal(resolved.flights[0].inboundSegments[1].arrival,'2026-11-29T08:40');
 assert.equal(JSON.stringify(o),before);for(const key of ['hotels','markupPercent','status','travelDates'])assert.deepEqual(resolved[key],o[key]);
 const nextYear=offer();nextYear.travelDates='21.11.2027 - 29.11.2027';assert.equal(server.offerWithResolvedFlightDates(nextYear,now).flights[0].outboundSegments[0].departure,'2027-11-21T21:45');
});
test('period ambiguity, missing day, explicit2020, invalid dates and conflicting source aliases remain blocked',()=>{
 for(const period of ['', '21.11 - 29.11','21.11.2026 - 29.11.2027','23.11.2026 - 29.11.2026','21.11.2025 - 29.11.2025'])assert.equal(server.flightDateSafety({...offer(),travelDates:period},now).ready,false,period);
 const old=offer();old.flights[0].outboundSegments[0].departure='2020-11-21T21:45';assert.equal(server.flightDateSafety(old,now).ready,false);assert.equal(old.flights[0].outboundSegments[0].departure,'2020-11-21T21:45');
 for(const segment of [{departure:'21:45',departureDate:'31 Nov'},{departure:'2020-11-21T21:45',departureDate:'21 Nov 2026'},{departure:'21:45',departureDate:'21 Nov',date:'22 Nov'}])assert.throws(()=>server.normalizeVisionSegment(segment));
 const clock=offer();clock.flights[0].outboundSegments[0].departure='21:45';assert.equal(server.flightDateSafety(clock,now).ready,false);
 assert.throws(()=>c.segmentDateTime({departure:'21:45',departureTime:'22:45',departureDate:'21 Nov'},'departure'));
 assert.equal(c.segmentDateTime({departure:'21:45'},'departure'),'21:45');assert.equal(c.segmentDateTime({date:'21 Nov',arrival:'00:15'},'arrival'),'00:15');
});
test('December to January uses the explicit period, never the current year or same-day clock assumptions',()=>{
 const o=offer();o.travelDates='31.12.2026 - 03.01.2027';o.flights=[{outboundSegments:[{from:'SOF',to:'IST',departure:'31 Dec 23:30',arrival:'1 Jan 00:15'}],inboundSegments:[{from:'IST',to:'SOF',departure:'3 Jan 08:20',arrival:'3 Jan 08:40'}]}];
 assert.equal(server.flightDateSafety(o,now).ready,true);const r=server.offerWithResolvedFlightDates(o,now);assert.equal(r.flights[0].outboundSegments[0].arrival,'2027-01-01T00:15');
});
test('MANUAL explicitly repairs clock-only segments on a copy, preserves clocks/identities/metadata; ambiguous raw dates still fail closed',()=>{
 const f=flight();for(const s of [...f.outboundSegments,...f.inboundSegments,...f.segments]){s.departure=s.departure.match(/\d+:\d+/)[0];s.arrival=s.arrival.match(/\d+:\d+/)[0];}
 const before=JSON.stringify(f),reviewed={outbound:[{departure:'2026-11-21',arrival:'2026-11-22'},{departure:'2026-11-22',arrival:'2026-11-22'}],inbound:[{departure:'2026-11-29',arrival:'2026-11-29'},{departure:'2026-11-29',arrival:'2026-11-29'}]};
 const result=c.resolve(f,'manual',reviewed);assert.equal(c.inspect(result).ok,true);assert.equal(result.outboundSegments[0].arrival,'2026-11-22T00:15');assert.equal(result.inboundSegments[1].flightNumber,'TK1027');assert.equal(result.price,f.price);assert.equal(JSON.stringify(f),before);
 const bad=structuredClone(f);bad.outboundSegments[0].departure='21 Nov / 22 Nov 21:45';assert.throws(()=>c.resolve(bad,'manual',reviewed));
 for(const clock of ['99:45','21:99','13:45 PM']){const bad=structuredClone(f);bad.outboundSegments[0].departure=clock;assert.throws(()=>c.resolve(bad,'manual',reviewed));}
 const admin=fs.readFileSync(path.resolve(__dirname,'../public/admin.js'),'utf8'),ctx=vm.createContext({AYAFlightDataConsistency:c,prompt:()=>null,confirm:()=>{throw Error('Cancel must not confirm');},alert:()=>{}});
 vm.runInContext(admin.slice(admin.indexOf('function reviewFlightDateConsistency('),admin.indexOf('function syncPrimaryFlightDateFields(')),ctx);assert.equal(ctx.reviewFlightDateConsistency(f),null);assert.equal(JSON.stringify(f),before);
});
test('normalized save/reload plus real HTML and print renderer retain the same resolved four-leg dates and price',async()=>{
 const saved=server.normalizeOffer(offer()),reloaded=JSON.parse(JSON.stringify(saved)),before=JSON.stringify(reloaded);
 const html=await server.renderOfferHtml(reloaded),print=server.renderGt63PrintOfferHtml(reloaded);
 for(const text of [html,print])for(const value of ['2026','TK1030','TK866','TK869','TK1027','21:45','00:15','01:15','06:45','02:35','07:00','08:20','08:40'])assert(text.includes(value),value);
 assert.equal(JSON.stringify(reloaded),before);assert.equal(Math.round(saved.finalPrice*100)/100,9935.34);assert.equal(saved.hotels[0].price,2288.34);
});

test('all three AI transports explicitly request per-segment source dates without inventing years (mock transport, not real OCR)',async()=>{
 const originalFetch=global.fetch,previousGemini=process.env.GEMINI_API_KEY,previousOpenAi=process.env.OPENAI_API_KEY,captured=[];
 process.env.GEMINI_API_KEY='LOCAL_SYNTHETIC_KEY';process.env.OPENAI_API_KEY='LOCAL_SYNTHETIC_KEY';
 global.fetch=async(_url,options)=>{captured.push(JSON.stringify(JSON.parse(options.body)));return {ok:false,status:400,json:async()=>({error:{message:'QA_CAPTURE_TERMINAL'}})};};
 try {
  for(const extract of [server.extractFlightWithGeminiVision,server.extractFlightWithOpenAiVision,server.extractUniversalTravelWithGemini]) {
   const before=captured.length;await assert.rejects(()=>extract([]));assert(captured.length>before);
   for(const body of captured.slice(before)){assert(body.includes('Do not return only a clock when its date is visible'));assert(body.includes('never guess the current year'));assert(body.includes('explicit next-day labels'));}
  }
 } finally {global.fetch=originalFetch;if(previousGemini===undefined)delete process.env.GEMINI_API_KEY;else process.env.GEMINI_API_KEY=previousGemini;if(previousOpenAi===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=previousOpenAi;}
});
