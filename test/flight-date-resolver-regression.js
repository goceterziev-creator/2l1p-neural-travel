"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), Module = require('node:module'), vm = require('node:vm');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'aya-date-resolver-'));
for (const [key, file] of Object.entries({DATA_DIR:'.', DB_FILE:'db.json', AIRPORT_CONFIG_FILE:'airports.json', OCR_PATTERN_CONFIG_FILE:'ocr.json'})) process.env[key] = path.join(temp, file);
process.on('exit', () => fs.rmSync(temp, {recursive:true, force:true}));
const filename = path.resolve(__dirname, '../server.js'), harness = new Module(filename, module);
harness.filename = filename; harness.paths = Module._nodeModulePaths(path.dirname(filename));
harness._compile(fs.readFileSync(filename, 'utf8') + '\nmodule.exports.resolverTest={flightDateSafety,offerWithResolvedFlightDates,normalizeOffer,normalizeUniversalSegment,renderOfferHtml,renderGt63PrintOfferHtml};', filename);
const api = harness.exports.resolverTest;
const now = new Date('2026-11-13T12:00:00Z');
const fixture = () => ({id:'SYNTHETIC-RESOLVER', clientName:'QA ONLY', destination:'Rome', travelDates:'16.11.2026 - 20.11.2026', status:'draft', guests:'2 adults', markupPercent:5,
 flights:[{route:'SOF -> CIA / CIA -> SOF',price:200,outboundSegments:[{from:'SOF',to:'CIA',departure:'Mon, 16 Nov 1:25 PM',arrival:'Mon, 16 Nov 2:15 PM',flightNumber:'FR625'}],inboundSegments:[{from:'CIA',to:'SOF',departure:'Fri, 20 Nov 12:25 PM',arrival:'Fri, 20 Nov 3:10 PM',flightNumber:'FR626'}]}],
 hotels:[{id:'test-a',name:'Synthetic Alpha',price:100,selected:true,images:['https://example.test/a.jpg'],occupancy:{adults:2,children:0,rooms:1,confirmed:true}},{id:'test-b',name:'Synthetic Beta',price:140,selected:false,images:['https://example.test/b.jpg'],occupancy:{adults:2,children:0,rooms:1,confirmed:true}}]});
const check = offer => api.flightDateSafety(offer, now);
test('FR625/FR626 resolve uniquely to 2026, preserve AM/PM and leave raw evidence unchanged', () => {
 const offer=fixture(), before=JSON.stringify(offer); assert.equal(check(offer).ready,true);
 const projected=api.offerWithResolvedFlightDates(offer,now);
 assert.equal(projected.flights[0].outboundSegments[0].departure,'2026-11-16T13:25');
 assert.equal(projected.flights[0].outboundSegments[0].arrival,'2026-11-16T14:15');
 assert.equal(projected.flights[0].inboundSegments[0].departure,'2026-11-20T12:25');
 assert.equal(projected.flights[0].inboundSegments[0].arrival,'2026-11-20T15:10');
 assert.equal(JSON.stringify(offer),before);
 for(const key of ['hotels','markupPercent','status','travelDates']) assert.deepEqual(projected[key],offer[key]);
});
test('only one calendar year inside the real period is accepted; never use current year alone', () => {
 for(const departure of ['16.11 13:25','16 November 13:25','November 16 13:25']) {const offer=fixture();offer.flights[0].outboundSegments[0].departure=departure;assert.equal(check(offer).ready,true,departure);}
 for(const period of ['', '16.11 - 20.11', '16.11.2026 - 20.11.2027','17.11.2026 - 20.11.2026','30.02.2026 - 20.11.2026','16.11.2026 - 20.11.2026 or 2027']) {const offer=fixture();offer.travelDates=period;assert.equal(check(offer).ready,false,period);}
 const future=fixture();future.travelDates='16.11.2027 - 20.11.2027';assert.equal(api.offerWithResolvedFlightDates(future,now).flights[0].outboundSegments[0].departure,'2027-11-16T13:25');
});
test('explicit old/short years, conflicting aliases and ambiguous strings stay blocked', () => {
 for(const value of ['2020-11-16T13:25','16 Nov 2020 1:25 PM','16.11.20 13:25','16 Nov 26 13:25','31 Nov 13:25','16 Nov / 17 Nov','16 Nov 2026 / 16 Nov','16 Nov 2026 (2020)','16 Nov (2020)','16 Nov 20260 13:25','16.11.20260 13:25']) {
  const offer=fixture();offer.flights[0].outboundSegments[0].departure=value; assert.equal(check(offer).ready,false,value); assert.equal(api.offerWithResolvedFlightDates(offer,now),offer);
 }
 const offer=fixture();offer.flights[0].outboundSegments[0].departureDate='2026-11-17';assert.equal(check(offer).ready,false);
});
test('December to January resolves each segment against both explicit period years', () => {
 const offer=fixture();offer.travelDates='30.12.2026 - 03.01.2027';
 Object.assign(offer.flights[0].outboundSegments[0],{departure:'30 Dec 11:30 PM',arrival:'31 Dec 1:30 AM'});
 Object.assign(offer.flights[0].inboundSegments[0],{departure:'3 Jan 12:25 PM',arrival:'3 Jan 3:10 PM'});
 assert.equal(check(offer).ready,true);const result=api.offerWithResolvedFlightDates(offer,now);
 assert.equal(result.flights[0].outboundSegments[0].arrival,'2026-12-31T01:30');assert.equal(result.flights[0].inboundSegments[0].departure,'2027-01-03T12:25');
});
test('resolved dates still expire at UTC midnight and cannot bypass through proposal aliases', () => {
 const offer=fixture();assert.equal(api.flightDateSafety(offer,new Date('2026-11-17T00:00:00Z')).ready,false);
 offer.proposalInput={flight:{outboundSegments:[{departure:'2020-11-16',arrival:'2020-11-16'}]}};assert.equal(check(offer).ready,false);
});
test('Smart Import -> admin edit -> save/reload preserves raw dates and resolved verdict', () => {
 const source=fs.readFileSync(path.resolve(__dirname,'../public/admin.js'),'utf8'),ctx=vm.createContext({});
 vm.runInContext(source.slice(source.indexOf('function isNoisyFlightDisplay('),source.indexOf('function destinationAlias(')),ctx);
 const offer=fixture();offer.flights[0].outboundSegments=[api.normalizeUniversalSegment({from:'SOF',to:'CIA',departureDate:'Mon, 16 Nov',departureTime:'1:25 PM',arrivalDate:'Mon, 16 Nov',arrivalTime:'2:15 PM',flightNumber:'FR625'})];
 offer.flights=JSON.parse(JSON.stringify(offer.flights.map(f=>ctx.normalizeFlightFields(f))));
 const saved=api.normalizeOffer(offer),reloaded=JSON.parse(JSON.stringify(saved));assert.equal(check(reloaded).ready,true);
 assert.equal(reloaded.flights[0].outboundSegments[0].departure,'Mon, 16 Nov 1:25 PM');assert.deepEqual(reloaded.hotels,JSON.parse(JSON.stringify(saved.hotels)));assert.equal(reloaded.finalPrice,315);
});
test('real HTML and print renderer use verified dates, with hotel selection and pricing preserved', async () => {
 const offer=fixture(),before=JSON.stringify(offer),html=await api.renderOfferHtml(offer),print=api.renderGt63PrintOfferHtml(offer);
 assert(html.includes('16 ноември 2026'));assert(html.includes('13:25'));assert(html.includes('20 ноември 2026'));assert(html.includes('15:10'));assert(print.includes('16 ноември 2026'));assert(print.includes('13:25'));assert(print.includes('20 ноември 2026'));assert(print.includes('15:10'));
 assert(print.includes('Synthetic Alpha'));assert.equal(JSON.stringify(offer),before);
});

test('saved proposal renderer and print share the verified dates', async () => {
 const offer=fixture();offer.proposalInput=require('../gt63-core/legacy-offer-print-input').buildLegacyOfferPrintInput(offer);offer.proposalTemplate={selected:'multi-hotel'};
 const before=JSON.stringify(offer),html=await api.renderOfferHtml(offer),print=api.renderGt63PrintOfferHtml(offer);
 for(const rendered of [html,print]){assert(rendered.includes('2026'));assert(rendered.includes('13:25'));assert(!rendered.includes('Mon, 16 Nov'));}
 assert.equal(JSON.stringify(offer),before);
});
