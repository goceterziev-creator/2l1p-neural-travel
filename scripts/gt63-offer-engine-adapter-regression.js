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
  assert.ok(Array.isArray(payload.hotels), "payload should expose hotel options array");
  assert.equal(payload.hotels.length, 1, "payload should include one hotel option by default");
  assert.equal(payload.markupPercent, 12.5);
  assert.equal(payload.validForDays, 1);
  assert.ok(!Object.keys(payload).includes("contractVersion"), "payload must not leak Smart Import contract fields");
  assert.ok(!Object.keys(payload).includes("debug"), "payload must not leak debug fields");

  const originalModel = await loadModel("flight-hotel-mixed.json");
  const reviewedModel = JSON.parse(JSON.stringify(originalModel));
  reviewedModel.flight.price = 1520;
  const reviewedPayload = buildOfferPayloadFromProductModel(reviewedModel, {
    clientName: "GT63 Test Client",
    destination: "Maldives",
    travelDates: "15-22 March 2027",
    guests: "2 adults"
  });

  assert.equal(originalModel.flight.price, 1475, "original extracted model should remain unchanged");
  assert.equal(reviewedModel.flight.price, 1520, "reviewed model should contain operator correction");
  assert.equal(reviewedPayload.flightPrice, 1520, "Offer Engine should receive reviewed flight price");

  const multiHotelModel = JSON.parse(JSON.stringify(originalModel));
  multiHotelModel.hotelOptions = [
    { ...multiHotelModel.hotel, name: "Patina Maldives", price: 11200, selected: false },
    { ...multiHotelModel.hotel, name: "Conrad Maldives Rangali Island", price: 14800, selected: true }
  ];
  multiHotelModel.hotel = multiHotelModel.hotelOptions[1];
  const multiHotelPayload = buildOfferPayloadFromProductModel(multiHotelModel, {
    clientName: "GT63 Test Client",
    destination: "Maldives",
    travelDates: "15-22 March 2027",
    guests: "2 adults"
  });

  assert.equal(multiHotelPayload.hotelName, "Conrad Maldives Rangali Island", "Offer Engine should use selected hotel option");
  assert.equal(multiHotelPayload.hotelPrice, 14800, "Offer Engine should price selected hotel option");
  assert.equal(multiHotelPayload.hotels.length, 2, "Offer Engine should receive all hotel options");
  assert.equal(multiHotelPayload.hotels[1].selected, true, "Offer Engine should preserve selected hotel flag");

  const phoneDestinationPayload = buildOfferPayloadFromProductModel(model, {
    clientName: "GT63 Test Client",
    clientPhone: "00359 894 84 28 82",
    destination: "00359 894 84 28 82",
    travelDates: "15-22 March 2027",
    guests: "2 adults"
  });

  assert.equal(phoneDestinationPayload.clientPhone, "00359 894 84 28 82");
  assert.notEqual(phoneDestinationPayload.destination, "00359 894 84 28 82", "phone-like destination must not become offer title");
  assert.equal(phoneDestinationPayload.destination, "Fari Islands, Maldives", "phone-like destination should fall back to hotel area");

  const inferredYearModel = {
    readiness: "ready",
    warnings: [],
    blockingIssues: [],
    flight: {
      airline: "Turkish Airlines",
      route: "SOF -> SCL / SCL -> SOF",
      departure: "SOF -> SCL, 2024-03-28T12:35",
      arrival: "SCL -> SOF, 2024-04-08T11:15",
      baggage: "2 checked bags",
      notes: "Vision model inserted a year that was not visible in the screenshot.",
      price: 1820.26,
      outboundSegments: [
        {
          airline: "Turkish Airlines",
          flightNumber: "TK 1128",
          from: "SOF",
          to: "IST",
          departure: "2024-03-28T12:35",
          arrival: "2024-03-28T14:05",
          duration: "1h 30min"
        },
        {
          airline: "Turkish Airlines",
          flightNumber: "TK 801",
          from: "IST",
          to: "PTY",
          departure: "2024-03-29T09:40",
          arrival: "2024-03-29T18:30",
          duration: "16h 50min"
        }
      ],
      inboundSegments: [
        {
          airline: "Turkish Airlines",
          flightNumber: "TK 216",
          from: "SCL",
          to: "IST",
          departure: "2024-04-08T11:15",
          arrival: "2024-04-09T11:15",
          duration: "17h"
        }
      ]
    },
    hotel: null,
    hotelOptions: []
  };
  const inferredYearPayload = buildOfferPayloadFromProductModel(inferredYearModel, {
    clientName: "GT63 Test Client",
    destination: "Santiago",
    travelDates: "28.03.2027 - 08.04.2027",
    guests: "2 adults"
  });

  const inferredYearText = JSON.stringify(inferredYearPayload);
  assert.ok(!inferredYearText.includes("2024"), "Offer payload must strip model-inferred years that conflict with reviewed travel dates");
  assert.ok(inferredYearText.includes("28 March 12:35"), "Offer payload should preserve day, month and time after stripping inferred year");
  assert.ok(inferredYearText.includes("8 April 11:15"), "Offer payload should preserve inbound day, month and time after stripping inferred year");

  console.log("GT63 OFFER ENGINE ADAPTER REGRESSION PASS");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
