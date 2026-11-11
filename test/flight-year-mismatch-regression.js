"use strict";
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),Module=require('node:module'),vm=require('node:vm');
const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'aya-flight-year-'));
for(const [key,file]of Object.entries({DATA_DIR:'.',DB_FILE:'db.json',AIRPORT_CONFIG_FILE:'airports.json',OCR_PATTERN_CONFIG_FILE:'ocr.json'}))process.env[key]=path.join(scratch,file);
process.on('exit',()=>fs.rmSync(scratch,{recursive:true,force:true}));
const filename=path.resolve(__dirname,'../server.js'),harness=new Module(filename,module);harness.filename=filename;harness.paths=Module._nodeModulePaths(path.dirname(filename));
harness._compile(fs.readFileSync(filename,'utf8')+'\nmodule.exports.yearTest={normalizeOffer,normalizeUniversalSegment,normalizeStoredFlightSegments,buildFlightDateSourceTrace};',filename);
const api=harness.exports.yearTest;
const adminSource=fs.readFileSync(path.resolve(__dirname,'../public/admin.js'),'utf8'),admin=vm.createContext({});
vm.runInContext(adminSource.slice(adminSource.indexOf('function isNoisyFlightDisplay('),adminSource.indexOf('function destinationAlias(')),admin);
const {buildLegacyOfferPrintInput}=require('../gt63-core/legacy-offer-print-input');
const {renderPrintProposal}=require('../gt63-core/renderers/print-presentation');
function body(year,kind='iso'){
 const date=day=>kind==='iso'?`${year}-11-${day}T10:30`:kind==='numeric'?`${day}.11.${year} 10:30`:kind==='monthFirst'?`November ${day}, ${year} 10:30`:kind==='bg'?`${day} ноември ${year} 10:30`:`${day} November ${year} 10:30`;
 return {id:'SYNTHETIC-YEAR-QA',destination:'Рим',travelDates:'16.11 - 20.11.2026',guests:'2 adults',markupPercent:5,
 flights:[{route:'SOF -> CIA / CIA -> SOF',price:200,outboundSegments:[{from:'SOF',to:'CIA',departure:date('16'),arrival:date('16'),airline:'Buzz',flightNumber:'FR 625'}],inboundSegments:[{from:'CIA',to:'SOF',departure:date('20'),arrival:date('20'),airline:'Malta Air',flightNumber:'FR 626'}]}],
 hotels:[{id:'qa-hotel',name:'Synthetic',price:100,selected:true,images:['https://example.test/test.jpg'],occupancy:{adults:2,children:0,rooms:1,confirmed:true}}]};
}
const mismatch=offer=>offer.validationWarnings.filter(w=>w.includes('Периодът в офертата'));
test('reported 2020 survives QA comparison and triggers mismatch without rewriting saved flight dates',()=>{
 for(const format of ['iso','numeric','words','monthFirst','bg']){
  const input=body(2020,format),before=JSON.stringify(input),saved=api.normalizeOffer(input);
  assert(mismatch(saved).length>0,`2020 mismatch must remain visible (${format})`);
  assert.equal(saved.flightDateSourceTrace.keys.outbound,'2020-11-16');
  assert.equal(saved.flightDateSourceTrace.keys.inbound,'2020-11-20');
  assert.equal(saved.flights[0].outboundSegments[0].departure,input.flights[0].outboundSegments[0].departure);
  assert.equal(JSON.stringify(input),before);
 }
});
test('valid 2026 and genuinely yearless segments retain existing date contract',()=>{
 for(const format of ['iso','numeric','words','monthFirst','bg'])assert.equal(mismatch(api.normalizeOffer(body(2026,format))).length,0);
 const input=body(2026,'numeric');for(const leg of ['outboundSegments','inboundSegments'])for(const segment of input.flights[0][leg]){segment.departure=segment.departure.replace('.2026','');segment.arrival=segment.arrival.replace('.2026','');}
 const saved=api.normalizeOffer(input);assert.equal(mismatch(saved).length,0);assert(!saved.flights[0].outboundSegments[0].departure.includes('2026'));
});
test('synthetic Smart Import date passes through normalization/save/adapter/PDF without 2026 -> 2020 conversion',()=>{
 for(const year of [2026,2020]){
  const segment=api.normalizeUniversalSegment({from:'SOF',to:'CIA',departureDate:`${year}-11-16`,departureTime:'10:30',arrivalDate:`${year}-11-16`,arrivalTime:'11:30',flightNumber:'FR 625'});
  const input=body(year);input.flights[0].outboundSegments=api.normalizeStoredFlightSegments([segment]);
  input.flights=input.flights.map(f=>JSON.parse(JSON.stringify(admin.normalizeFlightFields(f))));
  const saved=api.normalizeOffer(input),before=JSON.stringify(saved),adapter=buildLegacyOfferPrintInput(saved),pdf=renderPrintProposal(adapter);
  assert.equal(saved.flights[0].outboundSegments[0].departure,`${year}-11-16 10:30`);
  assert.equal(adapter.flight.outboundSegments[0].departure,`${year}-11-16 10:30`);
  assert(pdf.includes(`ноември ${year}`));assert.equal(JSON.stringify(saved),before);
  assert.equal(saved.hotels[0].id,'qa-hotel');assert.deepEqual(saved.hotels[0].images,input.hotels[0].images);assert.equal(saved.hotels[0].selected,true);assert.equal(saved.finalPrice,315);
 }
});
