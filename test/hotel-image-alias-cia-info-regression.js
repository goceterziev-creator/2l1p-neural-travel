"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");
const occupancy = require("../public/hotel-occupancy");
const { prepareHotelPrintImages } = require("../gt63-core/hotel-print-images");
const { buildLegacyOfferPrintInput } = require("../gt63-core/legacy-offer-print-input");
const { renderPrintProposal } = require("../gt63-core/renderers/print-presentation");
const { renderMultiHotelProposal } = require("../gt63-core/renderers/multi-hotel");
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "aya-image-alias-info-"));
for (const [key, name] of Object.entries({ DATA_DIR: ".", DB_FILE: "db.json",
  AIRPORT_CONFIG_FILE: "airports.json", OCR_PATTERN_CONFIG_FILE: "ocr.json",
  REGRESSION_LIBRARY_DIR: "library" })) process.env[key] = path.join(scratch, name);
delete process.env.SERPAPI_KEY;
process.on("exit", () => fs.rmSync(scratch, { recursive: true, force: true }));
const { normalizeOffer } = require("../server");
const admin = fs.readFileSync(path.join(__dirname, "../public/admin.js"), "utf8");
function section(start, end, from = 0) {
  const a = admin.indexOf(start, from), b = admin.indexOf(end, a);
  assert(a >= 0 && b > a, start); return admin.slice(a, b);
}
function editor() {
  const fields = {}, cards = { innerHTML: "" };
  const ctx = vm.createContext({ URL, AYAHotelOccupancy: occupancy, hotels: [], flights: [],
    $: id => fields[id], document: { getElementById: id => id === "hotelCards" ? cards : null },
    setValue: (id, value) => { fields[id] = { value: value ?? "" }; },
    normalizeFlightFields: f => ({ ...f }), firstItem: a => a?.[0] || {},
    renderFlightCards() {}, updateAutoPrice() {}, calculatePricing() {}, alert() {},
    mergeCurrentValidationWarnings() {}, escapeHtml: v => String(v ?? "") });
  ctx.addFlight = f => ctx.flights.push({ ...f });
  vm.runInContext(section("function isLikelyHotelImageUrl(", "function calculatePricing(") +
    section("function renderHotelCards(", "function removeHotel(") +
    section("function populateForm(", "async function editOffer(") +
    section("function applyUniversalTravelIntakeResult()", "function getImportedFlightPrice("), ctx);
  return { ctx, fields, cards };
}
const urls = [123456789, 987654321, 456789123].map(n => `https://cf.bstatic.com/xdata/images/hotel/max1024x768/${n}.jpg`);
const hotels = () => ["Trivhio Hotel", "The Hive Hotel", "Mercure Roma Piazza Bologna"].map((name, i) => ({
  id: `synthetic-${i}`, name, selected: i === 0, room: "Synthetic double", meal: "Закуска",
  price: 100 + i * 10, currency: "EUR", images: [],
  occupancy: { adults: 2, children: 0, rooms: 1, childAges: null, confirmed: true }
}));
function body() {
  const h = hotels(); h[0].imageUrls = [urls[0]]; h[1].heroImage = urls[1]; h[2].images = [urls[2]];
  return { destination: "Рим", guests: "2 възрастни", travelDates: "16.11.2026 - 20.11.2026",
    flights: [{ route: "SOF -> CIA / CIA -> SOF", departure: "16.11.2026", arrival: "20.11.2026", price: 200, currency: "EUR" }],
    hotels: h, markupPercent: 5, currency: "EUR", validationWarnings: [] };
}
const browserInfo = "[INFO] Полетът каца в CIA, което е разпознато като валидно летище за Рим. Проверете трансфера до хотела.";
const serverInfo = "[INFO] Полетът каца в cia, което е валидно летище за Рим. Проверете трансфера до хотела.";
const transfers = offer => offer.validationWarnings.filter(w => /^\[INFO\] Полетът каца в (?:CIA|cia),/.test(w));

test("AI import accepts hotel image aliases without mutating the model or confirming occupancy", () => {
  const b = body(), before = JSON.stringify(b), { ctx } = editor();
  ctx.latestUniversalTravelIntake = { offerFlight: b.flights[0], offerHotel: b.hotels[0], offerHotelOptions: b.hotels };
  ctx.applyUniversalTravelIntakeResult();
  assert.deepEqual(Array.from(ctx.hotels, h => Array.from(h.images)), urls.map(u => [u]));
  assert.deepEqual(Array.from(ctx.hotels, h => h.name), b.hotels.map(h => h.name));
  assert.equal(ctx.hotels[0].selected, true);
  assert(ctx.hotels.every(h => h.occupancy.confirmed === false), "existing import confirmation policy remains");
  assert.equal(JSON.stringify(b), before);
});

test("all supported aliases populate canonical images and clearing them does not resurrect old aliases", () => {
  for (const key of ["imageUrls", "heroImage", "image", "imageUrl", "photo", "thumbnail", "gallery"]) {
    const { ctx } = editor(); const h = hotels()[0]; h[key] = key === "imageUrls" || key === "gallery" ? [urls[0]] : urls[0];
    const normalized = ctx.dedupeHotelOptionImages([h]);
    assert.deepEqual(Array.from(normalized[0].images), [urls[0]], key);
    normalized[0].images = [];
    assert.deepEqual(Array.from(ctx.dedupeHotelOptionImages(normalized)[0].images), [], `clear ${key}`);
  }
});

test("Edit -> save normalization -> JSON persistence -> Edit retains images and protected offer fields", () => {
  const b = body(), before = JSON.stringify(b), first = editor();
  first.ctx.populateForm(b);
  assert.equal(first.fields.hotelImages.value, urls[0]);
  for (const url of urls) assert(first.cards.innerHTML.includes(url), url);
  const payload = { ...b, flights: Array.from(first.ctx.flights), hotels: Array.from(first.ctx.dedupeHotelOptionImages(first.ctx.hotels)) };
  const saved = JSON.parse(JSON.stringify(normalizeOffer(payload)));
  const reopened = editor(); reopened.ctx.populateForm(saved);
  const updated = normalizeOffer({ ...saved, hotels: Array.from(reopened.ctx.dedupeHotelOptionImages(reopened.ctx.hotels)) });
  for (const offer of [saved, updated]) {
    assert.deepEqual(offer.hotels.map(h => h.images), urls.map(u => [u]));
    assert.deepEqual(offer.hotels.map(h => [h.id, h.name, h.price, h.selected, h.occupancy.confirmed]),
      b.hotels.map(h => [h.id, h.name, h.price, h.selected, true]));
    assert.equal(offer.markupPercent, 5); assert.equal(offer.finalPrice, 315);
    assert.equal(offer.flights[0].route, b.flights[0].route);
    assert(!offer.validationWarnings.some(w => /нямат запазени адреси на снимки/.test(w)));
  }
  assert.equal(JSON.stringify(b), before);
  const input = occupancy.applyToInput(buildLegacyOfferPrintInput(updated), updated);
  assert(renderMultiHotelProposal(input).includes(urls[0]));
  assert(renderPrintProposal(input).includes(urls[0]));
  assert(renderPrintProposal(input, { selectedHotelId: "synthetic-1" }).includes(urls[1]));
});

test("render-time PDF enrichment is not a persisted URL or QA resolution", async () => {
  const b = body(); b.hotels[0].imageUrls = [];
  const saved = normalizeOffer(b), before = JSON.stringify(saved);
  const input = occupancy.applyToInput(buildLegacyOfferPrintInput(saved), saved);
  const prepared = await prepareHotelPrintImages(input, { selectedHotelId: "synthetic-0" }, {
    origin: "https://aya.example.test", findImages: async () => [urls[0]], resolveImage: async u => u
  });
  assert(renderPrintProposal(prepared).includes(urls[0]));
  assert.equal(JSON.stringify(saved), before);
  const reopened = editor(); reopened.ctx.populateForm(saved);
  assert.deepEqual(Array.from(reopened.ctx.hotels[0].images), []);
  assert(saved.validationWarnings.some(w => /нямат запазени адреси на снимки/.test(w)));
});

test("CIA transfer INFO variants collapse across repeated updates; operator evidence survives", () => {
  const b = body(); const custom = "[WARNING] Оператор: трансферът не е потвърден.";
  const qualified = browserInfo + " Оператор: проверете терминала.";
  b.validationWarnings = [browserInfo, serverInfo, custom, qualified];
  const saved = normalizeOffer(b);
  assert.equal(transfers(saved).filter(w => w !== qualified).length, 1);
  assert(saved.validationWarnings.includes(custom)); assert(saved.validationWarnings.includes(qualified));
  assert.equal(transfers(normalizeOffer(saved)).filter(w => w !== qualified).length, 1);
  const other = "[INFO] Полетът каца в FCO, което е валидно летище за Рим. Проверете трансфера до хотела.";
  assert(normalizeOffer({ ...b, validationWarnings: [other] }).validationWarnings.includes(other));
});
