"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Module = require("node:module");
const { execFileSync } = require("node:child_process");
const puppeteer = require("puppeteer");
const fixture = require("./fixtures/smart-import/istanbul-integrity.json");
const { smartHotelRecord, groupSmartHotelScreenshots } = require("../server/smart-import-hotel-review");

const property = smartHotelRecord(fixture["hotel-property.jpg"], "SRC-1");
const checkout = smartHotelRecord(fixture["hotel-checkout.jpg"], "SRC-2");
assert.equal(property.price, 0);
assert.equal(smartHotelRecord({ ...fixture["hotel-checkout.jpg"], priceLabel: "Genius credits" }, "SRC-1").price, 0);
const separateRate = { ...checkout, ratePlan: "Refundable", nonRefundable: false };
assert.equal(groupSmartHotelScreenshots([property, checkout, separateRate]).hotels.length, 2);

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "aya-istanbul-integrity-"));
const port = 42000 + Math.floor(Math.random() * 8000);
const base = "http://127.0.0.1:" + port;
const secret = crypto.randomBytes(32).toString("hex");
Object.assign(process.env, {
  DATA_DIR: temp, DB_FILE: path.join(temp, "db.json"), REGRESSION_LIBRARY_DIR: path.join(temp, "library"),
  LIVE_BASE_URL: base, AUTH_SECRET: secret, BETA_AUTH_BYPASS: "false", SERPAPI_KEY: "",
  AIRPORT_CONFIG_FILE: path.join(temp, "airports.json"), OCR_PATTERN_CONFIG_FILE: path.join(temp, "ocr.json")
});
fs.writeFileSync(process.env.DB_FILE, JSON.stringify({
  offers: [], users: [{ id: "QA", name: "QA", agencyId: "AGY-AYA", role: "admin", email: "qa@example.test" }], activities: []
}));
const tokenData = Buffer.from(JSON.stringify({ userId: "QA", exp: Date.now() + 3600000 })).toString("base64url");
const session = tokenData + "." + crypto.createHmac("sha256", secret).update(tokenData).digest("base64url");
const cookie = "aya_session=" + session;
const filename = path.resolve(__dirname, "../server.js");
const harness = new Module(filename, module);
harness.filename = filename;
harness.paths = Module._nodeModulePaths(path.dirname(filename));
// Synthetic extraction only. Exercise real grouping, normalization, Apply and persistence.
harness._compile(fs.readFileSync(filename, "utf8") + `
  const fixtures = require("./test/fixtures/smart-import/istanbul-integrity.json");
  classifySmartImportSource = async (file, index) => ({
    sourceId: "SRC-" + (index + 1), sourceType: file.originalname.startsWith("hotel") ? "hotel" : "flight",
    flightProvider: fixtures[file.originalname].provider
  });
  extractFlightWithAiVision = async files => {
    if (files.length !== 1) throw Error("Unrelated providers reached one extraction");
    const canonical = validateGeminiFlightJson(fixtures[files[0].originalname]);
    return { canonical, flight: geminiCanonicalToFlight(canonical) };
  };
  callVisionJson = async ({imageBuffer}) => structuredClone(fixtures[imageBuffer.toString()]);
  archiveUniversalSourceEvidenceSafe = ({sources}) => ({sources});
  module.exports.istanbulQa = { app, buildLegacyOfferPrintInput, renderGt63RegistryOfferHtml };
`, filename);

async function run() {
  let listener;
  let browser;
  try {
    const api = harness.exports.istanbulQa;
    listener = api.app.listen(port, "127.0.0.1");
    await new Promise(resolve => listener.once("listening", resolve));
    browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
    const page = await browser.newPage();
    await page.setCookie({ name: "aya_session", value: session, url: base });
    await page.goto(base + "/admin", { waitUntil: "networkidle0" });
    page.on("dialog", dialog => dialog.accept());
    await page.evaluate(names => {
      const OriginalDate = Date;
      window.Date = class extends OriginalDate {
        constructor(...args) { super(...(args.length ? args : ["2026-11-24T12:00:00Z"])); }
        static now() { return OriginalDate.now(); }
      };
      window.open = () => null;
      document.getElementById("destination").value = "Истанбул";
      document.getElementById("travelDates").value = "25.11.2026 - 27.11.2026";
      document.getElementById("guests").value = "2 възрастни";
      const transfer = new DataTransfer();
      for (const name of names) transfer.items.add(new File([name], name, { type: "image/jpeg" }));
      document.getElementById("smartImportImage").files = transfer.files;
    }, Object.keys(fixture));
    await page.evaluate(() => uploadSmartImport());
    const review = await page.$eval("#smartImportReview", node => node.textContent);
    for (const text of ["225,07 EUR", "credit", "Booking Flights", "Skyscanner"]) assert(review.includes(text), text);
    assert.equal(await page.$eval("#reviewHotelPrice0", node => Number(node.value)), 190.98);
    await page.select("#reviewFlightCandidate", "1");
    assert.equal(await page.$eval("#universalFlightPrice", node => Number(node.value)), 288);
    await page.select("#reviewFlightCandidate", "0");
    assert.equal(await page.$eval("#universalFlightPrice", node => Number(node.value)), 294);
    await page.evaluate(() => applyUniversalTravelIntakeResult());
    const applied = await page.evaluate(() => ({ hotels, flights }));
    assert.equal(applied.hotels.length, 1);
    assert.deepEqual(applied.hotels[0].occupancy, { adults: 2, children: 0, rooms: 1, childAges: null, confirmed: false });
    assert.equal(applied.flights[0].price, 294);
    assert.equal(applied.flights[0].outboundSegments[0].departure, "2026-11-25T12:55");
    console.log("PASS Chromium upload/review/Apply and untouched occupancy confirmation");

    const response = page.waitForResponse(res => res.url() === base + "/api/offers" && res.request().method() === "POST");
    await page.evaluate(() => {
      document.getElementById("clientName").value = "QA Istanbul";
      document.getElementById("markupPercent").value = "5";
      document.getElementById("finalPrice").value = "";
      confirmHotelOccupancy(0, true);
      return saveOffer();
    });
    const created = await response;
    const createdBody = await created.json();
    assert.equal(created.status(), 200, JSON.stringify(createdBody));
    assert.equal(created.request().postData() && JSON.parse(created.request().postData()).finalPrice, "");
    const id = createdBody.offer.id;
    const read = await fetch(base + "/api/offers/" + id, { headers: { cookie } });
    assert.equal(read.status, 200);
    const { offer } = await read.json();
    assert.equal(offer.status, "draft");
    assert.equal(offer.hotelPrice, 190.98);
    assert.equal(offer.flightPrice, 294);
    assert.equal(offer.basePrice, 484.98);
    assert.equal(offer.markupPercent, 5);
    assert.equal(Number(offer.finalPrice.toFixed(2)), 509.23);
    assert.equal(offer.hotels[0].occupancy.confirmed, true);
    assert.equal(offer.hotels[0].nights, 2);
    assert.equal(offer.hotels[0].nonRefundable, true);
    assert.deepEqual(offer.hotels[0].importedPrice, { kind: "checkout", sourceIds: ["SRC-2"] });
    assert.equal(offer.flights[0].importSelection.alternatives[0].amount, 288);
    assert.equal(offer.flights.length, 1);
    console.log("PASS local Admin save/readback 200/200, 484.98 × 1.05 = 509.23");

    const visible = text => {
      for (const value of ["Beethoven Premium Hotel", "Невъзвръщаема тарифа", "2 нощувки", "PC272", "PC273",
        "При заявка, извън включените услуги"]) assert(text.includes(value), value);
      assert.match(text, /509[,.]23/);
      assert(!text.includes("Genius credits"));
      assert(!text.includes("Skyscanner"));
    };
    const legacy = await fetch(base + "/api/offers/" + id + "/qa-preview", { headers: { cookie } });
    assert.equal(legacy.status, 200);
    visible(await legacy.text());
    const proposalInput = api.buildLegacyOfferPrintInput(offer);
    visible(api.renderGt63RegistryOfferHtml({ ...offer, proposalInput, proposalTemplate: proposalInput.proposalTemplate }));
    await page.goto(base + "/api/offers/" + id + "/print");
    visible(await page.$eval("body", node => node.innerText));
    const transferState = await page.$$eval(".gt63-print-service-card", cards => cards
      .filter(card => card.textContent.includes("Летищен трансфер"))
      .map(card => card.closest("[data-service-state]").dataset.serviceState));
    assert.deepEqual(transferState, ["pending"]);
    const pdf = await fetch(base + "/api/offers/" + id + "/pdf");
    assert.equal(pdf.status, 200);
    const pdfPath = path.join(temp, "istanbul.pdf");
    fs.writeFileSync(pdfPath, Buffer.from(await pdf.arrayBuffer()));
    visible(execFileSync("pdftotext", [pdfPath, "-"], { encoding: "utf8" }).replace(/\s+/g, " "));
    console.log("PASS legacy/registry HTML, Chromium Print and production PDF handler with pdftotext in local QA");
  } finally {
    if (browser) await browser.close();
    if (listener) await new Promise(resolve => listener.close(resolve));
    fs.rmSync(temp, { recursive: true, force: true });
  }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
