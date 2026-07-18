"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const { adaptSmartImportForProduct } = require("../gt63-core/smart-import-consumer-adapter");
const {
  buildProposalInputFromProductModel,
  assertProposalInput
} = require("../gt63-core/proposal-input-adapter");

const fixtureDir = path.join(__dirname, "..", "test", "fixtures", "smart-import");
const outputFixturePath = path.join(__dirname, "..", "test", "fixtures", "proposal-input", "luxury-v11-mixed.json");
const expectedKeys = [
  "blockingIssues",
  "client",
  "content",
  "destination",
  "flight",
  "hotel",
  "hotelOptions",
  "mode",
  "pricing",
  "proposalInputVersion",
  "proposalTemplate",
  "readiness",
  "source",
  "warnings"
];

function readFixture(name) {
  return JSON.parse(fs.readFileSync(path.join(fixtureDir, name), "utf8"));
}

function assertCleanProposalInput(input, label) {
  assertProposalInput(input);
  assert.deepStrictEqual(Object.keys(input).sort(), expectedKeys, `${label} exposes only proposal input keys`);
  const serialized = JSON.stringify(input);
  assert.equal(serialized.includes("contractVersion"), false, `${label} must not leak contractVersion`);
  assert.equal(serialized.includes("classifications"), false, `${label} must not leak classifications`);
  assert.equal(serialized.includes("sources"), false, `${label} must not leak source evidence`);
  assert.equal(serialized.includes("debug"), false, `${label} must not leak debug`);
  assert.equal(serialized.includes("universalIntakeDeprecated"), false, `${label} must not leak legacy flags`);
}

function proposalFromFixture(name, context = {}) {
  const productModel = adaptSmartImportForProduct(readFixture(name));
  return buildProposalInputFromProductModel(productModel, context);
}

const mixed = proposalFromFixture("flight-hotel-mixed.json", {
  clientName: "G. Terziev",
  destination: "Maldives",
  travelDates: "31 August - 15 September",
  travelers: "2"
});
assertCleanProposalInput(mixed, "mixed");
assert.equal(mixed.proposalInputVersion, "1.0", "mixed should expose proposal input v1");
assert.equal(mixed.mode, "GT63_LUXURY_PROPOSAL_INPUT", "mixed should expose luxury proposal mode");
assert.equal(mixed.readiness, "ready", "mixed should stay ready");
assert.equal(mixed.client.name, "G. Terziev", "mixed should map client name from context");
assert.equal(mixed.destination.name, "Maldives", "mixed should prefer requested destination");
assert.equal(mixed.flight.airline, "Emirates", "mixed should include flight");
assert.equal(mixed.flight.outboundSegments.length, 1, "mixed should preserve outbound segments");
assert.equal(mixed.flight.inboundSegments.length, 1, "mixed should preserve inbound segments");
assert.equal(mixed.hotel.name, "Patina Maldives", "mixed should include hotel");
assert.equal(mixed.hotelOptions.length, 1, "mixed should expose selected hotel as hotel option");
assert.equal(mixed.pricing.flightAmount, 1475, "mixed should expose flight amount");
assert.equal(mixed.pricing.hotelAmount, 11200, "mixed should expose hotel amount");
assert.equal(mixed.pricing.baseAmount, 12675, "mixed should expose base amount");
assert.equal(mixed.pricing.marginPercent, 5, "mixed should expose default margin percent");
assert.equal(mixed.pricing.marginAmount, 633.75, "mixed should expose margin amount");
assert.equal(mixed.pricing.totalAmount, 13308.75, "mixed should expose final amount with margin");
assert.deepStrictEqual(mixed.proposalTemplate, {
  recommended: "cathedral",
  selected: "cathedral",
  source: "resolver",
  reason: null
}, "mixed should expose a default proposal template contract");
assert.ok(mixed.content.highlights.some((item) => item.includes("Patina Maldives")), "mixed should produce proposal highlights");
assert.ok(mixed.warnings.some((warning) => warning.includes("Final operator review is recommended")), "mixed should preserve non-blocking warning");

const fixtureProposal = JSON.parse(fs.readFileSync(outputFixturePath, "utf8"));
assert.deepStrictEqual(fixtureProposal, mixed, "luxury-v11-mixed proposal fixture must match adapter output");

const flightOnly = proposalFromFixture("flight-only.json", {
  destination: "Maldives"
});
assertCleanProposalInput(flightOnly, "flight-only");
assert.equal(flightOnly.readiness, "ready", "flight-only should be ready");
assert.ok(flightOnly.flight, "flight-only should include flight");
assert.equal(flightOnly.hotel, null, "flight-only should not invent hotel");
assert.equal(flightOnly.pricing.hotelAmount, null, "flight-only should not invent hotel amount");

const hotelOnly = proposalFromFixture("hotel-only.json");
assertCleanProposalInput(hotelOnly, "hotel-only");
assert.equal(hotelOnly.readiness, "ready", "hotel-only should be ready");
assert.equal(hotelOnly.flight, null, "hotel-only should not invent flight");
assert.ok(hotelOnly.hotel, "hotel-only should include hotel");
assert.equal(hotelOnly.hotelOptions.length, 1, "hotel-only should expose hotel option list");
assert.equal(hotelOnly.destination.name, "Rangali Island, Maldives", "hotel-only should derive destination from hotel area");

const review = proposalFromFixture("unknown-partial-failure.json");
assertCleanProposalInput(review, "review");
assert.equal(review.readiness, "review", "review fixture should remain review");
assert.ok(review.blockingIssues.length >= 1, "review fixture should preserve blocking issues");
assert.ok(review.flight, "review fixture should preserve partial successful flight data");
assert.equal(review.hotel, null, "review fixture should not invent hotel");
assert.equal(review.hotelOptions.length, 0, "review fixture should not invent hotel options");

const extractedModel = adaptSmartImportForProduct(readFixture("flight-hotel-mixed.json"));
const reviewedModel = JSON.parse(JSON.stringify(extractedModel));
reviewedModel.flight.price = 1520;
const reviewedProposal = buildProposalInputFromProductModel(reviewedModel, {
  destination: "Maldives"
});
assert.equal(extractedModel.flight.price, 1475, "original extracted model should remain unchanged");
assert.equal(reviewedProposal.flight.price, 1520, "preview input should use reviewed flight price");
assert.equal(reviewedProposal.pricing.flightAmount, 1520, "preview pricing should use reviewed flight price");

const multiHotelModel = JSON.parse(JSON.stringify(extractedModel));
multiHotelModel.hotelOptions = Array.from({ length: 5 }, (_, index) => ({
  ...multiHotelModel.hotel,
  name: `Maldives Hotel ${index + 1}`,
  price: 11200 + (index * 900),
  selected: index === 4
}));
multiHotelModel.hotel = multiHotelModel.hotelOptions[4];
multiHotelModel.proposalTemplate = {
  recommended: "multi-hotel",
  selected: "multi-hotel",
  source: "resolver",
  reason: "5 accommodation options detected."
};
const multiHotelProposal = buildProposalInputFromProductModel(multiHotelModel, {
  destination: "Maldives"
});
assert.equal(multiHotelProposal.hotel.name, "Maldives Hotel 5", "preview should use selected hotel option");
assert.equal(multiHotelProposal.hotelOptions.length, 5, "preview should preserve multiple hotel options");
assert.equal(multiHotelProposal.pricing.hotelAmount, 14800, "preview pricing should use selected hotel price");
assert.equal(multiHotelProposal.proposalTemplate.selected, "multi-hotel", "preview input should preserve selected template");
assert.equal(multiHotelProposal.proposalTemplate.source, "resolver", "preview input should preserve template source");

const inferredYearProposal = buildProposalInputFromProductModel({
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
}, {
  destination: "Santiago",
  travelDates: "28.03.2027 - 08.04.2027",
  travelers: "2"
});
const inferredYearProposalText = JSON.stringify(inferredYearProposal);
assert.ok(!inferredYearProposalText.includes("2024"), "preview input must strip model-inferred years that conflict with reviewed travel dates");
assert.ok(inferredYearProposalText.includes("28 March 12:35"), "preview input should preserve outbound day, month and time");
assert.ok(inferredYearProposalText.includes("8 April 11:15"), "preview input should preserve inbound day, month and time");

const phoneDestinationProposal = buildProposalInputFromProductModel(extractedModel, {
  destination: "00359 894 84 28 82"
});
assert.notEqual(phoneDestinationProposal.destination.name, "00359 894 84 28 82", "phone-like destination must not become preview title");
assert.equal(phoneDestinationProposal.destination.name, "Fari Islands, Maldives", "phone-like destination should fall back to hotel area");

console.log("PROPOSAL INPUT ADAPTER REGRESSION PASS");
