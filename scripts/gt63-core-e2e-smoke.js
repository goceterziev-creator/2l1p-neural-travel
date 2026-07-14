"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const {
  createFixtureProvider,
  createLiveSmartImportProvider
} = require("../gt63-core/core-data-provider");

const fixtureDir = path.join(__dirname, "..", "test", "fixtures", "smart-import");
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

  console.log("GT63 CORE E2E SMOKE PASS");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
