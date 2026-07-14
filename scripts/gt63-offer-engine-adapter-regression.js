"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const {
  createFixtureProvider
} = require("../gt63-core/core-data-provider");
const {
  buildOfferPayloadFromProductModel
} = require("../gt63-core/offer-engine-adapter");

const fixtureDir = path.join(__dirname, "..", "test", "fixtures", "smart-import");

function readFixture(name) {
  return JSON.parse(fs.readFileSync(path.join(fixtureDir, name), "utf8"));
}

function createFetchResponse(payload) {
  return {
    ok: true,
    status: 200,
    async json() {
      return payload;
    }
  };
}

async function loadModel(fixtureName) {
  const provider = createFixtureProvider({
    fetchImpl: async () => createFetchResponse(readFixture(fixtureName))
  });
  return provider.loadProductModel({ fixtureUrl: fixtureName });
}

async function main() {
  const model = await loadModel("flight-hotel-mixed.json");
  const payload = buildOfferPayloadFromProductModel(model, {
    clientName: "GT63 Test Client",
    destination: "Maldives",
    travelDates: "15-22 March 2027",
    guests: "2 adults",
    marginPercent: 12.5
  });

  assert.equal(payload.clientName, "GT63 Test Client");
  assert.equal(payload.destination, "Maldives");
  assert.equal(payload.travelDates, "15-22 March 2027");
  assert.equal(payload.guests, "2 adults");
  assert.equal(payload.status, "draft");
  assert.equal(payload.currency, "EUR");
  assert.equal(payload.flightAirline, "Emirates");
  assert.ok(payload.flightRoute.includes("SOF"), "payload should include flight route");
  assert.ok(payload.flightDeparture, "payload should include flight departure");
  assert.ok(payload.flightArrival, "payload should include flight arrival");
  assert.ok(payload.flightPrice > 0, "payload should include flight price");
  assert.ok(Array.isArray(payload.flights), "payload should include structured flights array");
  assert.equal(payload.flights.length, 1, "payload should include one structured flight option");
  assert.equal(payload.flights[0].outboundSegments.length, 1, "payload should preserve outbound segments");
  assert.equal(payload.flights[0].inboundSegments.length, 1, "payload should preserve inbound segments");
  assert.equal(payload.flightOutboundSegments.length, 1, "payload should expose legacy outbound segments");
  assert.equal(payload.flightInboundSegments.length, 1, "payload should expose legacy inbound segments");
  assert.equal(payload.hotelName, "Patina Maldives");
  assert.ok(payload.hotelPrice > 0, "payload should include hotel price");
  assert.ok(Array.isArray(payload.hotelImages), "payload should expose hotelImages array");
  assert.equal(payload.markupPercent, 12.5);
  assert.equal(payload.validForDays, 1);
  assert.ok(!Object.keys(payload).includes("contractVersion"), "payload must not leak Smart Import contract fields");
  assert.ok(!Object.keys(payload).includes("debug"), "payload must not leak debug fields");

  console.log("GT63 OFFER ENGINE ADAPTER REGRESSION PASS");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
