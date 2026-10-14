"use strict";
const assert = require("node:assert/strict");
const { prepareHotelPrintImages, verifiedHotelImagePath } = require("../gt63-core/hotel-print-images");
const { renderPrintProposal } = require("../gt63-core/renderers/print-presentation");

const input = {
  destination: { name: "Цюрих" },
  pricing: { currency: "EUR", flightAmount: 100, marginPercent: 5 },
  hotelOptions: [
    { id: "old", name: "Original Hotel", price: 200, selected: true, imageUrls: ["https://example.test/original.jpg"] },
    { id: "eden", name: "La Réserve Eden au Lac Zurich", price: 400, imageUrls: ["https://example.test/broken.jpg", "https://example.test/working.jpg"] }
  ]
};
const origin = "https://aya.example.test";
let checks = 0;
async function check(name, fn) { await fn(); checks++; console.log("PASS", name); }
(async () => {
  await check("selected hotel retains valid photo during optional search outage without changing saved offer or price", async () => {
    const before = JSON.stringify(input);
    const resolved = [];
    let searches = 0;
    const prepared = await prepareHotelPrintImages(input, { selectedHotelId: "eden" }, {
      origin, resolveImage: async url => { resolved.push(url); return url.includes("working") ? `${origin}/images/hotel-cache/working.jpg` : null; },
      findImages: async (name) => { searches++; assert.equal(name, "La Réserve Eden au Lac Zurich"); throw Error("Simulated optional search outage"); }
    });
    assert.equal(JSON.stringify(input), before);
    assert.equal(resolved.length, 2);
    assert.equal(searches, 1);
    assert.match(prepared.hotelOptions[1].imageUrls[0], /working/);
    assert.deepEqual(prepared.hotelOptions[0], input.hotelOptions[0]);
    const html = renderPrintProposal(prepared, { selectedHotelId: "eden" });
    assert.match(html, /525\.00 EUR/);
    assert.doesNotMatch(html, /broken\.jpg|original\.jpg/);
  });
  await check("verified exact-property fallback works when all original URLs fail", async () => {
    const prepared = await prepareHotelPrintImages(input, { selectedHotelId: "eden" }, { origin, resolveImage: async () => null, findImages: async () => [] });
    assert.deepEqual(prepared.hotelOptions[1].imageUrls, [`${origin}/images/hotels/eden-au-lac-zurich.jpg`]);
    const london = await prepareHotelPrintImages({ destination: { name: "Лондон" }, hotel: { name: "a&o London Docklands Riverside", price: 59.11 } }, {}, { origin, resolveImage: async () => null, findImages: async () => [] });
    assert.match(london.hotel.imageUrls[0], /ao-london-docklands/);
  });
  await check("Maamadi exact-property fallback survives search outage and does not match another destination", async () => {
    const prepared = await prepareHotelPrintImages({ destination: { name: "Малдиви" }, hotel: { name: "Maamadi Boutique", price: 100 } }, {}, { origin, resolveImage: async () => null, findImages: async () => { throw Error("Search unavailable"); } });
    assert.equal(prepared.hotel.imageUrls[0], `${origin}/images/hotels/maamadi-boutique.jpg`);
    assert.equal(verifiedHotelImagePath("Maamadi Boutique", "Paris"), "");
    assert.match(renderPrintProposal(prepared), /maamadi-boutique.jpg/);
  });
  await check("unknown hotel searches fresh candidates, keeps valid photo and removes stale aliases", async () => {
    let searches = 0;
    const prepared = await prepareHotelPrintImages({ destination: { name: "Paris" }, hotel: { name: "Another Hotel", price: 50, heroImage: "https://example.test/broken.jpg" } }, {}, {
      origin, resolveImage: async url => url.includes("new") ? `${origin}/images/hotel-cache/new.jpg` : null,
      findImages: async name => { searches++; assert.equal(name, "Another Hotel"); return ["https://example.test/new.jpg"]; }
    });
    assert.equal(searches, 1);
    assert.equal(prepared.hotel.heroImage, undefined);
    assert.match(prepared.hotel.imageUrls[0], /new/);
  });
  await check("no verified photo means placeholder, never a photo of another hotel", async () => {
    const prepared = await prepareHotelPrintImages({ destination: { name: "Paris" }, hotel: { name: "a&o London Docklands Riverside", price: 50 } }, {}, { origin, resolveImage: async () => null, findImages: async () => [] });
    assert.deepEqual(prepared.hotel.imageUrls, []);
  });
  await check("invalid selection fails before any network lookup", async () => {
    await assert.rejects(prepareHotelPrintImages(input, { selectedHotelId: "absent" }, { origin, resolveImage: async () => { throw Error("Unexpected network"); }, findImages: async () => [] }), /Invalid selectedHotelId/);
  });
  console.log(`${checks} hotel image checks passed`);
})().catch(error => { console.error(error); process.exitCode = 1; });
