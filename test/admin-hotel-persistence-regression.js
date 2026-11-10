"use strict";
const test = require("node:test"), assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const source = fs.readFileSync(path.join(__dirname, "../public/admin.js"), "utf8");
const block = source.slice(source.indexOf("function hotelPersistenceEditorSnapshot()"), source.indexOf("function renderHotelCards()"));
function setup() {
  const calls = [], alerts = [], confirmations = [], prompts = [], field = { id: "notes", value: "original", checked: false, disabled: false };
  let allowed = true, accepted = true, handler = async body => ({ success: true, changed: true, offer: { id: "QA", hotels: [{ id: "exact-id", name: "Same name", images: [] }], flights: [] }, offerVersion: "version-2" });
  const ctx = vm.createContext({ editingOfferId: "QA", editingOfferVersion: "version-1", hotels: [{ id: "", name: "Same name", images: [] }], flights: [],
    hotelPersistenceUI: { busy: false, pending: null, reloadRequired: false, snapshot: null },
    document: { querySelectorAll: () => [field] }, URL, crypto: { randomUUID: () => "test-operation-00001" },
    hasCapability: () => allowed, alert: x => alerts.push(x), confirm: x => { confirmations.push(x); return accepted; }, prompt: () => prompts.shift(), renderHotelCards: () => {},
    fetchJson: async (url, options) => { const body = JSON.parse(options.body); calls.push({ url, body }); return handler(body); }
  });
  ctx.populateForm = offer => { ctx.hotels = offer.hotels; ctx.flights = offer.flights; };
  ctx.setEditMode = (id, version) => { ctx.editingOfferId = id; ctx.editingOfferVersion = version; ctx.resetHotelPersistenceEditor(); };
  vm.runInContext(block, ctx); ctx.resetHotelPersistenceEditor();
  return { ctx, calls, alerts, confirmations, prompts, field, deny: () => { allowed = false; }, cancel: () => { accepted = false; }, handler: fn => { handler = fn; } };
}
test("identity UI requires explicit confirmation and adopts returned IDs/version", async () => {
  const s = setup(); await s.ctx.confirmPersistedHotelIdentities();
  assert.equal(s.confirmations.length, 1); assert.equal(s.calls.length, 1);
  assert.equal(s.calls[0].url, "/api/offers/QA/hotel-persistence/identity");
  assert.equal(s.calls[0].body.expectedVersion, "version-1"); assert.equal(s.calls[0].body.confirmedHotelIdentity, true);
  assert.equal(s.ctx.editingOfferVersion, "version-2"); assert.equal(s.ctx.hotels[0].id, "exact-id"); assert.equal(s.ctx.hotelPersistenceUI.pending, null);
});
test("image UI uses exact saved ID, reviewed originals and explicit source; next action uses new version", async () => {
  const s = setup(); await s.ctx.confirmPersistedHotelIdentities();
  s.prompts.push("https://example.test/reviewed.jpg", "hotel-lookup");
  await s.ctx.persistReviewedHotelImages("exact-id");
  const call = s.calls[1]; assert.equal(call.url, "/api/offers/QA/hotel-persistence/images");
  assert.equal(call.body.expectedVersion, "version-2"); assert.equal(call.body.hotelId, "exact-id");
  assert.equal(call.body.candidates[0].source, "hotel-lookup"); assert.equal(call.body.candidates[0].hotelId, "exact-id");
});
test("cancelled, unauthorized, dirty or unsaved editor sends no operation", async () => {
  for (const change of [s => s.cancel(), s => s.deny(), s => s.field.value = "unsaved", s => s.ctx.editingOfferId = null]) {
    const s = setup(); change(s); await s.ctx.confirmPersistedHotelIdentities(); assert.equal(s.calls.length, 0);
  }
});
test("images reject missing/duplicate IDs, arbitrary schemes, unsupported provenance and cancelled prompts", async () => {
  for (const config of [s => {}, s => { s.ctx.hotels = [{ id: "x" }, { id: "x" }]; },
    s => { s.ctx.hotels = [{ id: "x" }]; s.prompts.push("javascript:bad"); },
    s => { s.ctx.hotels = [{ id: "x" }]; s.prompts.push("https://example.test/a.jpg", "pdf-fallback"); },
    s => { s.ctx.hotels = [{ id: "x" }]; s.prompts.push(null); }]) {
    const s = setup(); config(s); s.ctx.resetHotelPersistenceEditor(); await s.ctx.persistReviewedHotelImages("x"); assert.equal(s.calls.length, 0);
  }
});
test("uncertain request retry preserves exact body/operation ID and accepts proven no-op", async () => {
  const s = setup(); s.handler(async () => { throw new Error("response lost"); });
  await s.ctx.confirmPersistedHotelIdentities(); assert(s.ctx.hotelPersistenceUI.pending);
  s.handler(async () => ({ success: true, changed: false, offer: { id: "QA", hotels: [{ id: "saved", images: [] }], flights: [] }, offerVersion: "replayed-version" }));
  await s.ctx.retryHotelPersistence(); assert.deepEqual(s.calls[0], s.calls[1]); assert.equal(s.ctx.editingOfferVersion, "replayed-version");
  assert.equal(s.ctx.hotelPersistenceUI.pending, null);
});
test("409 blocks retries and new actions until explicit reopen, preserving editor", async () => {
  const s = setup(); s.handler(async () => { throw Object.assign(new Error("stale"), { status: 409 }); });
  await s.ctx.confirmPersistedHotelIdentities(); assert.equal(s.ctx.hotelPersistenceUI.reloadRequired, true);
  assert.equal(s.ctx.editingOfferVersion, "version-1"); assert.equal(s.field.value, "original");
  await s.ctx.retryHotelPersistence(); await s.ctx.confirmPersistedHotelIdentities(); assert.equal(s.calls.length, 1);
  s.ctx.setEditMode("QA", "fresh-version"); assert.equal(s.ctx.hotelPersistenceUI.reloadRequired, false);
});
test("403 and 422 refuse operation without rebasing version or changing hotel data", async () => {
  for (const status of [403, 422]) {
    const s = setup(), before = JSON.stringify(s.ctx.hotels); s.handler(async () => { throw Object.assign(new Error("denied"), { status }); });
    await s.ctx.confirmPersistedHotelIdentities(); assert.equal(s.ctx.editingOfferVersion, "version-1");
    assert.equal(JSON.stringify(s.ctx.hotels), before); assert.equal(s.ctx.hotelPersistenceUI.pending, null);
  }
});
test("in-flight operations freeze controls and suppress duplicate submits", async () => {
  const s = setup(); let finish; s.handler(() => new Promise(resolve => { finish = resolve; }));
  const pending = s.ctx.confirmPersistedHotelIdentities(); assert.equal(s.field.disabled, true);
  await s.ctx.retryHotelPersistence(); assert.equal(s.calls.length, 1);
  finish({ success: true, offer: { id: "QA", hotels: [], flights: [] }, offerVersion: "new" }); await pending;
  assert.equal(s.field.disabled, false);
});
test("fetchJson retains HTTP status for conflict/denial handling", async () => {
  const ctx = vm.createContext({ fetch: async () => ({ ok: false, status: 409, headers: { get: () => "application/json" }, json: async () => ({ error: "conflict" }) }) });
  vm.runInContext(source.slice(source.indexOf("async function fetchJson("), source.indexOf("async function loadCurrentUser(")), ctx);
  await assert.rejects(ctx.fetchJson("/test"), error => error.status === 409);
});
test("actual hotel cards expose explicit actions only to authorized saved-offer editors with unique IDs", () => {
  const s = setup(), box = { innerHTML: "" };
  s.ctx.document.getElementById = () => box;
  s.ctx.dedupeHotelOptionImages = x => x;
  s.ctx.escapeHtml = x => String(x ?? "");
  s.ctx.AYAHotelOccupancy = require("../public/hotel-occupancy");
  vm.runInContext(source.slice(source.indexOf("function renderHotelCards()"), source.indexOf("function addHotel(", source.indexOf("function renderHotelCards()"))), s.ctx);
  s.ctx.renderHotelCards(); assert.match(box.innerHTML, /Confirm identities and assign missing IDs/);
  assert.doesNotMatch(box.innerHTML, /Review and persist verified images/);
  s.ctx.hotels[0].id = "exact"; s.ctx.renderHotelCards(); assert.match(box.innerHTML, /data-persist-hotel-id="exact"/);
  s.deny(); s.ctx.renderHotelCards(); assert.doesNotMatch(box.innerHTML, /hotel-persistence-actions|data-persist-hotel-id/);
});
