"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const {
  createFixtureProvider,
  createLiveSmartImportProvider
} = require("../gt63-core/core-data-provider");

const fixtureDir = path.join(__dirname, "..", "test", "fixtures", "smart-import");
const productDir = path.join(__dirname, "..", "gt63-core", "product");
const expectedProductKeys = ["blockingIssues", "flight", "hotel", "hotelOptions", "readiness", "warnings"];

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

function assertProductModel(model, label) {
  assert.deepStrictEqual(Object.keys(model).sort(), expectedProductKeys, `${label} should expose only GT63 product model keys`);
  assert.ok(["ready", "review"].includes(model.readiness), `${label} should expose readiness`);
  assert.ok(Array.isArray(model.warnings), `${label} should expose warnings array`);
  assert.ok(Array.isArray(model.blockingIssues), `${label} should expose blockingIssues array`);
}

function previewEnabled(model) {
  return model.readiness === "ready" && model.blockingIssues.length === 0;
}

function assertReadyFlow(model, label) {
  assertProductModel(model, label);
  assert.equal(model.readiness, "ready", `${label} should be ready`);
  assert.deepStrictEqual(model.blockingIssues, [], `${label} should not have blocking issues`);
  assert.equal(previewEnabled(model), true, `${label} should enable preview`);
}

function assertReviewFlow(model, label) {
  assertProductModel(model, label);
  assert.equal(model.readiness, "review", `${label} should require review`);
  assert.ok(model.blockingIssues.length >= 1, `${label} should explain why preview is blocked`);
  assert.equal(previewEnabled(model), false, `${label} should disable preview`);
}

function readProductFile(name) {
  return fs.readFileSync(path.join(productDir, name), "utf8");
}

async function loadFixtureModel(fixtureName) {
  const provider = createFixtureProvider({
    fetchImpl: async (fixtureUrl) => createFetchResponse(readFixture(fixtureUrl))
  });
  return provider.loadProductModel({ fixtureUrl: fixtureName });
}

async function main() {
  const flightOnly = await loadFixtureModel("flight-only.json");
  assertReadyFlow(flightOnly, "flight-only");
  assert.ok(flightOnly.flight, "flight-only should include flight");
  assert.equal(flightOnly.hotel, null, "flight-only should not include hotel");

  const hotelOnly = await loadFixtureModel("hotel-only.json");
  assertReadyFlow(hotelOnly, "hotel-only");
  assert.equal(hotelOnly.flight, null, "hotel-only should not include flight");
  assert.ok(hotelOnly.hotel, "hotel-only should include hotel");

  const mixed = await loadFixtureModel("flight-hotel-mixed.json");
  assertReadyFlow(mixed, "flight-hotel-mixed");
  assert.ok(mixed.flight, "mixed should include flight");
  assert.ok(mixed.hotel, "mixed should include hotel");
  assert.ok(mixed.warnings.length >= 1, "mixed should preserve non-blocking warning");

  const partialFailure = await loadFixtureModel("unknown-partial-failure.json");
  assertReviewFlow(partialFailure, "unknown-partial-failure");
  assert.ok(partialFailure.flight, "partial failure should preserve successful partial extraction");

  const fakeFormData = { marker: "live-upload-form-data" };
  const liveProvider = createLiveSmartImportProvider({
    fetchImpl: async (endpoint, request) => {
      assert.equal(endpoint, "/api/smart-import", "live smoke should target Smart Import endpoint");
      assert.equal(request.method, "POST", "live smoke should POST to Smart Import");
      assert.equal(request.body, fakeFormData, "live smoke should pass upload payload to provider");
      return createFetchResponse(readFixture("flight-hotel-mixed.json"));
    }
  });
  const liveModel = await liveProvider.loadProductModel({ formData: fakeFormData });
  assertReadyFlow(liveModel, "live-smart-import");
  assert.ok(liveModel.flight && liveModel.hotel, "live smart import should adapt to same product model shape");

  const indexHtml = readProductFile("index.html");
  const appJs = readProductFile("app.js");
  const stylesCss = readProductFile("styles.css");
  const flightDisplayJs = fs.readFileSync(path.join(__dirname, "..", "gt63-core", "flight-display-bg.js"), "utf8");
  const offerAdapterJs = fs.readFileSync(path.join(__dirname, "..", "gt63-core", "offer-engine-adapter.js"), "utf8");
  const proposalAdapterJs = fs.readFileSync(path.join(__dirname, "..", "gt63-core", "proposal-input-adapter.js"), "utf8");
  const luxuryRendererJs = fs.readFileSync(path.join(__dirname, "..", "gt63-core", "luxury-v11-renderer.js"), "utf8");

  assert.match(indexHtml, /GT63 Core/, "product shell should identify GT63 Core");
  assert.match(indexHtml, /Travel Proposal Intelligence Platform/, "product shell should expose product language");
  assert.match(indexHtml, /SYSTEM ONLINE/, "product shell should expose product status language");
  assert.match(indexHtml, /core-data-provider\.js/, "product shell should load Core Data Provider");
  assert.match(indexHtml, /flight-display-bg\.js/, "product shell should load Bulgarian flight display adapter");
  assert.match(indexHtml, /proposal-input-adapter\.js/, "product shell should load proposal input adapter");
  assert.match(indexHtml, /offer-engine-adapter\.js/, "product shell should load Offer Engine adapter");
  assert.match(indexHtml, /luxury-v11-renderer\.js/, "product shell should load Luxury V11 renderer");
  assert.match(indexHtml, /app\.js/, "product shell should load product app");
  assert.match(indexHtml, /DEV/, "product shell should mark provider mode as development control");
  assert.match(indexHtml, /Start Smart Import/, "product shell should expose the start action");
  assert.match(indexHtml, /Client Phone/, "product shell should expose client phone control");
  assert.match(indexHtml, /Margin %/, "product shell should expose margin control");
  assert.match(indexHtml, /Client Price Breakdown/, "product shell should expose client price breakdown");
  assert.match(indexHtml, /pricingFinal/, "product shell should expose final price state");
  assert.match(indexHtml, /Guests/, "product shell should expose guests control");
  assert.match(indexHtml, /Mission Card/, "product shell should expose the operator mission card");
  assert.match(indexHtml, /missionClient/, "product shell should expose mission client state");
  assert.match(indexHtml, /missionAction/, "product shell should expose mission next action state");
  assert.match(indexHtml, /Approve Review Changes/, "product shell should expose review approval action");
  assert.match(indexHtml, /Edit Again/, "product shell should expose approved draft edit action");
  assert.match(indexHtml, /Reset to Extracted/, "product shell should expose reset-to-extracted action");
  assert.match(indexHtml, /Continue to Preview/, "product shell should expose the preview action");
  assert.match(indexHtml, /Proposal Preview/, "product shell should expose preview area");
  assert.match(indexHtml, /Create Offer in 2L1P/, "product shell should expose Create Offer action");

  assert.match(appJs, /loadProductModel/, "product shell app should use Core Data Provider");
  assert.match(appJs, /provider: "fixture"/, "product shell app should support fixture provider");
  assert.match(appJs, /provider: "live"/, "product shell app should support live provider");
  assert.match(appJs, /buildProposalInputFromProductModel/, "product shell app should build V11 proposal input");
  assert.match(appJs, /buildOfferPayloadFromProductModel/, "product shell app should use Offer Engine adapter");
  assert.match(appJs, /GT63FlightDisplayBg/, "product shell app should use Bulgarian flight display adapter");
  assert.match(appJs, /marginPercent/, "product shell app should use margin percent context");
  assert.match(appJs, /marginAmount/, "product shell app should calculate margin amount for operator display");
  assert.match(appJs, /renderPricing/, "product shell app should render pricing breakdown");
  assert.match(appJs, /clientPhone/, "product shell app should pass client phone context");
  assert.match(appJs, /isPhoneLike/, "product shell app should guard against phone-like destination values");
  assert.match(appJs, /originalModel/, "product shell app should preserve original extracted model");
  assert.match(appJs, /reviewedModel/, "product shell app should create reviewed product model");
  assert.match(appJs, /renderMission/, "product shell app should render the operator mission card");
  assert.match(appJs, /missionDestination/, "product shell app should keep mission destination safe");
  assert.match(appJs, /offerReadinessIssues/, "product shell app should guard final offer creation");
  assert.match(appJs, /Client name is required before creating an offer/, "product shell app should require client context before Create Offer");
  assert.match(appJs, /Review changes must be approved before creating an offer/, "product shell app should require approved review before Create Offer");
  assert.match(appJs, /data-review-path/, "product shell app should render editable review fields");
  assert.match(appJs, /applyReviewChanges/, "product shell app should apply operator corrections");
  assert.match(appJs, /editApprovedModelAgain/, "product shell app should allow editing approved models again");
  assert.match(appJs, /resetReviewToExtracted/, "product shell app should allow resetting review draft to extracted data");
  assert.match(appJs, /addFlightSegment/, "product shell app should allow adding flight segments");
  assert.match(appJs, /removeFlightSegment/, "product shell app should allow removing flight segments");
  assert.match(appJs, /removeHotelOption/, "product shell app should allow removing hotel options");
  assert.match(appJs, /draftFromReviewFields/, "product shell app should preserve current review edits before structural changes");
  assert.match(appJs, /renderLuxuryProposal/, "product shell app should render Luxury V11 preview");
  assert.match(appJs, /fetch\("\/api\/offers"/, "product shell app should create offers through existing Offer Engine API");
  assert.match(appJs, /\/gt63-core\/fixtures\/smart-import\//, "product shell app should support hosted fixture URLs");
  assert.match(appJs, /Live Smart Import needs a server URL/, "product shell app should explain file protocol live endpoint limits");
  assert.match(appJs, /readiness === "ready"/, "product shell app should gate preview by readiness");
  assert.match(appJs, /Preview disabled until readiness is READY/, "product shell app should disable preview when review is required");
  assert.ok(!appJs.match(/nodes\.destination\.value = ""/), "product shell app must not silently clear invalid destination values");
  assert.ok(!appJs.match(/adaptSmartImportForProduct|contractVersion|classifications|sources|debug|metadata|universalIntakeDeprecated|Gemini|SerpAPI/i), "product shell app must not read engine or diagnostic fields");
  assert.ok(!appJs.match(/api\/clients|api\/activities|generate PDF|WhatsApp/i), "product shell app must not call unrelated product services");

  assert.match(offerAdapterJs, /flightAirline/, "offer adapter should map flight fields to Offer Engine payload");
  assert.match(offerAdapterJs, /flights: offerFlights/, "offer adapter should pass structured flights to Offer Engine");
  assert.match(offerAdapterJs, /flightOutboundSegments/, "offer adapter should pass outbound segments to Offer Engine");
  assert.match(offerAdapterJs, /hotelName/, "offer adapter should map hotel fields to Offer Engine payload");
  assert.match(offerAdapterJs, /context\.marginPercent/, "offer adapter should pass operator margin percent to Offer Engine");
  assert.match(offerAdapterJs, /safeDestination/, "offer adapter should sanitize destination candidates");
  assert.ok(!offerAdapterJs.match(/contractVersion|classifications|sources|debug|metadata|universalIntakeDeprecated/i), "offer adapter must not read engine contract internals");

  assert.match(proposalAdapterJs, /marginPercent/, "proposal adapter should expose margin percent in preview pricing");
  assert.match(flightDisplayJs, /Летище София/, "Bulgarian flight display should contain airport names");
  assert.match(flightDisplayJs, /renderSegmentHtml/, "Bulgarian flight display should render segment HTML");
  assert.match(luxuryRendererJs, /GT63FlightDisplayBg/, "luxury preview should use Bulgarian flight display when available");

  assert.match(stylesCss, /mission-card|pricing-card|pricing-grid|v11-proposal|v11-hero|preview-shell|gate-message/s, "product shell styles should cover the V11 product workflow");
  assert.match(stylesCss, /inline-action|inline-danger|review-subsection-heading/s, "product shell styles should cover structural review controls");

  console.log("GT63 CORE E2E SMOKE PASS");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
