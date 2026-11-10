"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");
const Module = require("node:module");
const test = require("node:test");
const sharp = require("sharp");
const { hotelImageOfferVersion: version, prepareHotelImagePlan: prepare, applyHotelImagePlan: apply, projectPersistedHotelImages } = require("../server/hotel-image-persistence-plan");
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "aya-image-plan-"));
for (const [key, name] of Object.entries({ DATA_DIR: ".", DB_FILE: "db.json", AIRPORT_CONFIG_FILE: "airports.json", OCR_PATTERN_CONFIG_FILE: "ocr.json" })) process.env[key] = path.join(scratch, name);
process.env.GT63_PRINT_IMAGE_DNS_FIXTURES = JSON.stringify({ "photos.example.test": ["8.8.8.8"] });
delete process.env.SERPAPI_KEY;
process.on("exit", () => fs.rmSync(scratch, { recursive: true, force: true }));
const filename = path.join(__dirname, "../server.js");
const harness = new Module(filename, module); harness.filename = filename; harness.paths = Module._nodeModulePaths(path.dirname(filename));
harness._compile(fs.readFileSync(filename, "utf8") + "\nmodule.exports.imagePlanTest={uniqueHotelImages, resolveGt63HotelPrintImage, normalizeOffer};", filename);
const { uniqueHotelImages, resolveGt63HotelPrintImage } = harness.exports.imagePlanTest;
const valid = "https://photos.example.test/trivhio.jpg";
const copy = x => JSON.parse(JSON.stringify(x));
const fixture = () => ({ id: "SYNTHETIC-OFFER", updatedAt: "2026-11-10T09:23:00Z", destination: "Рим",
  finalPrice: 1173.02, markupPercent: 5, flights: [{ route: "SOF -> CIA / CIA -> SOF", price: 200 }],
  validationWarnings: ["[WARNING] Unresolved operator evidence", "[INFO] Check transfer",
    "[WARNING] 2 хотел(а) нямат запазени адреси на снимки. Проверете кориците на PDF преди изпращане."], warningsDismissed: false,
  hotels: ["Trivhio Hotel", "The Hive Hotel", "Mercure Roma Piazza Bologna"].map((name, i) => ({
    id: `synthetic-hotel-${i}`, name, selected: i === 0, price: 100 + i, room: "Synthetic double", images: [],
    occupancy: { adults: 2, children: 0, rooms: 1, confirmed: true }
  })) });
function request(offer, hotelId = "synthetic-hotel-0") {
  return { offer, offerId: offer.id, hotelId, expectedVersion: version(offer), confirmedHotelIdentity: true,
    candidates: [{ hotelId, url: valid, source: "hotel-lookup" }] };
}
const deps = { uniqueImages: uniqueHotelImages, validateImage: async () => true };

test("explicit exact-ID image-only update preserves all prices, selection, flights, occupancy and QA evidence", async () => {
  const offer = fixture(), before = copy(offer), plan = await prepare(request(offer), deps);
  const result = apply(offer, plan); assert.equal(result.changed, true);
  assert.deepEqual(offer, before, "no input or persistence mutation during preparation/application");
  const expected = copy(before); expected.hotels[0].images = [valid];
  assert.deepEqual(result.offer, expected);
  assert.equal(apply(copy(result.offer), plan).changed, false, "exact repeated application is a no-op");
  const renewed = await prepare(request(result.offer), deps);
  assert.equal(apply(result.offer, renewed).changed, false);
});

test("wrong, missing and duplicate hotel IDs plus unconfirmed/fallback candidates fail closed", async () => {
  const offer = fixture();
  await assert.rejects(prepare(request(offer, "absent"), deps), /unique persisted hotel ID/);
  offer.hotels[1].id = offer.hotels[0].id;
  await assert.rejects(prepare(request(offer), deps), /Invalid or duplicate hotel ID/);
  for (const overrides of [{ confirmedHotelIdentity: false }, { candidates: [] },
    { candidates: [{ hotelId: "synthetic-hotel-1", url: valid, source: "hotel-lookup" }] },
    { candidates: [{ hotelId: "synthetic-hotel-0", url: valid, source: "pdf-fallback" }] }]) {
    await assert.rejects(prepare({ ...request(fixture()), ...overrides }, deps));
  }
  assert.throws(() => apply(fixture(), {}), /server-prepared plan/);
});

test("stale version, changes during validation and concurrent edits after preparation are rejected", async () => {
  const offer = fixture();
  await assert.rejects(prepare({ ...request(offer), expectedVersion: "stale" }, deps), /version conflict/);
  const plan = await prepare(request(offer), deps); const changed = copy(offer); changed.finalPrice++;
  assert.throws(() => apply(changed, plan), /version conflict/);
  const after = apply(offer, plan).offer; after.validationWarnings.push("[WARNING] New evidence");
  assert.throws(() => apply(after, plan), /version conflict/, "idempotence never bypasses concurrent edits");
  const during = fixture();
  await assert.rejects(prepare(request(during), { ...deps, validateImage: async () => { during.markupPercent++; return true; } }), /changed during validation/);
});

test("missing or invalid images cannot produce a plan; existing image data is not erased", async () => {
  const offer = fixture(); offer.hotels[0].images = ["https://photos.example.test/existing.jpg"];
  const before = copy(offer);
  await assert.rejects(prepare(request(offer), { ...deps, validateImage: async () => false }), /validation failed/);
  assert.deepEqual(offer, before);
});

test("existing safe fetch/decode/cache mechanism validates synthetic bytes; originals are persisted, not PDF cache URLs", async () => {
  const realFetch = global.fetch;
  const jpg = await sharp({ create: { width: 20, height: 20, channels: 3, background: "#336699" } }).jpeg().toBuffer();
  try {
    global.fetch = async () => ({ ok: true, status: 200, headers: new Headers({ "content-type": "image/jpeg" }), arrayBuffer: async () => jpg });
    const plan = await prepare(request(fixture()), { uniqueImages: uniqueHotelImages, validateImage: resolveGt63HotelPrintImage });
    assert.deepEqual(plan.images, [valid]);
    assert(!plan.images.some(url => url.includes("hotel-cache")));
  } finally { global.fetch = realFetch; }
});

test("JSON persistence and actual editor deduplication reopen the exact target hotel URLs", async () => {
  const offer = fixture(); const plan = await prepare(request(offer, "synthetic-hotel-1"), deps);
  const persisted = copy(apply(offer, plan).offer);
  const source = fs.readFileSync(path.join(__dirname, "../public/admin.js"), "utf8");
  const a = source.indexOf("function isLikelyHotelImageUrl("), b = source.indexOf("function calculatePricing(", a);
  const ctx = vm.createContext({ URL }); vm.runInContext(source.slice(a, b), ctx);
  const reopened = Array.from(ctx.dedupeHotelOptionImages(persisted.hotels));
  assert.deepEqual(reopened.map(h => Array.from(h.images)), [[], [valid], []]);
  assert.deepEqual(reopened.map(h => h.selected), [true, false, false]);
});

test("persisted URLs can be projected into a stale proposal without rewriting its snapshot or other hotel data", async () => {
  const offer = fixture(); offer.hotels[1].imageUrls = ["https://photos.example.test/obsolete-alias.jpg"];
  const plan = await prepare(request(offer, "synthetic-hotel-1"), deps);
  const saved = copy(apply(offer, plan).offer);
  const input = { pricing: { flightAmount: 200, marginPercent: 5 }, selectedHotelIndex: 0,
    hotelOptions: offer.hotels.map(h => ({ ...h, heroImage: "https://photos.example.test/old.jpg" })) };
  const before = JSON.stringify(input), record = JSON.stringify(saved);
  const projected = projectPersistedHotelImages(input, saved);
  assert.deepEqual(projected.hotelOptions[1].images, [valid]);
  assert.equal(projected.hotelOptions[1].heroImage, undefined);
  assert.deepEqual(projected.hotelOptions[0], input.hotelOptions[0]);
  assert.deepEqual(projected.pricing, input.pricing); assert.equal(projected.selectedHotelIndex, 0);
  assert.equal(JSON.stringify(input), before); assert.equal(JSON.stringify(saved), record);
  const wrong = copy(input); wrong.hotelOptions[1].id = "different-id";
  assert.deepEqual(projectPersistedHotelImages(wrong, saved).hotelOptions[1], wrong.hotelOptions[1]);
});

const { prepareHotelIdentityPlan, applyHotelIdentityPlan } = require("../server/hotel-image-persistence-plan");
function identityRequest(offer) {
  return { offer, offerId: offer.id, expectedVersion: version(offer) };
}
test("identity bootstrap preserves every non-ID field, order and duplicate names; replay and reopen are stable", () => {
  const offer = fixture();
  offer.updatedAt = "2026-11-10T07:23:04.555Z";
  offer.hotels.forEach(hotel => { hotel.id = ""; });
  offer.hotels[1].name = offer.hotels[0].name;
  offer.hotelOptions = copy(offer.hotels);
  const before = copy(offer);
  const plan = prepareHotelIdentityPlan(identityRequest(offer));
  const result = applyHotelIdentityPlan(offer, plan);
  assert.equal(result.changed, true);
  assert.equal(new Set(result.offer.hotels.map(hotel => hotel.id)).size, 3);
  result.offer.hotels.forEach(hotel => assert.match(hotel.id, /^hotel-[0-9a-f-]{36}$/));
  assert.deepEqual(result.offer.hotels, result.offer.hotelOptions);
  const stripped = copy(result.offer);
  stripped.hotels.forEach(hotel => { hotel.id = ""; });
  stripped.hotelOptions.forEach(hotel => { hotel.id = ""; });
  assert.deepEqual(stripped, before);
  assert.deepEqual(offer, before);
  const reopened = copy(result.offer);
  assert.deepEqual(harness.exports.imagePlanTest.normalizeOffer(reopened).hotels.map(hotel => hotel.id), reopened.hotels.map(hotel => hotel.id));
  assert.equal(applyHotelIdentityPlan(reopened, plan).changed, false);
  const renewed = prepareHotelIdentityPlan(identityRequest(reopened));
  assert.equal(applyHotelIdentityPlan(reopened, renewed).changed, false);
});
test("identity rejects concurrent edits even with identical updatedAt, reordered or divergent mirrors, and forged plans", () => {
  const offer = fixture();
  offer.hotels[0].id = "";
  const plan = prepareHotelIdentityPlan(identityRequest(offer));
  for (const mutate of [o => o.hotels.reverse(), o => o.hotels[0].price++, o => o.validationWarnings.push("new")]) {
    const changed = copy(offer); mutate(changed);
    assert.throws(() => applyHotelIdentityPlan(changed, plan), /version conflict/);
  }
  const mirror = copy(offer); mirror.hotelOptions = copy(mirror.hotels).reverse();
  assert.throws(() => prepareHotelIdentityPlan(identityRequest(mirror)), /mirror mismatch/);
  const duplicate = fixture(); duplicate.hotels[1].id = duplicate.hotels[0].id;
  assert.throws(() => prepareHotelIdentityPlan(identityRequest(duplicate)), /duplicate/);
  assert.throws(() => applyHotelIdentityPlan(offer, { ...plan }), /server-prepared/);
  const stale = identityRequest(offer); stale.expectedVersion = "stale";
  assert.throws(() => prepareHotelIdentityPlan(stale), /version conflict/);
});
test("existing IDs survive bootstrap; only exact new ID receives images in both stored arrays", async () => {
  const offer = fixture(); offer.hotels[0].id = ""; offer.hotels[1].id = "   ";
  offer.hotelOptions = copy(offer.hotels);
  await assert.rejects(prepare(request(offer, ""), deps), /unique persisted hotel ID/);
  const identified = applyHotelIdentityPlan(offer, prepareHotelIdentityPlan(identityRequest(offer))).offer;
  assert.equal(identified.hotels[2].id, offer.hotels[2].id);
  const id = identified.hotels[1].id;
  const result = apply(identified, await prepare(request(identified, id), deps)).offer;
  assert.deepEqual(result.hotels, result.hotelOptions);
  assert.deepEqual(result.hotels[0], identified.hotels[0]);
  assert.deepEqual(result.hotels[2], identified.hotels[2]);
  assert.deepEqual(result.hotels[1].images, [valid]);
  const expected = copy(identified);
  expected.hotels[1].images = [valid]; expected.hotelOptions[1].images = [valid];
  assert.deepEqual(result, expected);
  const noMirror = fixture();
  const unchanged = applyHotelIdentityPlan(noMirror, prepareHotelIdentityPlan(identityRequest(noMirror))).offer;
  assert.equal(Object.hasOwn(unchanged, "hotelOptions"), false);
});

test("identity and image plans preserve intervening telemetry under the shared editorial version contract", async () => {
  const offer = fixture(); offer.hotels[0].id = "";
  const identity = prepareHotelIdentityPlan(identityRequest(offer));
  const tracked = copy(offer);
  Object.assign(tracked, { clientViews: 4, clientViewed: true, clicks: 2, pdfDownloads: 3, updatedAt: "later-tracking-time" });
  const identified = applyHotelIdentityPlan(tracked, identity).offer;
  for (const key of ["clientViews", "clientViewed", "clicks", "pdfDownloads", "updatedAt"]) assert.equal(identified[key], tracked[key]);
  const image = await prepare(request(identified, identified.hotels[0].id), deps);
  const latest = copy(identified); latest.clicks++; latest.updatedAt = "latest-tracking-time";
  const saved = apply(latest, image).offer;
  assert.equal(saved.clicks, latest.clicks); assert.equal(saved.updatedAt, latest.updatedAt);
  assert.deepEqual(saved.hotels[0].images, [valid]);
  assert.equal(apply(saved, image).changed, false);
});
