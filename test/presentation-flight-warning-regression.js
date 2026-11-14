"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), Module = require('node:module');
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'aya-presentation-warnings-'));
for (const [key, file] of Object.entries({DATA_DIR:'.', DB_FILE:'db.json', AIRPORT_CONFIG_FILE:'airports.json', OCR_PATTERN_CONFIG_FILE:'ocr.json'})) process.env[key] = path.join(scratch, file);
process.env.SERPAPI_KEY = '';
process.on('exit', () => fs.rmSync(scratch, {recursive:true, force:true}));
const filename = path.resolve(__dirname, '../server.js'), harness = new Module(filename, module);
harness.filename = filename; harness.paths = Module._nodeModulePaths(path.dirname(filename));
harness._compile(fs.readFileSync(filename, 'utf8') + '\nmodule.exports.warningTest={flightDateSafety,assertFlightDateSafety,renderOfferHtml,renderGt63PrintOfferHtml};', filename);
const api = harness.exports.warningTest;
const adapter = require('../gt63-core/legacy-offer-print-input');
const stale = '[WARNING] [FLIGHT_DATE_SAFETY] STALE_GENERATED_DATE_WARNING';
const preserved = ['[INFO] CIA transfer must be checked', '[WARNING] Meal confirmation required', '[WARNING] Hotel occupancy confirmation required', 'Operator note mentioning [FLIGHT_DATE_SAFETY] must remain'];
function fixture(proposal) {
  const offer = {id:'SYNTHETIC-WARNING-QA',destination:'Рим',travelDates:'16.11.2099 - 20.11.2099',status:'draft',currency:'EUR',guests:'2 adults',markupPercent:5,finalPrice:315,
    validationWarnings:[stale, ...preserved],
    flights:[{route:'SOF -> CIA / CIA -> SOF',price:200,outboundSegments:[{from:'SOF',to:'CIA',departure:'2099-11-16T13:25',arrival:'2099-11-16T14:15',flightNumber:'FR625'}],inboundSegments:[{from:'CIA',to:'SOF',departure:'2099-11-20T12:25',arrival:'2099-11-20T15:10',flightNumber:'FR626'}]}],
    hotels:[{id:'qa-hotel',name:'Synthetic hotel',price:100,selected:true,room:'Synthetic room',meal:'Synthetic meal',images:['https://example.test/test.jpg'],occupancy:{adults:2,children:0,rooms:1,confirmed:true}}]};
  if (proposal) {
    offer.proposalInput = adapter.buildLegacyOfferPrintInput(offer);
    offer.proposalInput.warnings = [stale, '[INFO] PROPOSAL_ONLY_TRANSFER_NOTE'];
    offer.proposalTemplate = {selected:'multi-hotel'};
  }
  return offer;
}
async function render(offer, print) {
  return print ? api.renderGt63PrintOfferHtml(offer) : api.renderOfferHtml(offer);
}
async function assertNoMutation(offer, operation) {
  const before = JSON.stringify(offer);
  fs.writeFileSync(process.env.DB_FILE, JSON.stringify({offers:[offer]}));
  const bytes = fs.readFileSync(process.env.DB_FILE);
  const result = await operation();
  assert.equal(JSON.stringify(offer), before, 'all source fields, including saved warnings, must remain unchanged');
  assert.deepEqual(fs.readFileSync(process.env.DB_FILE), bytes, 'persisted synthetic record must remain byte-identical');
  return result;
}
for (const proposal of [false,true]) for (const print of [false,true]) {
  const label = `${proposal ? 'saved proposal' : 'legacy'} ${print ? 'PDF print HTML' : 'client HTML'}`;
  test(`${label}: stale generated warning is replaced by current ready verdict`, async () => {
    const offer = fixture(proposal);
    assert.equal(api.flightDateSafety(offer).ready, true);
    const output = await assertNoMutation(offer, () => render(offer, print));
    assert(!output.includes('STALE_GENERATED_DATE_WARNING'));
    for (const warning of preserved) assert(output.includes(warning.replace(/^\[(INFO|WARNING)\] /, '')), warning);
    if (proposal) assert(output.includes('PROPOSAL_ONLY_TRANSFER_NOTE'));
    assert(offer.validationWarnings.includes(stale));
  });
  test(`${label}: genuinely blocked flight retains fresh warning without mutation`, async () => {
    const offer = fixture(proposal);
    offer.flights[0].outboundSegments[0].departure = '2020-11-16T13:25';
    assert.equal(api.flightDateSafety(offer).ready, false);
    assert.throws(() => api.assertFlightDateSafety(offer), error => error.status === 422 && error.code === 'AYA_FLIGHT_DATE_BLOCKED');
    const output = await assertNoMutation(offer, () => render(offer, print));
    assert(!output.includes('STALE_GENERATED_DATE_WARNING'));
    assert(output.includes('[FLIGHT_DATE_SAFETY]'));
    assert(output.includes('2020-11-16'));
    for (const warning of preserved) assert(output.includes(warning.replace(/^\[(INFO|WARNING)\] /, '')), warning);
  });
}
test('saved proposal flight aliases independently produce a live blocking warning', async () => {
  const offer = fixture(true);
  offer.proposalInput.flight.outboundSegments[0].departureDate = '2020-11-16';
  assert.equal(api.flightDateSafety(offer).ready, false);
  for (const print of [false,true]) {
    const output = await assertNoMutation(offer, () => render(offer, print));
    assert(output.includes('противоречиви date aliases'));
    assert(output.includes('PROPOSAL_ONLY_TRANSFER_NOTE'));
    assert(!output.includes('STALE_GENERATED_DATE_WARNING'));
  }
});
