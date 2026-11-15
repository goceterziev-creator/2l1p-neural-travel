"use strict";
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm'),path=require('path');
const api=require('../public/flight-data-consistency');
const fixture=()=>({airline:'Buzz + Malta Air',route:'SOF -> CIA / CIA -> SOF',departure:'SOF -> CIA, 2026-11-16T13:25 - 2026-11-16T14:15',arrival:'CIA -> SOF, 2026-11-20T12:25 - 2026-11-20T15:10',price:200,baggage:'TEST baggage',notes:'Operator note',outboundSegments:[{from:'SOF',to:'CIA',departure:'2020-11-16T13:25',arrival:'2020-11-16T14:15',flightNumber:'FR625',airline:'Buzz',duration:'1h50m'}],inboundSegments:[{from:'CIA',to:'SOF',departure:'2020-11-20T12:25',arrival:'2020-11-20T15:10',flightNumber:'FR626',airline:'Malta Air',duration:'1h45m'}]});
function ui(prompts,confirmed=true){const source=fs.readFileSync(path.resolve(__dirname,'../public/admin.js'),'utf8'),messages=[];const ctx=vm.createContext({AYAFlightDataConsistency:api,prompt:message=>{messages.push(message);return prompts.shift()??null;},confirm:message=>{messages.push(message);return confirmed;},alert:message=>messages.push(message)});vm.runInContext(source.slice(source.indexOf('function reviewFlightDateConsistency('),source.indexOf('function syncPrimaryFlightDateFields(')),ctx);return {review:ctx.reviewFlightDateConsistency,messages};}
test('reference summary2026/segments2020 is detected with exact fields, without mutation',()=>{const f=fixture(),before=JSON.stringify(f),a=api.inspect(f);assert(!a.ok);assert.deepEqual(a.conflicts.map(x=>x.path),['departure','arrival']);assert(JSON.stringify(a.conflicts).includes('2020-11-16'));assert(JSON.stringify(a.conflicts).includes('2026-11-16'));assert.equal(JSON.stringify(f),before);});
test('explicit summary choice and final confirmation align both legs while preserving all unrelated flight data',()=>{const f=fixture(),before=JSON.stringify(f),u=ui(['SUMMARY']);const n=u.review(f);assert(api.inspect(n).ok);assert.equal(n.outboundSegments[0].departure,'2026-11-16T13:25');assert.equal(n.inboundSegments[0].arrival,'2026-11-20T15:10');for(const k of ['price','baggage','airline','route','notes'])assert.equal(n[k],f[k]);for(const leg of ['outbound','inbound'])for(const k of ['flightNumber','airline','from','to','duration'])assert.equal(n[leg+'Segments'][0][k],f[leg+'Segments'][0][k]);assert(u.messages.some(x=>x.includes('2020-11-16')));assert(u.messages.some(x=>x.includes('2026-11-16')));assert.equal(JSON.stringify(f),before);});
test('cancel at source choice or final confirmation changes nothing',()=>{for(const u of [ui([]),ui(['SUMMARY'],false)]){const f=fixture(),before=JSON.stringify(f);assert.equal(u.review(f),null);assert.equal(JSON.stringify(f),before);}});
test('explicitly keep historical2020; clean2026 needs no confirmation and remains unchanged',()=>{const old=api.resolve(fixture(),'segments');assert(api.inspect(old).ok);assert(old.departure.includes('2020'));assert.equal(ui([]).review(old).outboundSegments[0].departure,'2020-11-16T13:25');const clean=api.resolve(fixture(),'summary');const u=ui([]);assert.deepEqual(JSON.parse(JSON.stringify(u.review(clean))),clean);assert.equal(u.messages.length,0);});
test('manual explicit dates map outbound/return and overnight arrival independently',()=>{const f=fixture();const n=api.resolve(f,'manual',{outbound:[{departure:'2026-12-31',arrival:'2027-01-01'}],inbound:[{departure:'2027-01-04',arrival:'2027-01-04'}]});assert.equal(n.outboundSegments[0].arrival,'2027-01-01T14:15');assert.equal(n.inboundSegments[0].departure,'2027-01-04T12:25');assert(api.inspect(n).ok);});
test('malformed, missing and contradictory aliases fail closed; no period or current-year inference',()=>{for(const mutate of [f=>f.outboundSegments[0].arrival='',f=>f.outboundSegments=[null],f=>f.outboundSegments='bad',f=>f.outboundSegments[0].departureDate='2026-11-16',f=>f.outboundSegments[0].departure='2026-02-30T13:25']){const f=fixture();mutate(f);assert(!api.inspect(f).ok);assert(api.offerConflicts({flights:[f]}).length);}assert.throws(()=>api.resolve(fixture(),'manual',{outbound:[{departure:'2026-02-30',arrival:'2026-11-16'}]}));const f=fixture();f.departure='16.11';assert(!api.inspect(f).ok);assert.throws(()=>api.resolve(f,'summary'));});
test('all segment representations are synchronized; seconds/zone, unrelated metadata retained',()=>{const f=fixture();f.outboundSegments[0].departure='2020-11-16T13:25:44+02:00';f.outbound={segments:structuredClone(f.outboundSegments)};f.segments=structuredClone([...f.outboundSegments,...f.inboundSegments]);const n=api.resolve(f,'summary');assert.equal(n.outboundSegments[0].departure,'2026-11-16T13:25:44+02:00');assert.equal(n.outbound.segments[0].departure,n.segments[0].departure);assert(api.inspect(n).ok);});
test('proposal and primary flight cannot persist independently contradictory date models',()=>{const flight=api.resolve(fixture(),'summary'),proposal=api.resolve(fixture(),'segments');assert(api.offerConflicts({flights:[flight],proposalInput:{flight:proposal}}).length);assert.equal(api.offerConflicts({flights:[flight],proposalInput:{flight}}).length,0);});
test('connecting endpoint summary remains supported; ambiguous summary correction requires explicit per-segment dates',()=>{const f=api.resolve(fixture(),'segments');f.outboundSegments[0].to='VIE';f.outboundSegments.push({from:'VIE',to:'CIA',flightNumber:'TEST2',departure:'2020-11-16T16:00',arrival:'2020-11-16T18:00'});f.departure=api.summary(f.outboundSegments);assert(api.inspect(f).ok);f.departure=f.departure.replaceAll('2020','2026');assert(!api.inspect(f).ok);assert.throws(()=>api.resolve(f,'summary'));const n=api.resolve(f,'manual',{outbound:[{departure:'2026-11-16',arrival:'2026-11-16'},{departure:'2026-11-16',arrival:'2026-11-16'}],inbound:[{departure:'2026-11-20',arrival:'2026-11-20'}]});assert(api.inspect(n).ok);assert.equal(n.outboundSegments[1].flightNumber,'TEST2');assert.equal(n.outboundSegments[1].departure,'2026-11-16T16:00');});
test('incompatible combined segment identities cannot be silently discarded by a correction',()=>{const f=fixture();f.segments=structuredClone([...f.outboundSegments,...f.inboundSegments]);f.segments[0].flightNumber='OTHER-FLIGHT';const before=JSON.stringify(f);assert(!api.inspect(f).ok);assert.throws(()=>api.resolve(f,'summary'));assert.equal(JSON.stringify(f),before);});
test('explicit Review action can edit consistent historical dates; cancel still preserves data',()=>{const f=api.resolve(fixture(),'segments'),before=JSON.stringify(f);assert.equal(ui([]).review(f,true),null);assert.equal(JSON.stringify(f),before);const u=ui(['MANUAL','2026-11-16','2026-11-16','2026-11-20','2026-11-20']);const n=u.review(f,true);assert(api.inspect(n).ok);assert.equal(n.outboundSegments[0].departure,'2026-11-16T13:25');});

test('legacy top-level structured create fields receive the same consistency protection',()=>{const f=fixture();assert(api.offerConflicts({flightDeparture:f.departure,flightArrival:f.arrival,flightOutboundSegments:f.outboundSegments,flightInboundSegments:f.inboundSegments}).length);const clean=api.resolve(f,'segments');assert.equal(api.offerConflicts({flightDeparture:clean.departure,flightArrival:clean.arrival,flightOutboundSegments:clean.outboundSegments,flightInboundSegments:clean.inboundSegments}).length,0);});

// PR #31 review F1: a single date names the departure day of that leg.
// It neither asserts nor authorizes any arrival date; the safety gate reads all segments.
function singleDateReviewFixture() {
  const f = api.resolve(fixture(), 'summary');
  f.departure = '16.11.2026';
  f.arrival = '20.11.2026'; // Inbound-leg departure, despite the legacy field name.
  f.outboundSegments[0].departure = '2026-11-16T23:30';
  f.outboundSegments[0].arrival = '2026-11-17T01:30';
  return f;
}
function existingSafetyGate() {
  const source = fs.readFileSync(path.resolve(__dirname, '../server.js'), 'utf8');
  class FixedDate extends Date { constructor(...args) { super(...(args.length ? args : ['2026-11-14T12:00:00Z'])); } }
  const ctx = vm.createContext({ Date: FixedDate,
    normalizeTravelDate: require('../server/travel-normalizers/date-normalizer').normalizeTravelDate,
    safeArray: value => Array.isArray(value) ? value : [], getFlights: offer => offer.flights || [],
    toNumber: (value, fallback = 0) => Number(value) || fallback,
    hotelOccupancyQa: require('../public/hotel-occupancy') });
  vm.runInContext(source.slice(source.indexOf('function routeError('), source.indexOf('function getUserId(')) +
    source.slice(source.indexOf('function inferYearFromText('), source.indexOf('function flightDateKey(')), ctx);
  return ctx;
}
test('PR31 F1: single-date summaries anchor outbound/inbound departure, preserving valid overnight arrival', () => {
  const f = singleDateReviewFixture(), before = JSON.stringify(f);
  assert.equal(api.inspect(f).ok, true);
  assert.equal(existingSafetyGate().flightDateSafety({ travelDates: '16.11.2026 - 20.11.2026', flights: [f] }).ready, true);
  const wrongReturn = structuredClone(f); wrongReturn.arrival = '19.11.2026';
  assert.equal(api.inspect(wrongReturn).ok, false);
  assert.equal(JSON.stringify(f), before);
});
test('PR31 F1: single summary does not hide explicit arrival2027 from live READY/SENT/BOOKED safety', () => {
  const f = singleDateReviewFixture(); f.outboundSegments[0].arrival = '2027-11-17T01:30';
  const offer = {travelDates:'16.11.2026 - 20.11.2026', flights:[f]}, before = JSON.stringify(offer);
  assert.equal(api.inspect(f).ok, true); // Partial summary consistency is not flight safety.
  const gate = existingSafetyGate(), verdict = gate.flightDateSafety(offer);
  assert.equal(verdict.ready, false);
  assert(verdict.warnings.some(w => w.includes('2027-11-17') && w.includes('извън периода')));
  for (const status of ['ready','sent','booked']) {
    assert.throws(() => gate.assertClientStatusSafety({...offer,status}), error =>
      error.status === 422 && error.code === 'AYA_FLIGHT_DATE_BLOCKED');
  }
  assert.equal(JSON.stringify(offer), before);
});
test('PR31 F1: single summary cannot authorize arrival inference or automatic year correction', () => {
  const f = singleDateReviewFixture(); f.outboundSegments[0].arrival = '2027-11-17T01:30';
  const before = JSON.stringify(f);
  assert.throws(() => api.resolve(f,'summary'), /one explicit departure and arrival date per segment/);
  assert.equal(ui(['SUMMARY']).review(f,true), null);
  assert.equal(JSON.stringify(f), before);
  const unknown = structuredClone(f); unknown.outboundSegments[0].arrival = '';
  assert.equal(api.inspect(unknown).ok, false);
  const alias = structuredClone(f); alias.outboundSegments[0].arrivalDate = '2026-11-17';
  assert.equal(api.inspect(alias).ok, false);
});
