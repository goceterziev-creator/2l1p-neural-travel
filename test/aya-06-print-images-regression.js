"use strict";
const assert = require("node:assert/strict");
const { prepareHotelPrintImages } = require("../gt63-core/hotel-print-images");

(async () => {
  const input = {
    proposalInputVersion: "1.0",
    mode: "GT63_LUXURY_PROPOSAL_INPUT",
    destination: { name: "Dubai" },
    hotelOptions: [{ id: "h1", name: "Verified Test Hotel", selected: true, images: ["https://example.org/hotel-one.jpg"] }],
    hotel: { id: "h1", name: "Verified Test Hotel", selected: true }
  };
  const calls = [];
  const prepared = await prepareHotelPrintImages(input, {}, {
    origin: "https://offers.example.org",
    resolveImage: async (url) => url,
    findImages: async (name, destination, limit) => {
      calls.push({ name, destination, limit });
      return ["https://example.org/hotel-two.jpg", "https://example.org/hotel-three.jpg"];
    }
  });
  assert.equal(calls.length, 1, "one existing image must still trigger hotel-specific replenishment");
  assert.equal(calls[0].name, "Verified Test Hotel");
  assert.equal(prepared.hotelOptions[0].imageUrls.length, 3);
  assert.equal(prepared.hotel.imageUrls.length, 3);
  assert.equal(input.hotelOptions[0].images.length, 1, "input must not be mutated");
  console.log("AYA-06 hotel-specific print image replenishment: PASS");
})().catch((error) => { console.error(error); process.exitCode = 1; });
