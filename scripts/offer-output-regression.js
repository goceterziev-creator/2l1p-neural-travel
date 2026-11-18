"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Module = require("node:module");
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "aya-output-regression-"));
process.env.DB_FILE = path.join(scratch, "database.json");
process.env.AIRPORT_CONFIG_FILE = path.join(scratch, "airports.json");
process.env.OCR_PATTERN_CONFIG_FILE = path.join(scratch, "ocr-patterns.json");
delete process.env.SERPAPI_KEY;
const filename = path.join(__dirname, "..", "server.js");
const harness = new Module(filename, module);
harness.filename = filename;
harness.paths = Module._nodeModulePaths(path.dirname(filename));
harness._compile(fs.readFileSync(filename, "utf8") + "\nmodule.exports.outputTest = { normalizeHotelTextToBulgarian, renderGt63PrintOfferHtml, renderOfferHtml, renderGt63RegistryOfferHtml };", filename);
const api = harness.exports.outputTest;
const viewModel = require("../gt63-core/presentation-view-model");
const legacy = harness.exports.normalizeOffer({
  id: "OFF-OUTPUT-QA", clientName: "Output QA", destination: "Лондон",
  travelDates: "05.10.2026 - 07.10.2026", guests: "1 възрастен", markupPercent: 5,
  flights: [{ airline: "British Airways", route: "SOF -> LHR / LHR -> SOF", departure: "05.10.2026 20:10", arrival: "07.10.2026 15:10", baggage: "1 лична вещ и ръчен багаж", price: 317.45 }],
  hotels: [{ name: "a&o London Docklands Riverside", price: 59.11, selected: true, room: "Легло в обща спалня", images: ["https://hotel.example.test/london.jpg"] }]
});
let failed = 0;
async function check(name, fn) {
  try { await fn(); console.log("PASS", name); }
  catch (error) { failed++; console.error("FAIL", name, error.message); }
}
(async () => {
  await check("visible hotel price preserves cents over rounded model amount", () => {
    for (const priceText of ["€ 59.11", "EUR 59,11"]) {
      assert.equal(api.normalizeHotelTextToBulgarian({ price: 59, priceText }).price, 59.11);
    }
    assert.equal(api.normalizeHotelTextToBulgarian({ price: "1.259,11 EUR" }).price, 1259.11);
  });
  await check("legacy offer renders through separate static PDF template without mutation", () => {
    const before = JSON.stringify(legacy);
    const html = api.renderGt63PrintOfferHtml(legacy);
    assert.match(html, /gt63-print-cover/);
    assert.match(html, /395,39 EUR/);
    assert.match(html, /20:10/);
    assert.match(html, /15:10/);
    assert.doesNotMatch(html, /<script|class="actions"|GT63_PRINT_MISSING/);
    assert.equal(JSON.stringify(legacy), before);
  });
  await check("PDF preserves final override, transfers, multiple flights and selected hotel", () => {
    const offer = { ...legacy, transferPrice: 20, finalPrice: 500, flights: [...legacy.flights, { airline: "Second Air", route: "LHR -> CDG", departure: "08.10.2026 10:00", arrival: "08.10.2026 12:00", price: 100 }], hotels: [{ name: "Unselected", price: 10 }, ...legacy.hotels] };
    const html = api.renderGt63PrintOfferHtml(offer);
    assert.match(html, /500,00 EUR/);
    assert.match(html, /Second Air/);
    assert.match(html, /08\.10\.2026 10:00/);
    assert.match(html, /a&amp;o London/);
  });
  await check("London HTML uses destination image; PDF retains hotel cover image", async () => {
    for (const destination of ["London", "Лондон"]) {
      const html = await api.renderOfferHtml({ ...legacy, destination });
      const hero = html.match(/class="hero-bg"[^>]+src="([^"]+)"/);
      assert.ok(hero);
      assert.match(hero[1], /photo-1513635269975-59663e0ac1ad/);
      const print = api.renderGt63PrintOfferHtml({ ...legacy, destination });
      assert.match(print, /class="gt63-print-cover-hero" src="https:\/\/hotel\.example\.test\/london\.jpg"/);
    }
  });
  await check("explicit malformed proposal remains a controlled error", () => {
    assert.throws(() => api.renderGt63PrintOfferHtml({ ...legacy, proposalInput: { mode: "broken" } }), /invalid/i);
  });
  function assertWhatsApp(href, id, hotel, price) {
    const url = new URL(href);
    assert.equal(url.hostname, "wa.me");
    const message = url.searchParams.get("text");
    assert.ok(message.includes(hotel));
    assert.ok(message.includes(price));
    assert.ok(message.includes("05.10.2026 - 07.10.2026"));
    const offerUrl = new URL(message.split("\n").at(-1));
    assert.equal(offerUrl.searchParams.get("selectedHotelId"), id);
  }

  await check("single-hotel legacy and registry offers expose WhatsApp and no PDF action", async () => {
    const input = require("../gt63-core/legacy-offer-print-input").buildLegacyOfferPrintInput(legacy);
    for (const offer of [legacy, { ...legacy, proposalInput: input, proposalTemplate: input.proposalTemplate }]) {
      const html = await api.renderOfferHtml(offer);
      assert.doesNotMatch(html, /<a[^>]+href="[^"]+\/pdf(?:[?"#])/i);
      const href = html.match(/<a[^>]+href="(https:\/\/wa\.me\/[^"]+)"/)[1];
      assertWhatsApp(href, input.hotelOptions[0].id, "a&o London", "395,39");
    }
    assert.doesNotMatch(fs.readFileSync(path.join(__dirname, "../public/offer.html"), "utf8"), /window\.print/);
  });

  await check("registry deep links preserve the hotel ID and agree with selected print price", () => {
    const input = require("../gt63-core/legacy-offer-print-input").buildLegacyOfferPrintInput({
      ...legacy, hotels: [legacy.hotels[0], { id: "zurich-second", name: "Zurich Second Hotel", price: 100 }]
    });
    for (const selected of ["multi-hotel", "cathedral", "city-discovery", "multi-city"]) {
      const proposalTemplate = { ...input.proposalTemplate, selected };
      const offer = { ...legacy, proposalInput: { ...input, proposalTemplate }, proposalTemplate };
      const html = api.renderGt63RegistryOfferHtml(offer, { selectedHotelId: "zurich-second" });
      assert.doesNotMatch(html, /data-offer-pdf|mailto:|tel:/);
      assert.match(html, /Zurich Second Hotel/);
      const href = html.match(/<a[^>]+href="(https:\/\/wa\.me\/[^"]+)"/)[1];
      assertWhatsApp(href, "zurich-second", "Zurich Second Hotel", "438,32");
      const print = api.renderGt63PrintOfferHtml(offer, { selectedHotelId: "zurich-second" });
      assert.match(print, /Zurich Second Hotel/);
      assert.match(print, /438,32 EUR/);
    }
  });

  await check("legacy choice preserves original ID, WhatsApp context and print price", async () => {
    const offer = { ...legacy, hotels: [
      { name: "Same Hotel", price: 50 }, { name: "Second", price: 100, selected: true },
      { name: "Third", price: 150 }, { name: "Same Hotel", price: 50 }
    ], hotelPrice: 100, finalPrice: 500 };
    const before = JSON.stringify(offer);
    const html = await api.renderOfferHtml(offer);
    assert.doesNotMatch(html, /data-selected-hotel-pdf/);
    assert.match(html, /data-hotel-id="legacy-hotel-4"/);
    const cards = [...html.matchAll(/data-hotel-id="([^"]+)" data-client-price="([^"]+)" data-whatsapp="([^"]+)"/g)]
      .map(([, hotelId, clientPrice, whatsapp]) => ({
        dataset: { hotelId, clientPrice, whatsapp }, classList: { toggle() {} }, querySelector: () => null
      }));
    const link = { href: "" }, price = { textContent: "" };
    const context = {
      URL,
      window: { location: { href: "https://aya.test/view?selectedHotelId=legacy-hotel-3" } },
      document: {
        querySelector: () => null,
        querySelectorAll: selector => ({
          "[data-hotel-choice-card]": cards, ".price[data-client-price]": [price], "[data-selected-hotel-whatsapp]": [link]
        })[selector] || []
      }
    };
    require("node:vm").runInNewContext(fs.readFileSync(path.join(__dirname, "../public/offer-hotel-selection.js"), "utf8"), context);
    assert.match(price.textContent, /552[,.]50/);
    assertWhatsApp(link.href, "legacy-hotel-3", "Third", price.textContent);
    const print = api.renderGt63PrintOfferHtml(offer, { selectedHotelId: "legacy-hotel-3" });
    assert.match(print, /Third/);
    assert.match(print, /552,50 EUR/);
    assert.equal(JSON.stringify(offer), before);
  });
  await check("existing proposal price calculation is preserved", () => {
    assert.equal(viewModel.optionPackageTotal({ price: 59.11 }, { pricing: { flightAmount: 317.45, marginPercent: 5 } }).toFixed(2), "395.39");
  });
  fs.rmSync(scratch, { recursive: true, force: true });
  process.exitCode = failed ? 1 : 0;
})();
