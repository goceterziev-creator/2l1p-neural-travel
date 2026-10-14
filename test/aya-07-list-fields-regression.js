"use strict";
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const server = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
const admin = fs.readFileSync(path.join(__dirname, '../public/admin.js'), 'utf8');
function section(source, start, end) {
  const from = source.indexOf(start), to = source.indexOf(end, from);
  assert(from >= 0 && to > from);
  return source.slice(from, to);
}
const ctx = vm.createContext({
  toNumber: (v, fallback = 0) => Number.isFinite(Number(v)) ? Number(v) : fallback,
  safeArray: v => Array.isArray(v) ? v : [],
  getFlightPriceFromOffer: o => o.flightPrice,
  getHotelPriceFromOffer: o => o.hotelPrice
});
vm.runInContext(section(server, 'function summarizeOfferForList(', 'function extractJsonObject(') +
  section(admin, 'function getOfferWarnings(', 'function displayWarning(') +
  section(admin, 'function qaScore(', 'function qaBadge('), ctx);
const summarize = o => ctx.summarizeOfferForList(o);
const warnings = o => Array.from(ctx.getOfferWarnings(o));
const tone = o => ctx.qaTone(ctx.qaScore(o), ctx.getOfferWarnings(o));
const base = { id: 'SYNTHETIC-QA', destination: 'Synthetic destination', flightPrice: 100, hotelPrice: 50,
  finalPrice: 157.5, markupPercent: 5, travelDates: '20–27 October 2026', guests: '2 възрастни, 1 дете и 1 бебе' };
const listed = summarize(base);
assert.equal(listed.travelDates, base.travelDates);
assert.equal(listed.guests, base.guests);
assert(!warnings(listed).some(w => /пътуващи|дати/.test(w)));
assert.equal(listed.finalPrice, base.finalPrice);
assert.equal(listed.markupPercent, base.markupPercent);
// This schema stores strings, not independent operator-confirmation flags.
// Preview-only text and flight composition must never supply missing QA fields.
const previewOnly = { ...base, travelDates: '', guests: '', proposalInput: {
  client: { travelDates: base.travelDates, travelers: base.guests }
}, flights: [{ adults: 2, children: 1, infants: 1 }] };
for (const offer of [previewOnly, summarize(previewOnly)]) {
  assert(warnings(offer).some(w => w.includes('пътуващи')));
  assert(warnings(offer).some(w => w.includes('дати')));
  assert.notEqual(tone(offer), 'ready');
}
// Existing occupancy uncertainty must survive DTO projection, independently
// of a valid flight party and trip-level guest summary.
const unresolved = { ...base, flights: [{ adults: 2, children: 1, infants: 1 }],
  validationWarnings: ['[WARNING] Хотелска заетост 2A+2C, 1 стая: непотвърдена.'] };
for (const offer of [unresolved, summarize(unresolved)]) {
  assert(warnings(offer).some(w => w.includes('непотвърдена')));
  assert.notEqual(tone(offer), 'ready');
}
assert.equal(summarize(unresolved).guests, base.guests);
assert.equal(unresolved.hotels, undefined, 'Do not manufacture hotel occupancy');
const missing = summarize({ ...base, travelDates: undefined, guests: undefined });
assert.equal(missing.travelDates, '');
assert.equal(missing.guests, '');
assert.notEqual(tone(missing), 'ready');
// Informational transfer reminders are retained and remain informational.
const info = summarize({ ...base, validationWarnings: ['[INFO] Проверете трансфера до хотела.'] });
assert.equal(warnings(info).length, 1);
assert.equal(ctx.warningSeverity(warnings(info)[0]), 'info');
console.log('AYA-07 list-field projection and missing-confirmation boundaries: PASS');
