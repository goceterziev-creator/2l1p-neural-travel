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
    assert.match(html, /395\.39 EUR/);
    assert.match(html, /20:10/);
    assert.match(html, /15:10/);
    assert.doesNotMatch(html, /<script|class="actions"|GT63_PRINT_MISSING/);
    assert.equal(JSON.stringify(legacy), before);
  });
  await check("PDF preserves final override, transfers, multiple flights and selected hotel", () => {
    const offer = { ...legacy, transferPrice: 20, finalPrice: 500, flights: [...legacy.flights, { airline: "Second Air", route: "LHR -> CDG", departure: "08.10.2026 10:00", arrival: "08.10.2026 12:00", price: 100 }], hotels: [{ name: "Unselected", price: 10 }, ...legacy.hotels] };
    const html = api.renderGt63PrintOfferHtml(offer);
    assert.match(html, /500\.00 EUR/);
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
  await check("hotel selection updates PDF link and print hotel with matching price", () => {
    const input = require("../gt63-core/legacy-offer-print-input").buildLegacyOfferPrintInput({ ...legacy, hotels: [legacy.hotels[0], { id: "zurich-second", name: "Zurich Second Hotel", price: 100 }] });
    const html = api.renderGt63RegistryOfferHtml({ ...legacy, proposalInput: input, proposalTemplate: input.proposalTemplate });
    assert.match(html, /data-offer-pdf/);
    assert.match(html, /data-option-id="zurich-second"/);
    const pdfLink = { href: "https://aya.example/api/offers/QA/pdf?keep=1" };
    let click;
    const button = { dataset: { optionId: "zurich-second", optionIndex: "1" }, addEventListener: (_, fn) => { click = fn; }, closest: () => null };
    const root = { querySelector: () => null, querySelectorAll: selector => selector === ".v11-prefer-option" ? [button] : [], closest: () => ({ querySelector: () => pdfLink }) };
    const document = { currentScript: { closest: () => root }, baseURI: "https://aya.example/", addEventListener: () => {} };
    const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
    require("vm").runInNewContext(script, { document, URL });
    click();
    const url = new URL(pdfLink.href);
    assert.equal(url.searchParams.get("selectedHotelId"), "zurich-second");
    assert.equal(url.searchParams.get("mode"), "selected");
    assert.equal(url.searchParams.get("keep"), "1");
    const print = api.renderGt63PrintOfferHtml({ ...legacy, proposalInput: input }, { selectedHotelId: url.searchParams.get("selectedHotelId") });
    assert.match(print, /Zurich Second Hotel/);
    assert.match(print, /438\.32 EUR/);
  });
  await check("existing proposal price calculation is preserved", () => {
    assert.equal(viewModel.optionPackageTotal({ price: 59.11 }, { pricing: { flightAmount: 317.45, marginPercent: 5 } }).toFixed(2), "395.39");
  });
  fs.rmSync(scratch, { recursive: true, force: true });
  process.exitCode = failed ? 1 : 0;
})();
