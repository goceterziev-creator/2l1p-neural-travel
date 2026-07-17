"use strict";

const assert = require("assert");

const {
  resolveProposalTemplate,
  templateLabel,
  TEMPLATE_OPTIONS
} = require("../gt63-core/proposal-template-resolver");

assert.deepStrictEqual(
  TEMPLATE_OPTIONS.map((option) => option.value),
  ["cathedral", "city-discovery", "multi-city", "multi-hotel"],
  "resolver should expose the four locked template options"
);

const multiHotel = resolveProposalTemplate({
  hotelOptions: [
    { name: "Hotel A" },
    { name: "Hotel B" },
    { name: "Hotel C" }
  ]
});
assert.equal(multiHotel.recommended, "multi-hotel", "2+ hotel options should recommend multi-hotel");
assert.equal(multiHotel.selected, "multi-hotel", "resolver should select recommendation by default");
assert.equal(multiHotel.source, "resolver", "default source should be resolver");
assert.match(multiHotel.reason, /3 accommodation options detected/, "multi-hotel reason should be evidence based");

const multiCity = resolveProposalTemplate({
  itineraryStops: [
    {
      city: "Tokyo",
      hotelOptions: [{ name: "Tokyo hotel" }, { name: "Tokyo hotel 2" }]
    },
    {
      city: "Kyoto",
      hotelOptions: [{ name: "Kyoto hotel" }]
    }
  ],
  hotelOptions: [
    { name: "Tokyo hotel" },
    { name: "Tokyo hotel 2" }
  ]
});
assert.equal(multiCity.recommended, "multi-city", "itinerary stops should outrank flat hotel option count");
assert.match(multiCity.reason, /Multiple itinerary stops detected/, "multi-city reason should mention itinerary stops");

const cityDiscovery = resolveProposalTemplate({
  destination: "Tokyo",
  hotelOptions: [{ name: "Asakusa Tobu Hotel" }]
});
assert.equal(cityDiscovery.recommended, "city-discovery", "single city with one stay should recommend city discovery");

const cathedral = resolveProposalTemplate({
  destination: "Maldives",
  hotelOptions: [{ name: "Conrad Maldives Rangali Island" }]
});
assert.equal(cathedral.recommended, "cathedral", "single resort-style stay should fall back to cathedral");

const override = resolveProposalTemplate({
  destination: "Maldives",
  hotelOptions: [
    { name: "Resort A" },
    { name: "Resort B" }
  ],
  proposalTemplate: {
    selected: "cathedral"
  }
});
assert.equal(override.recommended, "multi-hotel", "override should preserve recommendation");
assert.equal(override.selected, "cathedral", "override should preserve agent selection");
assert.equal(override.source, "agent_override", "override source should be explicit");
assert.match(override.reason, /Agent selected Cathedral instead of Multi-Hotel Selector/, "override reason should explain difference");
assert.equal(templateLabel("multi-hotel"), "Multi-Hotel Selector", "templateLabel should expose human label");

console.log("PROPOSAL TEMPLATE RESOLVER REGRESSION PASS");
