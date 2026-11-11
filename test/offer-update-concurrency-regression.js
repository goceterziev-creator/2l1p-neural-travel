"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const vm = require("node:vm");
const Module = require("node:module");
const { offerRecordVersion } = require("../server/offer-record-version");
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "aya-concurrency-"));
for (const [key, file] of Object.entries({ DATA_DIR: ".", DB_FILE: "db.json", AIRPORT_CONFIG_FILE: "airports.json", OCR_PATTERN_CONFIG_FILE: "ocr.json" })) process.env[key] = path.join(scratch, file);
process.on("exit", () => fs.rmSync(scratch, { recursive: true, force: true }));
const filename = path.resolve(__dirname, "../server.js");
const source = fs.readFileSync(filename, "utf8");
const harness = new Module(filename, module); harness.filename = filename; harness.paths = Module._nodeModulePaths(path.dirname(filename));
harness._compile(source + "\nmodule.exports.concurrencyTest={normalizeOffer,flightSafetyWarnings,flightDateSafety,assertClientStatusSafety,assertFlightDateSafety,guardClientFlightDates};", filename);
const normalizeOffer = harness.exports.concurrencyTest.normalizeOffer;
const clone = value => JSON.parse(JSON.stringify(value));
function section(start, end) { return source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start))); }
function setup() {
  let db = { offers: [{ ...normalizeOffer({ destination: "Рим", travelDates: "16.11.2099 - 20.11.2099", flights: [{ route: "SOF -> CIA / CIA -> SOF", departure: "2099-11-16T10:30", arrival: "2099-11-20T10:30", price: 200 }], hotels: [{ id: "hotel-exact", name: "Synthetic", price: 100, selected: true, images: [], occupancy: { adults: 2, children: 0, rooms: 1, confirmed: true } }] }), id: "QA", agencyId: "A" }] };
  let writes = 0, audits = 0;
  const routes = {};
  const ctx = vm.createContext({
    app: { get: (url, capability, handler) => { routes[url.includes("/view/") ? "view" : "get"] = handler || capability; }, post: (url, handler) => { routes.click = handler; }, put: (url, _, handler) => { routes.put = handler; } },
    requireCapability: x => x, offerRecordVersion, normalizeOffer,
    ...harness.exports.concurrencyTest,
    toNumber: (value, fallback = 0) => Number(value) || fallback, renderOfferHtml: async () => "synthetic",
    readDb: () => clone(db), writeDb: value => { writes++; db = clone(value); },
    canAccessOffer: req => !req.forbidden, entityAgencyId: x => x.agencyId,
    uniqueWarnings: x => [...new Set(x || [])], appendAuditEvent: () => { audits++; },
    routeError: (message, status, details) => Object.assign(new Error(message), { status, details }),
    withBulgarianOfferFlightDisplay: offer => ({ ...offer, hotelOptions: offer.hotels }),
    hotelOccupancyQa: { summary: () => "synthetic-summary" }, LIVE_BASE_URL: "https://example.test"
  });
  vm.runInContext(section('let mutationQueue = Promise.resolve();', 'function routeError('), ctx);
  vm.runInContext(section('app.get("/api/offers/:id",', 'app.post("/api/offers",') + section('app.put("/api/offers/:id",', '// Two explicit operations;'), ctx);
  vm.runInContext(section('app.post("/api/offers/:id/click",', 'app.post("/api/offers/:id/book",') + section('app.get("/api/offers/view/:id",', 'app.get("/api/offers/:id/print",'), ctx);
  // Execute the actual initial guard and post-generation accounting without launching Chrome.
  const pdfPrefix = section('app.get("/api/offers/:id/pdf",', '  const printUrl = new URL(');
  const pdfAccounting = section('    // Async PDF generation can cross UTC midnight.', '    res.setHeader("Content-Type", "application/pdf");');
  vm.runInContext(pdfPrefix + pdfAccounting + '\n});', ctx);
  routes.pdf = routes.get;
  vm.runInContext(section('app.get("/api/offers/:id",', 'app.post("/api/offers",'), ctx);
  async function call(method, body, forbidden = false) {
    const res = { code: 200, status(code) { this.code = code; return this; }, json(data) { this.data = clone(data); }, setHeader() {}, send() {} };
    await routes[method]({ params: { id: "QA" }, body, user: { id: "U", name: "QA" }, forbidden }, res);
    return res;
  }
  return { call, current: () => clone(db.offers[0]), change: fn => fn(db.offers[0]), writes: () => writes, audits: () => audits };
}
test("raw GET version, stale editor after identity/image persistence, and legacy callers fail without writes", async () => {
  const s = setup(), opened = await s.call("get");
  assert.equal(opened.data.offerVersion, offerRecordVersion(s.current()));
  assert.notEqual(opened.data.offerVersion, offerRecordVersion(opened.data.offer));
  const old = clone(opened.data.offer);
  s.change(o => { o.hotels[0].id = "hotel-new"; o.hotels[0].images = ["https://example.test/synthetic.jpg"]; });
  const before = s.current();
  for (const expectedVersion of [opened.data.offerVersion, undefined, "", null, 123, "malformed"]) {
    const result = await s.call("put", { ...old, expectedVersion });
    assert.equal(result.code, 409);
    assert.equal(result.data.details.code, "OFFER_VERSION_CONFLICT");
    assert.deepEqual(s.current(), before);
  }
  assert.equal(s.writes(), 0); assert.equal(s.audits(), 0);
  assert.equal((await s.call("put", old, true)).code, 403);
});
test("queued writes compare against latest raw record; sequential save uses returned version and preserves normalizer behavior", async () => {
  const s = setup(), opened = await s.call("get"), body = opened.data.offer;
  const expectedVersion = opened.data.offerVersion;
  const [first, stale] = await Promise.all([s.call("put", { ...body, notes: "First save", expectedVersion }), s.call("put", { ...body, expectedVersion })]);
  assert.equal(first.code, 200); assert.equal(stale.code, 409);
  assert.equal(s.writes(), 1); assert.equal(s.audits(), 1);
  assert.equal(first.data.offerVersion, offerRecordVersion(s.current()));
  for (const key of ["hotels", "flights", "finalPrice", "markupPercent", "validationWarnings"]) assert.deepEqual(first.data.offer[key], body[key]);
  const next = await s.call("put", { ...first.data.offer, notes: "Second save", expectedVersion: first.data.offerVersion });
  assert.equal(next.code, 200); assert.equal(next.data.offer.notes, "Second save");
  assert.equal(next.data.offerVersion, offerRecordVersion(s.current()));
  assert.equal(s.writes(), 2);
});
test("admin sends opening version, preserves edits on conflict, resets token on exit", async () => {
  const admin = fs.readFileSync(path.resolve(__dirname, "../public/admin.js"), "utf8");
  let mode, payload;
  const ctx = vm.createContext({ fetchJson: async () => ({ offer: { id: "QA" }, offerVersion: "opening-token" }), populateForm: () => {}, setEditMode: (...args) => { mode = args; }, window: { scrollTo: () => {} }, alert: () => {} });
  vm.runInContext(admin.slice(admin.indexOf("async function editOffer(id)"), admin.indexOf("function cancelEdit()")), ctx);
  await ctx.editOffer("QA"); assert.deepEqual(Array.from(mode), ["QA", "opening-token"]);
  const start = admin.indexOf("    const wasEditing = Boolean(editingOfferId);"), end = admin.indexOf("    alert(wasEditing ?", start);
  const save = vm.createContext({ editingOfferId: "QA", editingOfferVersion: "opening-token", payload: { hotels: [{ id: "hotel-exact" }] }, fetchJson: async (url, options) => { payload = JSON.parse(options.body); throw new Error("409"); } });
  await assert.rejects(vm.runInContext(`(async()=>{${admin.slice(start, end)}})()`, save), /409/);
  assert.equal(payload.expectedVersion, "opening-token");
  assert.equal(save.editingOfferVersion, "opening-token");
  assert.match(admin, /editingOfferVersion = offerId \? offerVersion : null/);
});

test("actual view/PDF/click tracking does not conflict and PUT preserves latest telemetry instead of stale body", async () => {
  const s = setup(), opened = await s.call("get");
  await s.call("view"); await s.call("pdf"); await s.call("click");
  const tracked = s.current();
  assert.equal(tracked.clientViews, 1); assert.equal(tracked.clientViewed, true);
  assert.equal(tracked.pdfDownloads, 1); assert.equal(tracked.clicks, 1);
  assert.equal(offerRecordVersion(tracked), opened.data.offerVersion);
  const saved = await s.call("put", { ...opened.data.offer, notes: "Editorial change", clientViews: 0, clientViewed: false, pdfDownloads: 0, clicks: 0, expectedVersion: opened.data.offerVersion });
  assert.equal(saved.code, 200);
  for (const key of ["clientViews", "clientViewed", "pdfDownloads", "clicks"]) assert.equal(saved.data.offer[key], tracked[key]);
  assert.equal(saved.data.offer.notes, "Editorial change");
  for (const key of ["hotels", "flights", "finalPrice", "markupPercent", "validationWarnings"]) assert.deepEqual(saved.data.offer[key], opened.data.offer[key]);
});
test("sent-to-viewed transition remains a real conflict without PUT mutation", async () => {
  const s = setup(); s.change(o => { o.status = "sent"; });
  const opened = await s.call("get"); await s.call("view");
  const before = s.current(), writes = s.writes(), audits = s.audits();
  assert.equal(before.status, "viewed");
  const result = await s.call("put", { ...opened.data.offer, expectedVersion: opened.data.offerVersion });
  assert.equal(result.code, 409); assert.equal(result.data.details.code, "OFFER_VERSION_CONFLICT");
  assert.deepEqual(s.current(), before); assert.equal(s.writes(), writes); assert.equal(s.audits(), audits);
});
test("only allowlisted top-level tracking fields are excluded; editorial, audit-like and unknown fields conflict", async () => {
  const mutations = [o => o.hotels[0].id = "changed", o => o.hotels[0].images.push("https://example.test/synthetic.jpg"),
    o => o.hotels[0].occupancy.confirmed = false, o => o.hotels[0].price++, o => o.flights[0].route = "SOF -> LHR",
    o => o.finalPrice++, o => o.status = "booked", o => o.bookedAt = "2026-11-11", o => o.notes = "changed",
    o => o.validationWarnings.push("real warning"), o => o.warningsDismissed = true,
    o => o.auditEvents = [{ type: "unknown" }], o => o.events = ["unknown"], o => o.customEditorialField = "new",
    o => o.createdAt = "changed", o => o.proposalInput = { clientViews: 2 }];
  for (const mutate of mutations) {
    const s = setup(), opened = await s.call("get"); s.change(mutate);
    const before = s.current();
    assert.notEqual(offerRecordVersion(before), opened.data.offerVersion);
    const result = await s.call("put", { ...opened.data.offer, expectedVersion: opened.data.offerVersion });
    assert.equal(result.code, 409); assert.equal(result.data.details.code, "OFFER_VERSION_CONFLICT");
    assert.deepEqual(s.current(), before); assert.equal(s.writes(), 0); assert.equal(s.audits(), 0);
  }
  const offer = { id: "QA", status: "draft" }, original = clone(offer);
  assert.equal(offerRecordVersion({ ...offer, updatedAt: "tracking-time" }), offerRecordVersion(offer));
  assert.deepEqual(offer, original);
});
