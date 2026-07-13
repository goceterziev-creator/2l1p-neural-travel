"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const { adaptSmartImportForProduct } = require("../gt63-core/smart-import-consumer-adapter");

const fixtureDir = path.join(__dirname, "..", "test", "fixtures", "smart-import");

function readFixture(name) {
  return JSON.parse(fs.readFileSync(path.join(fixtureDir, name), "utf8"));
}

const flightOnly = adaptSmartImportForProduct(readFixture("flight-only.json"));
assert.equal(flightOnly.readiness, "ready", "flight-only fixture should be ready");
assert.equal(flightOnly.flight.route, "SOF -> MLE / MLE -> SOF", "flight-only fixture should expose flight data");
assert.equal(flightOnly.hotel, null, "flight-only fixture should not expose hotel data");
assert.deepStrictEqual(flightOnly.warnings, [], "flight-only fixture should not expose warnings");

const hotelOnly = adaptSmartImportForProduct(readFixture("hotel-only.json"));
assert.equal(hotelOnly.readiness, "ready", "hotel-only fixture should be ready");
assert.equal(hotelOnly.flight, null, "hotel-only fixture should not expose flight data");
assert.equal(hotelOnly.hotel.name, "Conrad Maldives Rangali Island", "hotel-only fixture should expose hotel data");
assert.deepStrictEqual(hotelOnly.warnings, [], "hotel-only fixture should not expose warnings");

const mixed = adaptSmartImportForProduct(readFixture("flight-hotel-mixed.json"));
assert.equal(mixed.readiness, "review", "mixed fixture should require review when engine returns warnings");
assert.equal(mixed.flight.airline, "Emirates", "mixed fixture should expose flight data");
assert.equal(mixed.hotel.name, "Patina Maldives", "mixed fixture should expose hotel data");
assert.ok(mixed.warnings.some((warning) => warning.includes("Mixed screenshots")), "mixed fixture should preserve warning text");

const unknown = adaptSmartImportForProduct(readFixture("unknown-partial-failure.json"));
assert.equal(unknown.readiness, "review", "unknown fixture should require review");
assert.equal(unknown.flight.route, "SOF -> BRI / BRI -> SOF", "unknown fixture should preserve successful partial flight data");
assert.equal(unknown.hotel, null, "unknown fixture should not invent hotel data");
assert.ok(unknown.warnings.length >= 1, "unknown fixture should preserve actionable warnings");

const empty = adaptSmartImportForProduct({});
assert.deepStrictEqual(empty, {
  flight: null,
  hotel: null,
  warnings: [],
  readiness: "review"
}, "empty or invalid contract should degrade to review without throwing");

console.log("SMART IMPORT CONSUMER ADAPTER REGRESSION PASS");
