"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");
const occupancy = require("../public/hotel-occupancy");
const { buildLegacyOfferPrintInput } = require("../gt63-core/legacy-offer-print-input");
const { buildPresentationViewModel } = require("../gt63-core/presentation-view-model");
const { renderPrintProposal } = require("../gt63-core/renderers/print-presentation");
const { renderMultiHotelProposal } = require("../gt63-core/renderers/multi-hotel");
const server = fs.readFileSync(path.join(__dirname, "../server.js"), "utf8");
const admin = fs.readFileSync(path.join(__dirname, "../public/admin.js"), "utf8");
function section(source, start, end) {
  const a = source.indexOf(start), b = source.indexOf(end, a);
  assert(a >= 0 && b > a, start);
  return source.slice(a, b);
}
const ctx = vm.createContext({ AYAHotelOccupancy: occupancy, hotelOccupancyQa: occupancy,
  getFlightPriceFromOffer: o => o.flightPrice, getHotelPriceFromOffer: o => o.hotelPrice,
  toNumber: (v, fallback = 0) => Number.isFinite(Number(v)) ? Number(v) : fallback,
  safeArray: v => Array.isArray(v) ? v : [] });
vm.runInContext(section(server, "function summarizeOfferForList(", "function extractJsonObject(") +
  section(admin, "function getOfferWarnings(", "function displayWarning(") +
  section(admin, "function qaScore(", "function qaBadge(") +
  section(admin, "function offerNeedsReview(", "function syncHomeFieldsToCreateSurface("), ctx);
const normalized = { adults: 2, children: 2, rooms: 1, childAges: null, confirmed: true };
const base = { id: "SYNTHETIC-OCCUPANCY", destination: "Synthetic destination", status: "draft",
  travelDates: "20–27 October 2026", guests: "2 възрастни, 1 дете и 1 бебе", flightPrice: 100,
  hotelPrice: 50, finalPrice: 157.5, basePrice: 150, markupPercent: 5, currency: "EUR",
  flights: [{ airline: "Synthetic Air", route: "AAA -> BBB", price: 100, adults: 2, children: 1, infants: 1 }],
  hotels: [{ id: "hotel-a", name: "Synthetic A", selected: true, price: 50, meal: "Закуска", images: ["https://hotel.example/a.jpg"] }],
  validationWarnings: ["[INFO] Проверете трансфера до хотела."] };
const withOccupancy = value => ({ ...base, hotels: [{ ...base.hotels[0], occupancy: value }] });
const project = o => ctx.summarizeOfferForList(o);
const warnings = o => Array.from(ctx.getOfferWarnings(o));
const ready = o => ctx.qaTone(ctx.qaScore(o), ctx.getOfferWarnings(o)) === "ready";

test("filled trip fields do not make missing hotel occupancy SAFE or READY, in detail or list", () => {
  for (const offer of [base, project(base)]) {
    assert(warnings(offer).includes(occupancy.WARNING));
    assert.equal(ready(offer), false);
    assert.equal(ctx.offerReadyToSend(offer), false);
  }
  assert.equal(project(base).hotelOccupancyStatus.blockingWarning, occupancy.WARNING);
  assert.equal(base.hotels[0].occupancy, undefined);
});

test("recognized 2A+2C/1 room stays blocking until explicitly confirmed; flight never supplies it", () => {
  for (const value of [undefined, { ...normalized, confirmed: false }, { adults: 2, children: 2, confirmed: true }]) {
    const offer = withOccupancy(value);
    assert.equal(ready(offer), false);
    assert.equal(ctx.offerReadyToSend(project(offer)), false);
  }
  assert.equal(occupancy.normalize(base.flights[0]).rooms, null);
  assert.equal(occupancy.summary(base).occupancy.children, null);
});

test("explicit complete confirmation removes only occupancy warning; INFO remains and costs no points", () => {
  const before = warnings(base);
  const offer = withOccupancy(normalized);
  for (const view of [offer, project(offer)]) {
    assert.deepEqual(warnings(view), before.filter(w => w !== occupancy.WARNING));
    assert.equal(ctx.qaScore(view), 100);
    assert.equal(ready(view), true);
    assert.equal(ctx.offerReadyToSend(view), true);
  }
  const other = withOccupancy(normalized);
  other.validationWarnings = [...base.validationWarnings, "[WARNING] Synthetic unresolved price review"];
  assert.equal(ready(other), false);
});

test("only selected hotel confirmation qualifies; changing selection blocks and does not copy occupancy", () => {
  const offer = withOccupancy(normalized);
  offer.hotels.push({ id: "hotel-b", name: "Synthetic B", meal: "Закуска", images: ["https://hotel.example/b.jpg"] });
  assert.equal(ready(offer), true);
  offer.hotels[0].selected = false; offer.hotels[1].selected = true;
  assert.equal(ready(offer), false);
  assert.equal(project(offer).hotelOccupancyStatus.selectedHotelId, "hotel-b");
  assert.equal(occupancy.summary(offer).occupancy.adults, null);
});

test("invalid or partial counts and ages cannot be confirmed; missing ages are not invented", () => {
  for (const value of [{ ...normalized, adults: 0 }, { ...normalized, children: null },
    { ...normalized, rooms: 0 }, { ...normalized, rooms: 1.5 }, { ...normalized, confirmed: "true" },
    { ...normalized, childAges: [1] }, { ...normalized, childAges: [1, -1] }]) {
    assert.equal(occupancy.normalize(value).confirmed, false);
  }
  assert.equal(occupancy.normalize(normalized).childAges, null);
  assert.deepEqual(occupancy.normalize({ ...normalized, childAges: [1, 9] }).childAges, [1, 9]);
});

test("edit changes revoke confirmation and imported hotel data is never auto-confirmed", () => {
  const state = vm.createContext({ AYAHotelOccupancy: occupancy, hotels: [withOccupancy(normalized).hotels[0]], renderHotelCards() {} });
  vm.runInContext(section(admin, "function setHotelOccupancyField(", "function renderHotelCards("), state);
  state.setHotelOccupancyField(0, "rooms", "2");
  assert.equal(state.hotels[0].occupancy.rooms, 2);
  assert.equal(state.hotels[0].occupancy.confirmed, false);
  state.confirmHotelOccupancy(0, true);
  assert.equal(state.hotels[0].occupancy.confirmed, true);
  const add = admin.slice(admin.lastIndexOf("function addHotel("), admin.indexOf("function removeHotel("));
  const imported = vm.createContext({ AYAHotelOccupancy: occupancy, hotels: [], uniqueHotelImages: x => x,
    renderHotelCards() {}, updateAutoPrice() {} });
  vm.runInContext(add, imported);
  imported.addHotel({ name: "Synthetic imported", occupancy: normalized });
  assert.equal(imported.hotels[0].occupancy.confirmed, false);
});

test("saved occupancy and selection override stale proposal fields in HTML and PDF preparation, without price/flight changes", () => {
  const offer = withOccupancy(normalized);
  const before = JSON.stringify(offer);
  const original = buildLegacyOfferPrintInput(offer);
  original.hotelOptions[0].occupancy = { adults: 8, children: 0, rooms: 4, confirmed: true };
  const input = occupancy.applyToInput(original, offer);
  assert.deepEqual(input.hotelOptions[0].occupancy, normalized);
  const view = buildPresentationViewModel(input);
  assert.equal(view.selectedHotel.id, "hotel-a");
  assert.deepEqual(view.selectedHotel.occupancy, normalized);
  assert.deepEqual(input.pricing, original.pricing);
  assert.deepEqual(input.flight, original.flight);
  const pdfHtml = renderPrintProposal(input);
  assert.match(pdfHtml, /2 възрастни, 2 деца; 1 стая — потвърдена заетост/);
  const html = renderMultiHotelProposal(input);
  assert.match(html, /2 възрастни, 2 деца; 1 стая — потвърдена заетост/);
  assert.match(html, /data-option-occupancy=/);
  const missing = occupancy.applyToInput(original, base);
  assert.match(renderPrintProposal(missing), /непотвърдена заетост/);
  assert.equal(occupancy.normalize(missing.hotelOptions[0].occupancy).adults, null);
  assert.equal(JSON.stringify(offer), before);
});

test("READY dashboard excludes unconfirmed offers but accepts INFO-only confirmed offers", () => {
  const offers = [base, withOccupancy({ ...normalized, confirmed: false }), withOccupancy(normalized)].map(project);
  assert.equal(offers.filter(o => ctx.offerReadyToSend(o)).length, 1);
});

test("real save normalizer, JSON persistence, edit normalization and list/detail route handlers preserve independent hotel data", () => {
  const routes = new Map();
  let database = { offers: [] };
  const integration = vm.createContext({ hotelOccupancyQa: occupancy, URL,
    crypto: require('node:crypto'), FLIGHT_AIRPORT_ALIASES: [],
    normalizeTravelDate: require('../server/travel-normalizers/date-normalizer').normalizeTravelDate,
    renderClientFlightItineraryBg: require('../server/flight-display-bg').renderClientFlightItineraryBg,
    app: { get: (route, capability, handler) => { assert.equal(capability, 'offers.view'); routes.set(route, handler); } },
    requireCapability: name => name, readDb: () => database,
    scopeOffers: db => db.offers, canAccessOffer: () => true });
  vm.runInContext(section(server, 'function toNumber(', 'function summarizeStats(') +
    section(server, 'function normalizeGuestsText(', 'function translateOcrCity(') +
    section(server, 'function summarizeOfferForList(', 'function extractJsonObject('), integration);
  vm.runInContext(section(server, 'app.get("/api/offers",', 'app.get("/api/offers/stats/summary",') +
    section(server, 'app.get("/api/offers/:id",', 'app.post("/api/offers",'), integration);
  const body = withOccupancy({ ...normalized, childAges: [1, 9] });
  body.destination = '';
  const saved = integration.normalizeOffer(body);
  assert.equal(saved.hotels[0].id, 'hotel-a');
  assert.deepEqual(JSON.parse(JSON.stringify(saved.hotels[0].occupancy)), { ...normalized, childAges: [1, 9] });
  const flightBefore = JSON.stringify(saved.flights);
  const pricingBefore = JSON.stringify([saved.flightPrice, saved.hotelPrice, saved.basePrice, saved.finalPrice, saved.markupPercent]);
  database = JSON.parse(JSON.stringify({ offers: [saved] }));
  const edit = integration.normalizeOffer(database.offers[0]);
  assert.equal(JSON.stringify(edit.flights), flightBefore);
  assert.equal(JSON.stringify([edit.flightPrice, edit.hotelPrice, edit.basePrice, edit.finalPrice, edit.markupPercent]), pricingBefore);
  assert.equal(edit.hotels[0].selected, true);
  assert.deepEqual(JSON.parse(JSON.stringify(edit.hotels[0].occupancy)), { ...normalized, childAges: [1, 9] });
  let single, list;
  routes.get('/api/offers/:id')({ params: { id: saved.id } }, { json: x => { single = x.offer; } });
  routes.get('/api/offers')({}, { json: x => { list = x.offers[0]; } });
  assert.deepEqual(JSON.parse(JSON.stringify(single.hotelOccupancyStatus)), JSON.parse(JSON.stringify(list.hotelOccupancyStatus)));
  assert.equal(list.hotelOccupancyStatus.occupancy.confirmed, true);
  assert.equal(list.hotelOccupancyStatus.blockingWarning, '');
  assert.equal(single.guests, body.guests);
  assert.equal(single.hotels[0].occupancy.children, 2);
  assert.equal(single.hotels[0].occupancy.rooms, 1);
  const unconfirmed = integration.normalizeOffer({ ...body, hotels: [{ ...body.hotels[0], occupancy: { ...normalized, confirmed: false } }] });
  assert.equal(unconfirmed.hotels[0].occupancy.confirmed, false);
});

test("admin hotel cards render explicit zero children and confirmation controls without changing occupancy", () => {
  const box = { innerHTML: '' };
  const hotel = withOccupancy({ ...normalized, children: 0 }).hotels[0];
  const before = JSON.stringify(hotel);
  const ui = vm.createContext({ AYAHotelOccupancy: occupancy, hotels: [hotel], document: { getElementById: () => box },
    dedupeHotelOptionImages: x => x, escapeHtml: v => String(v || '') });
  vm.runInContext(section(admin, 'function renderHotelCards(', 'function addHotel('), ui);
  ui.renderHotelCards();
  assert.match(box.innerHTML, /Деца \(включително бебета\)[\s\S]*?value="0"/);
  assert.match(box.innerHTML, /confirmHotelOccupancy\(0, this.checked\)/);
  assert.equal(JSON.stringify(hotel), before);
  assert.equal(ctx.offerReadyToSend({ ...withOccupancy(normalized), status: 'review' }), false);
});
