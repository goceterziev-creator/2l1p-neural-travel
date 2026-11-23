'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const api=require('../public/flight-data-consistency'),dates=require('../server/travel-normalizers/date-normalizer');
const context={verifiedTravelDates:'21.11.2026 - 29.11.2026',now:new Date('2026-11-19T00:00:00Z')};
function fixture(){const rows=[['TK1032','SOF','IST','сб., 21 ноем. · 16:00 ч.','сб., 21 ноем. · 18:30 ч.'],['TK868','IST','AUH','сб., 21 ноем. · 19:55 ч.','нед., 22 ноем. · 01:30 ч.'],['TK869','AUH','IST','нед., 29 ноем. · 02:35 ч.','нед., 29 ноем. · 07:00 ч.'],['TK1127','IST','SOF','нед., 29 ноем. · 10:30 ч.','нед., 29 ноем. · 10:50 ч.']].map(([flightNumber,from,to,departure,arrival])=>({flightNumber,from,to,departure,arrival}));return {outboundSegments:rows.slice(0,2),inboundSegments:rows.slice(2),segments:structuredClone(rows),departure:'SOF → AUH, сб., 21 ноем. · 16:00 ч. - нед., 22 ноем. · 01:30 ч., via IST',arrival:'AUH → SOF, нед., 29 ноем. · 02:35 ч. - нед., 29 ноем. · 10:50 ч., via IST'};}
test('Bulgarian month labels tokenize and normalize, including explicit year',()=>{for(const [month,labels] of [[1,['ян.','яну.']],[2,['фев.','февр.']],[3,['мар.','март']],[4,['апр.']],[5,['май']],[6,['юни']],[7,['юли']],[8,['авг.']],[9,['сеп.','септ.']],[10,['окт.']],[11,['ное.','ноем.']],[12,['дек.']]])for(const label of labels){const raw=`21 ${label} 2027`;assert.equal(dates.normalizeTravelDate(raw).month,month,raw);assert.equal(dates.normalizeTravelDate(raw).year,2027,raw);assert.equal(api.tokens(raw)[0]?.key,`2027-${String(month).padStart(2,'0')}-21`,raw);}});
test('all four source segments resolve from period, preserve midnight, copies, raw and input',()=>{const f=fixture(),before=JSON.stringify(f),r=api.resolveYearContext(f,context);assert(r.ok,r.reason);const expected=[['2026-11-21T16:00','2026-11-21T18:30'],['2026-11-21T19:55','2026-11-22T01:30'],['2026-11-29T02:35','2026-11-29T07:00'],['2026-11-29T10:30','2026-11-29T10:50']];assert.deepEqual(r.flight.segments.map(s=>[s.departure,s.arrival]),expected);assert(r.flight.dateResolution.evidence.every(e=>e.basis==='verifiedTravelDates'&&e.provenance==='CONTEXT_RESOLVED_YEAR'));assert.equal(r.flight.dateResolution.rawDates['outboundSegments[0].departure'],f.outboundSegments[0].departure);assert.equal(JSON.stringify(f),before);assert(api.inspect(r.flight).ok);});
test('explicit conflicting year remains blocked and nonmutating',()=>{const f=fixture();f.outboundSegments[0].departureDate='2027-11-21';const before=JSON.stringify(f);assert.equal(api.resolveYearContext(f,context).ok,false);assert.equal(JSON.stringify(f),before);});
test('existing UI requires confirmation, cancellation leaves source unchanged',async()=>{const s=fs.readFileSync(require.resolve('../public/admin.js'),'utf8');for(const accepted of [false,true]){const f=fixture(),before=JSON.stringify(f);let confirmations=0;const wrapped={...api,resolveYearContext:(flight,c)=>api.resolveYearContext(flight,{...c,now:context.now})};const sandbox=vm.createContext({globalThis:{AYAFlightDataConsistency:wrapped},$:()=>({value:context.verifiedTravelDates}),confirm:()=>{confirmations++;return accepted;}});vm.runInContext(s.slice(s.indexOf('async function reviewFlightDateConsistencyUI('),s.indexOf('function reviewFlightDateConsistency(')),sandbox);assert.equal(Boolean(await sandbox.reviewFlightDateConsistencyUI(f)),accepted);assert.equal(confirmations,1);assert.equal(JSON.stringify(f),before);}});

test('PC272/PC273 hyphenated November dates require confirmation and synchronize every segment copy', () => {
  const raw = {
    outbound: { segments: [{ from: 'SOF', to: 'SAW', flightNumber: 'PC272', departureDate: '25-ноем.', arrivalDate: '25-ноем.', departureTime: '12:55', arrivalTime: '15:10' }] },
    inbound: { segments: [{ from: 'SAW', to: 'SOF', flightNumber: 'PC273', departureDate: '27-ноем.', arrivalDate: '27-ноем.', departureTime: '18:05', arrivalTime: '18:25' }] }
  };
  for (const leg of ['outbound', 'inbound']) {
    for (const segment of raw[leg].segments) {
      segment.departure = segment.departureDate + ' ' + segment.departureTime;
      segment.arrival = segment.arrivalDate + ' ' + segment.arrivalTime;
    }
  }
  raw.departure = api.summary(raw.outbound.segments);
  raw.arrival = api.summary(raw.inbound.segments);
  raw.segments = structuredClone([...raw.outbound.segments, ...raw.inbound.segments]);
  const before = JSON.stringify(raw);
  const reviewed = {
    outbound: [{ departure: '2026-11-25', arrival: '2026-11-25' }],
    inbound: [{ departure: '2026-11-27', arrival: '2026-11-27' }]
  };

  assert(!api.inspect(raw).ok);
  assert(api.offerConflicts({ flights: [raw] }).length > 0);
  assert.throws(() => api.resolve(raw, 'segments'), /explicit valid YYYY-MM-DD/);
  assert.throws(() => api.resolve(raw, 'manual', { outbound: reviewed.outbound }), /every segment/);
  const corrected = api.resolve(raw, 'manual', reviewed);
  const expected = [
    ['2026-11-25T12:55', '2026-11-25T15:10'],
    ['2026-11-27T18:05', '2026-11-27T18:25']
  ];
  for (const [index, leg] of ['outbound', 'inbound'].entries()) {
    const segment = corrected[leg].segments[0];
    assert.deepEqual([segment.departure, segment.arrival], expected[index]);
    assert.equal(segment.departureDate, expected[index][0].slice(0, 10));
    assert.deepEqual(corrected[leg + 'Segments'][0], segment);
    assert.deepEqual(corrected.segments[index], segment);
    assert.equal(corrected[leg === 'outbound' ? 'departure' : 'arrival'], api.summary([segment]));
  }
  assert.deepEqual(api.offerConflicts({ flights: [corrected] }), []);
  assert.equal(JSON.stringify(raw), before);

  assert.equal(api.segmentDateTime({ departureDate: '25-ноем.', departureTime: '12:55' }, 'departure'), '25-ноем. 12:55');
  const contextual = api.resolveYearContext(raw, {
    verifiedTravelDates: '25.11.2026 - 27.11.2026',
    now: new Date('2026-11-23T00:00:00Z')
  });
  assert(contextual.ok, contextual.reason);
  assert.equal(contextual.flight.dateResolution.rawDates['outbound.segments[0].departure'], '25-ноем. 12:55');
  const malformed = structuredClone(raw);
  malformed.outbound.segments[0].departure = '25-ноем. / 26-ноем. 12:55';
  assert.throws(() => api.resolve(malformed, 'manual', reviewed), /Ambiguous original segment/);
});
