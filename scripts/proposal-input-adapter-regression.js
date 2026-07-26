"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const { adaptSmartImportForProduct } = require("../gt63-core/smart-import-consumer-adapter");
const {
  buildProposalInputFromProductModel,
  assertProposalInput
} = require("../gt63-core/proposal-input-adapter");
const { buildPresentationViewModel } = require("../gt63-core/presentation-view-model");
const { renderProposal } = require("../gt63-core/proposal-renderer-registry");
const printRenderer = require("../gt63-core/renderers/print-presentation");
const { normalizeOffer } = require("../server");

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

const aliasImageProposal = buildProposalInputFromProductModel({
  readiness: "ready",
  warnings: [],
  blockingIssues: [],
  flight: null,
  hotel: null,
  hotelOptions: [{
    name: "Alias Image Hotel",
    area: "Alias Bay",
    room: "Suite",
    meal: "Breakfast",
    price: 1000,
    images: [],
    imageUrls: ["https://images.example.test/valid-hotel-image.jpg"],
    selected: true
  }],
  proposalTemplate: {
    recommended: "multi-hotel",
    selected: "multi-hotel",
    source: "resolver",
    reason: "Image alias regression."
  }
}, {
  destination: "Alias Bay",
  travelers: "2"
});
assert.deepEqual(
  aliasImageProposal.hotelOptions[0].imageUrls,
  ["https://images.example.test/valid-hotel-image.jpg"],
  "proposal input should expose imageUrls when source hotel has images: [] and imageUrls populated"
);
assert.deepEqual(
  aliasImageProposal.hotel.imageUrls,
  ["https://images.example.test/valid-hotel-image.jpg"],
  "proposal input selected hotel should expose imageUrls"
);
const aliasImageViewModel = buildPresentationViewModel(aliasImageProposal);
assert.deepEqual(
  aliasImageViewModel.selectedHotel.imageUrls,
  ["https://images.example.test/valid-hotel-image.jpg"],
  "presentation view model should receive selected hotel imageUrls"
);
const aliasImageHtml = renderProposal(aliasImageProposal);
assert.ok(
  aliasImageHtml.includes("https://images.example.test/valid-hotel-image.jpg"),
  "HTML renderer should use the real selected hotel image URL"
);
assert.equal(
  /photo-1507525428034-b723cf961d3e/.test(aliasImageHtml),
  false,
  "HTML renderer should not use the destination fallback image when a valid hotel image exists"
);

const zurichImageUrls = [
  "https://images.example.test/zurich-dolder-grand.jpg",
  "https://images.example.test/zurich-eden-au-lac.jpg",
  "https://images.example.test/zurich-storchen.jpg"
];
const zurichOffer = normalizeOffer({
  clientName: "Zurich VIP Client",
  destination: "Zurich",
  travelDates: "25 December - 28 December",
  guests: "2",
  currency: "EUR",
  hotels: [
    {
      name: "The Dolder Grand",
      area: "Zurich",
      room: "Junior Suite",
      meal: "Breakfast",
      price: 5000,
      imageUrls: [zurichImageUrls[0]],
      selected: true
    },
    {
      name: "Mandarin Oriental Savoy, Zurich",
      area: "Zurich",
      room: "Junior Suite",
      meal: "Breakfast",
      price: 5200,
      imageUrls: [zurichImageUrls[1]]
    },
    {
      name: "La Reserve Eden au Lac Zurich",
      area: "Zurich",
      room: "Junior Suite",
      meal: "Breakfast",
      price: 5100,
      imageUrls: [zurichImageUrls[2]]
    }
  ],
  proposalTemplate: {
    recommended: "multi-hotel",
    selected: "multi-hotel",
    source: "acceptance-fixture",
    reason: "Canonical Zurich data fidelity fixture."
  }
});
assert.deepEqual(
  zurichOffer.hotels.map((hotel) => hotel.images[0]),
  zurichImageUrls,
  "normalizeOffer should persist each Zurich hotel option with its own image identity"
);
assert.equal(
  new Set(zurichOffer.hotels.map((hotel) => hotel.images[0])).size,
  3,
  "normalizeOffer should not collapse distinct Zurich hotel images into one fallback"
);
const zurichProposal = buildProposalInputFromProductModel({
  readiness: "ready",
  warnings: [],
  blockingIssues: [],
  flight: null,
  hotel: zurichOffer.hotels[0],
  hotelOptions: zurichOffer.hotels,
  proposalTemplate: {
    recommended: "multi-hotel",
    selected: "multi-hotel",
    source: "acceptance-fixture",
    reason: "Canonical Zurich data fidelity fixture."
  }
}, {
  destination: "Zurich",
  travelDates: "25 December - 28 December",
  travelers: "2"
});
assert.deepEqual(
  zurichProposal.hotelOptions.map((hotel) => hotel.imageUrls[0]),
  zurichImageUrls,
  "proposal input should preserve unique Zurich hotel option images"
);
assert.deepEqual(
  zurichProposal.hotel.imageUrls,
  [zurichImageUrls[0]],
  "proposal input selected hotel should preserve the selected hotel image"
);
const zurichViewModel = buildPresentationViewModel(zurichProposal);
assert.deepEqual(
  zurichViewModel.hotelOptions.map((hotel) => hotel.imageUrls[0]),
  zurichImageUrls,
  "presentation view model should receive the same Zurich hotel image identity"
);
assert.deepEqual(
  zurichViewModel.selectedHotel.imageUrls,
  [zurichImageUrls[0]],
  "presentation view model selected hotel should keep the selected image"
);
const zurichHtml = renderProposal(zurichProposal);
const zurichStaticHtml = zurichHtml.replace(/<script[\s\S]*?<\/script>/g, "");
for (const imageUrl of zurichImageUrls) {
  assert.ok(zurichHtml.includes(imageUrl), `HTML renderer should include ${imageUrl}`);
}
assert.equal(
  /photo-1507525428034-b723cf961d3e/.test(zurichHtml),
  false,
  "HTML renderer should not use generic beach fallback when approved Zurich hotel images exist"
);
assert.equal(
  /data-hotel-image-placeholder/.test(zurichStaticHtml),
  false,
  "HTML renderer should not show image placeholders when approved Zurich hotel images exist"
);
const zurichPrintHtml = printRenderer.renderPrintProposal(zurichProposal, { mode: "selected" });
assert.ok(
  zurichPrintHtml.includes(zurichImageUrls[0]),
  "Journey Book print HTML should include the selected Zurich hotel image"
);
assert.equal(
  /data-print-image-placeholder="true"|Снимка за потвърждение/.test(zurichPrintHtml),
  false,
  "Journey Book print HTML should not show image placeholders when selected hotel image exists"
);

const noImageProposal = buildProposalInputFromProductModel({
  readiness: "ready",
  warnings: [],
  blockingIssues: [],
  flight: null,
  hotel: null,
  hotelOptions: [
    { name: "No Image Hotel 1", area: "Zurich", room: "Junior Suite", meal: "Breakfast", price: 1000, selected: true },
    { name: "No Image Hotel 2", area: "Zurich", room: "Junior Suite", meal: "Breakfast", price: 1200 },
    { name: "No Image Hotel 3", area: "Zurich", room: "Junior Suite", meal: "Breakfast", price: 1300 }
  ],
  proposalTemplate: {
    recommended: "multi-hotel",
    selected: "multi-hotel",
    source: "acceptance-fixture",
    reason: "No image honesty fixture."
  }
}, {
  destination: "Zurich",
  travelDates: "25 December - 28 December",
  travelers: "2"
});
const noImageHtml = renderProposal(noImageProposal);
const noImageStaticHtml = noImageHtml.replace(/<script[\s\S]*?<\/script>/g, "");
assert.equal(
  /photo-1507525428034-b723cf961d3e/.test(noImageHtml),
  false,
  "HTML renderer should not silently substitute a generic beach image for hotel photography"
);
assert.ok(
  /data-hotel-image-placeholder="true"/.test(noImageStaticHtml),
  "HTML renderer should show an honest hotel image placeholder when no approved image exists"
);

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
