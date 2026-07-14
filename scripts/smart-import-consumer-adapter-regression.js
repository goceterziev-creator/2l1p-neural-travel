"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const { adaptSmartImportForProduct } = require("../gt63-core/smart-import-consumer-adapter");
const {
  createFixtureProvider,
  createLiveSmartImportProvider,
  loadProductModel
} = require("../gt63-core/core-data-provider");

const fixtureDir = path.join(__dirname, "..", "test", "fixtures", "smart-import");
const mockShellPath = path.join(__dirname, "..", "gt63-core", "mock-shell.html");
const mockReviewPath = path.join(__dirname, "..", "gt63-core", "mock-review.html");
const mockProposalPreviewPath = path.join(__dirname, "..", "gt63-core", "mock-proposal-preview.html");
const expectedProductKeys = ["blockingIssues", "flight", "hotel", "readiness", "warnings"];

function readFixture(name) {
  return JSON.parse(fs.readFileSync(path.join(fixtureDir, name), "utf8"));
}

function createFetchResponse(payload, ok = true, status = 200) {
  return {
    ok,
    status,
    async json() {
      return payload;
    }
  };
}

function assertProductModelShape(model, label) {
  assert.deepStrictEqual(Object.keys(model).sort(), expectedProductKeys, `${label} product model must expose only flight, hotel, warnings, readiness and blockingIssues`);
  assert.ok(["ready", "review"].includes(model.readiness), `${label} product model must expose product readiness`);
  assert.ok(Array.isArray(model.warnings), `${label} product model must expose warnings array`);
  assert.ok(Array.isArray(model.blockingIssues), `${label} product model must expose blockingIssues array`);
  assert.equal(Object.prototype.hasOwnProperty.call(model, "debug"), false, `${label} product model must not leak debug`);
  assert.equal(Object.prototype.hasOwnProperty.call(model, "contractVersion"), false, `${label} product model must not leak engine contract version`);
  assert.equal(Object.prototype.hasOwnProperty.call(model, "classifications"), false, `${label} product model must not leak classifications`);
  assert.equal(Object.prototype.hasOwnProperty.call(model, "sources"), false, `${label} product model must not leak sources`);
}

const flightOnly = adaptSmartImportForProduct(readFixture("flight-only.json"));
assertProductModelShape(flightOnly, "flight-only");
assert.equal(flightOnly.readiness, "ready", "flight-only fixture should be ready");
assert.deepStrictEqual(flightOnly.blockingIssues, [], "flight-only fixture should not expose blocking issues");
assert.equal(flightOnly.flight.route, "SOF -> MLE / MLE -> SOF", "flight-only fixture should expose flight data");
assert.equal(flightOnly.hotel, null, "flight-only fixture should not expose hotel data");
assert.deepStrictEqual(flightOnly.warnings, [], "flight-only fixture should not expose warnings");

const hotelOnly = adaptSmartImportForProduct(readFixture("hotel-only.json"));
assertProductModelShape(hotelOnly, "hotel-only");
assert.equal(hotelOnly.readiness, "ready", "hotel-only fixture should be ready");
assert.deepStrictEqual(hotelOnly.blockingIssues, [], "hotel-only fixture should not expose blocking issues");
assert.equal(hotelOnly.flight, null, "hotel-only fixture should not expose flight data");
assert.equal(hotelOnly.hotel.name, "Conrad Maldives Rangali Island", "hotel-only fixture should expose hotel data");
assert.deepStrictEqual(hotelOnly.warnings, [], "hotel-only fixture should not expose warnings");

const mixed = adaptSmartImportForProduct(readFixture("flight-hotel-mixed.json"));
assertProductModelShape(mixed, "mixed");
assert.equal(mixed.readiness, "ready", "mixed fixture should stay ready when it has warnings but no blocking issues");
assert.deepStrictEqual(mixed.blockingIssues, [], "mixed fixture warning should not become a blocking issue");
assert.equal(mixed.flight.airline, "Emirates", "mixed fixture should expose flight data");
assert.equal(mixed.hotel.name, "Patina Maldives", "mixed fixture should expose hotel data");
assert.ok(mixed.warnings.some((warning) => warning.includes("Mixed screenshots")), "mixed fixture should preserve warning text");
assert.ok(mixed.warnings.some((warning) => warning.includes("Final operator review is recommended")), "mixed fixture warning must recommend review without blocking preview");

const unknown = adaptSmartImportForProduct(readFixture("unknown-partial-failure.json"));
assertProductModelShape(unknown, "unknown");
assert.equal(unknown.readiness, "review", "unknown fixture should require review");
assert.ok(unknown.blockingIssues.some((issue) => issue.includes("could not be identified")), "unknown fixture should expose unknown source blocking issue");
assert.equal(unknown.flight.route, "SOF -> BRI / BRI -> SOF", "unknown fixture should preserve successful partial flight data");
assert.equal(unknown.hotel, null, "unknown fixture should not invent hotel data");
assert.ok(unknown.warnings.length >= 1, "unknown fixture should preserve actionable warnings");

const empty = adaptSmartImportForProduct({});
assertProductModelShape(empty, "empty");
assert.deepStrictEqual(empty, {
  flight: null,
  hotel: null,
  warnings: [],
  readiness: "review",
  blockingIssues: ["No travel data extracted"]
}, "empty or invalid contract should degrade to review without throwing");

(async function runProviderRegression() {
  const fixtureProvider = createFixtureProvider({
    fetchImpl: async (fixtureUrl) => {
      assert.equal(fixtureUrl, "fixture://mixed", "fixture provider should load the requested fixture URL");
      return createFetchResponse(readFixture("flight-hotel-mixed.json"));
    }
  });
  const fixtureModel = await fixtureProvider.loadProductModel({ fixtureUrl: "fixture://mixed" });
  assertProductModelShape(fixtureModel, "fixture-provider");
  assert.equal(fixtureModel.readiness, "ready", "fixture provider should return ready product model");
  assert.equal(fixtureModel.flight.airline, "Emirates", "fixture provider should return flight data");
  assert.equal(fixtureModel.hotel.name, "Patina Maldives", "fixture provider should return hotel data");

  const liveProvider = createLiveSmartImportProvider({
    endpoint: "https://engine.example.test/smart-import",
    fetchImpl: async (endpoint, request) => {
      assert.equal(endpoint, "https://engine.example.test/smart-import", "live provider should use configured endpoint");
      assert.equal(request.method, "POST", "live provider should POST to the engine");
      return createFetchResponse(readFixture("flight-only.json"));
    }
  });
  const liveModel = await liveProvider.loadProductModel({ request: { intakeId: "demo" } });
  assertProductModelShape(liveModel, "live-provider");
  assert.equal(liveModel.readiness, "ready", "live provider should return ready product model");
  assert.equal(liveModel.flight.route, "SOF -> MLE / MLE -> SOF", "live provider should adapt engine contract through product model");
  assert.equal(liveModel.hotel, null, "live provider should preserve absent hotel data");

  const defaultModel = await loadProductModel(
    { provider: "fixture", fixtureUrl: "fixture://hotel" },
    {
      fetchImpl: async () => createFetchResponse(readFixture("hotel-only.json"))
    }
  );
  assertProductModelShape(defaultModel, "default-provider");
  assert.equal(defaultModel.hotel.name, "Conrad Maldives Rangali Island", "loadProductModel should use fixture provider by default");
})().then(() => {

const mockShellHtml = fs.readFileSync(mockShellPath, "utf8");
assert.match(mockShellHtml, /GT63 Core Mock Shell/, "mock shell should exist");
assert.match(mockShellHtml, /smart-import-consumer-adapter\.js/, "mock shell must use the existing adapter file");
assert.match(mockShellHtml, /core-data-provider\.js/, "mock shell must use the Core Data Provider");
assert.match(mockShellHtml, /loadProductModel/, "mock shell must load product model through the provider");
for (const fixtureName of [
  "flight-only.json",
  "hotel-only.json",
  "flight-hotel-mixed.json",
  "unknown-partial-failure.json"
]) {
  assert.match(mockShellHtml, new RegExp(fixtureName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `mock shell must reference ${fixtureName}`);
}
assert.ok(!mockShellHtml.match(/\/api\/|Gemini request|SerpAPI request|multipart\/form-data|generate PDF/i), "mock shell must not call production APIs, uploads, providers or PDF generation");

const mockReviewHtml = fs.readFileSync(mockReviewPath, "utf8");
assert.match(mockReviewHtml, /GT63 Core Mock Review/, "mock review should exist");
assert.match(mockReviewHtml, /smart-import-consumer-adapter\.js/, "mock review must use the existing adapter file");
assert.match(mockReviewHtml, /core-data-provider\.js/, "mock review must use the Core Data Provider");
assert.match(mockReviewHtml, /loadProductModel/, "mock review must load product model through the provider");
assert.match(mockReviewHtml, /Flight Review/, "mock review must include flight review section");
assert.match(mockReviewHtml, /Hotel Review/, "mock review must include hotel review section");
assert.match(mockReviewHtml, /Warnings/, "mock review must include warnings section");
assert.match(mockReviewHtml, /Blocking Issues/, "mock review must include blocking issues section");
assert.match(mockReviewHtml, /Continue to Proposal/, "mock review must include ready next action");
assert.match(mockReviewHtml, /Needs operator action/, "mock review must include review next action");
assert.match(mockReviewHtml, /Show Product Model/, "mock review may expose product model behind a hidden debug toggle");
for (const fixtureName of [
  "flight-only.json",
  "hotel-only.json",
  "flight-hotel-mixed.json",
  "unknown-partial-failure.json"
]) {
  assert.match(mockReviewHtml, new RegExp(fixtureName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `mock review must reference ${fixtureName}`);
}
assert.ok(!mockReviewHtml.match(/fetch\(["']\/api|\/api\/|multipart\/form-data|FormData|api\/offers|api\/smart-import|\.pdf/i), "mock review must not call production APIs, uploads, providers, PDF, WhatsApp or Offer Engine");

const mockProposalPreviewHtml = fs.readFileSync(mockProposalPreviewPath, "utf8");
assert.match(mockProposalPreviewHtml, /GT63 Core Mock Proposal Preview/, "mock proposal preview should exist");
assert.match(mockProposalPreviewHtml, /smart-import-consumer-adapter\.js/, "mock proposal preview must use the existing adapter file");
assert.match(mockProposalPreviewHtml, /core-data-provider\.js/, "mock proposal preview must use the Core Data Provider");
assert.match(mockProposalPreviewHtml, /loadProductModel/, "mock proposal preview must load product model through the provider");
assert.match(mockProposalPreviewHtml, /Readiness Gate/, "mock proposal preview must include readiness gate");
assert.match(mockProposalPreviewHtml, /Preview enabled/, "mock proposal preview must include ready state");
assert.match(mockProposalPreviewHtml, /Preview disabled/, "mock proposal preview must include review state");
assert.match(mockProposalPreviewHtml, /Blocking Issues/, "mock proposal preview must show blocking issues");
assert.match(mockProposalPreviewHtml, /Client Preview/, "mock proposal preview must include client preview section");
assert.match(mockProposalPreviewHtml, /Show Product Model/, "mock proposal preview may expose product model behind a hidden debug toggle");
for (const fixtureName of [
  "flight-only.json",
  "hotel-only.json",
  "flight-hotel-mixed.json",
  "unknown-partial-failure.json"
]) {
  assert.match(mockProposalPreviewHtml, new RegExp(fixtureName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `mock proposal preview must reference ${fixtureName}`);
}
assert.ok(!mockProposalPreviewHtml.match(/fetch\(["']\/api|\/api\/|multipart\/form-data|FormData|api\/offers|api\/smart-import|\.pdf|WhatsApp/i), "mock proposal preview must not call production APIs, uploads, providers, PDF, WhatsApp or Offer Engine");

console.log("SMART IMPORT CONSUMER ADAPTER REGRESSION PASS");
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
