"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Module = require("node:module");
const { execFileSync, spawn } = require("node:child_process");
const puppeteer = require("puppeteer");
const fixture = require("./fixtures/smart-import/istanbul-integrity.json");
const { smartHotelRecord, groupSmartHotelScreenshots } = require("../server/smart-import-hotel-review");

const property = smartHotelRecord(fixture["hotel-property.jpg"], "SRC-1");
const checkout = smartHotelRecord(fixture["hotel-checkout.jpg"], "SRC-2");
assert.equal(property.price, 0);
assert.equal(smartHotelRecord({ ...fixture["hotel-checkout.jpg"], priceLabel: "Genius credits" }, "SRC-1").price, 0);
const separateRate = { ...checkout, ratePlan: "Refundable", nonRefundable: false };
assert.equal(groupSmartHotelScreenshots([property, checkout, separateRate]).hotels.length, 2);
const secondProperty = { ...property, sourceId: "SRC-5" };
assert.deepEqual(groupSmartHotelScreenshots([property, secondProperty, checkout]).hotels[0].propertySourceIds, ["SRC-1", "SRC-5"]);
const conflict = groupSmartHotelScreenshots([property, { ...secondProperty, transferOnRequest: false }, checkout]);
assert.equal(conflict.propertyReview.length, 2);
assert(conflict.propertyReview.every(item => item.conflict));
assert.equal(conflict.hotels[0].transferOnRequest, undefined);
const differentAddress = { ...checkout, address: "Beta 2", sourceId: "SRC-6" };
assert.equal(groupSmartHotelScreenshots([property, differentAddress]).hotels[0].transferOnRequest, undefined);
const ambiguousProperty = { ...property, address: "" };
const ambiguous = groupSmartHotelScreenshots([ambiguousProperty, checkout, differentAddress]);
assert.equal(ambiguous.hotels.length, 2);
assert(ambiguous.hotels.every(option => option.transferOnRequest === undefined));
assert.deepEqual(ambiguous.propertyReview[0].candidateSourceIds, ["SRC-2", "SRC-6"]);
assert.equal(smartHotelRecord({ ...fixture["hotel-checkout.jpg"], priceLabel: "Сума" }, "SRC-2").price, 0);

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "aya-istanbul-integrity-"));
const port = 42000 + Math.floor(Math.random() * 8000);
const base = "http://127.0.0.1:" + port;
const secret = crypto.randomBytes(32).toString("hex");
Object.assign(process.env, {
  DATA_DIR: temp, DB_FILE: path.join(temp, "db.json"), REGRESSION_LIBRARY_DIR: path.join(temp, "library"),
  PORT: String(port), LIVE_BASE_URL: base, AUTH_SECRET: secret, BETA_AUTH_BYPASS: "false", SERPAPI_KEY: "",
  AIRPORT_CONFIG_FILE: path.join(temp, "airports.json"), OCR_PATTERN_CONFIG_FILE: path.join(temp, "ocr.json")
});
fs.writeFileSync(process.env.DB_FILE, JSON.stringify({
  offers: [], users: [
    { id: "QA", name: "QA", agencyId: "AGY-AYA", role: "admin", email: "qa@example.test" },
    { id: "QA2", name: "QA2", agencyId: "AGY-QA2", role: "admin", email: "qa2@example.test" }
  ], activities: []
}));
function sessionFor(userId) {
  const data = Buffer.from(JSON.stringify({ userId, exp: Date.now() + 3600000 })).toString("base64url");
  return data + "." + crypto.createHmac("sha256", secret).update(data).digest("base64url");
}
const session = sessionFor("QA");
const cookie = "aya_session=" + session;
const quoteFile = path.join(temp, "EXCHANGE_RATES", "eur.json");
function writeQuote(rate) {
  fs.mkdirSync(path.dirname(quoteFile), { recursive: true });
  const now = Math.floor(Date.now() / 1000);
  fs.writeFileSync(quoteFile, JSON.stringify({ result: "success", base_code: "EUR",
    time_last_update_unix: now, time_next_update_unix: now + 3600, rates: { EUR: 1, USD: rate } }));
}
writeQuote(1.3);
const filename = path.resolve(__dirname, "../server.js");
const harness = new Module(filename, module);
harness.filename = filename;
harness.paths = Module._nodeModulePaths(path.dirname(filename));
// Synthetic extraction only. Exercise real grouping, normalization, Apply and persistence.
harness._compile(fs.readFileSync(filename, "utf8") + `
  const fixtures = { ...require("./test/fixtures/smart-import/istanbul-integrity.json") };
  fixtures["hotel-foreign.jpg"] = { ...fixtures["hotel-checkout.jpg"], priceText: "248,28 USD" };
  fixtures["hotel-no-address.jpg"] = { ...fixtures["hotel-property.jpg"], address: "" };
  fixtures["hotel-conflicting.jpg"] = { ...fixtures["hotel-property.jpg"], address: "", transferOnRequest: false };
  fixtures["hotel-other-checkout.jpg"] = { ...fixtures["hotel-checkout.jpg"], address: "Beta 2" };
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
  let restarted;
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
    const proof = offer.hotels[0].importedPrice;
    assert.equal(proof.kind, "checkout");
    assert.equal(proof.version, 1);
    assert.deepEqual(proof.sourceIds, ["SRC-2"]);
    assert.deepEqual(offer.hotels[0].propertySourceIds, ["SRC-1"]);
    const rejected = [
      { ...proof, sourceId: undefined }, { ...proof, sourceId: "bad" },
      { ...proof, sourceId: "SRC-1" }, { ...proof, sourceId: "SRC-4" },
      { ...proof, referenceId: "substituted" }, { ...proof, intakeId: "SMART-1-a1b2c3" }
    ].map(importedPrice => ({ importedPrice }));
    rejected.push({ price: 225.07 }, { exchangeRate: 2 }, { ratePlan: "other" });
    const initialOfferCount = JSON.parse(fs.readFileSync(process.env.DB_FILE, "utf8")).offers.length;
    for (const change of rejected) {
      const result = await fetch(base + "/api/offers", {
        method: "POST", headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({ destination: "Истанбул", status: "draft", hotels: [{ ...offer.hotels[0], ...change }] })
      });
      assert.equal(result.status, 422, JSON.stringify(change));
      assert.equal((await result.json()).details.hotelIndex, 0);
    }
    assert.equal(JSON.parse(fs.readFileSync(process.env.DB_FILE, "utf8")).offers.length, initialOfferCount);
    console.log("PASS referenced checkout, nine atomic 422 refusals and property source readback");
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

    const submit = (hotel, auth = cookie) => fetch(base + "/api/offers", {
      method: "POST", headers: { cookie: auth, "content-type": "application/json" },
      body: JSON.stringify({ status: "draft", destination: "Истанбул", hotels: [hotel] })
    });
    const otherAgency = await submit(offer.hotels[0], "aya_session=" + sessionFor("QA2"));
    assert.equal(otherAgency.status, 422);
    const legacyCreate = await submit({ name: "Legacy hotel", price: 100 });
    assert.equal(legacyCreate.status, 200);
    const legacyOffer = (await legacyCreate.json()).offer;
    const readLegacy = await fetch(base + "/api/offers/" + legacyOffer.id, { headers: { cookie } });
    const legacySnapshot = await readLegacy.json();
    const put = (snapshot) => fetch(base + "/api/offers/" + snapshot.offer.id, {
      method: "PUT", headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ ...snapshot.offer, expectedVersion: snapshot.offerVersion })
    });
    assert.equal((await put(legacySnapshot)).status, 200);

    async function upload(names) {
      await page.goto(base + "/admin", { waitUntil: "networkidle0" });
      await page.evaluate(fileNames => {
        const OriginalDate = Date;
        window.Date = class extends OriginalDate {
          constructor(...args) { super(...(args.length ? args : ["2026-11-24T12:00:00Z"])); }
          static now() { return OriginalDate.now(); }
        };
        document.getElementById("travelDates").value = "25.11.2026 - 27.11.2026";
        const transfer = new DataTransfer();
        for (const name of fileNames) transfer.items.add(new File([name], name, { type: "image/jpeg" }));
        document.getElementById("smartImportImage").files = transfer.files;
      }, names);
      await page.evaluate(() => uploadSmartImport());
    }

    await upload(["hotel-no-address.jpg", "hotel-conflicting.jpg", "hotel-checkout.jpg",
      "hotel-other-checkout.jpg", "booking-flights.jpg", "skyscanner.jpg"]);
    const propertyText = await page.$eval("#smartImportReview", node => node.textContent);
    for (const text of ["SRC-1", "SRC-2", "Istanbul", "Beta 2", "Изключи този документ"]) assert(propertyText.includes(text));
    await page.select("#reviewProperty0", "0");
    await page.select("#reviewProperty1", "0");
    await page.evaluate(() => applyUniversalTravelIntakeResult());
    assert.equal(await page.evaluate(() => hotels.length), 0);
    await page.select("#reviewProperty1", "exclude");
    await page.select("#reviewFlightCandidate", "1");
    await page.evaluate(() => {
      document.getElementById("reviewHotelPrice0").value = "191.98";
      document.getElementById("reviewHotelOperator1").checked = true;
    });
    await page.evaluate(() => applyUniversalTravelIntakeResult());
    const reviewed = await page.evaluate(() => ({ hotels, flights }));
    assert.equal(reviewed.hotels.length, 2);
    assert.deepEqual(reviewed.hotels[0].propertySourceIds, ["SRC-1"]);
    assert.equal(reviewed.hotels[0].transferOnRequest, true);
    assert.equal(reviewed.hotels[1].transferOnRequest, undefined);
    assert.equal(reviewed.hotels[1].price, 190.98);
    assert.equal(reviewed.hotels[1].importedPrice.kind, "operator");
    assert.equal(reviewed.flights[0].price, 288);
    assert.equal(reviewed.flights[0].importSelection.provider, "Skyscanner");
    assert(!JSON.stringify(reviewed.flights[0].baggage).includes("2 лични вещи"));
    const operator = await submit(reviewed.hotels[0]);
    assert.equal(operator.status, 200);
    assert.deepEqual((await operator.json()).offer.hotels[0].importedPrice, { kind: "operator", sourceIds: [] });
    console.log("PASS cross-agency rejection, legacy resave, explicit property link/exclusion and operator price");

    await upload(["hotel-foreign.jpg"]);
    await page.evaluate(() => applyUniversalTravelIntakeResult());
    const foreign = await page.evaluate(() => hotels[0]);
    assert.equal(foreign.sourceCurrency, "USD");
    assert.equal(foreign.sourcePrice, 248.28);
    assert.equal(foreign.exchangeRate, 1.3);
    assert.equal(foreign.price, 190.98);
    assert.equal((await submit({ ...foreign, exchangeRate: 1.4 })).status, 422);
    assert.equal((await submit({ ...foreign, importedPrice: { ...foreign.importedPrice, intakeId: proof.intakeId } })).status, 422);
    writeQuote(1.4);
    await new Promise(resolve => listener.close(resolve));
    listener = null;
    restarted = spawn(process.execPath, [filename], { stdio: "ignore", env: process.env });
    let running = false;
    for (let attempt = 0; attempt < 60; attempt++) {
      try {
        const response = await fetch(base + "/api/offers/" + id, { headers: { cookie } });
        running = response.ok;
        if (running) break;
      } catch {}
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert(running, "Restarted process did not open the isolated database");
    const restartedRead = await fetch(base + "/api/offers/" + id, { headers: { cookie } });
    const restartedSnapshot = await restartedRead.json();
    assert.deepEqual(restartedSnapshot.offer.hotels[0].importedPrice, proof);
    assert.equal((await put(restartedSnapshot)).status, 200);
    const foreignSave = await submit(foreign);
    assert.equal(foreignSave.status, 200);
    const storedForeign = (await foreignSave.json()).offer.hotels[0];
    assert.equal(storedForeign.price, 190.98);
    assert.equal(storedForeign.exchangeRate, 1.3);
    assert.match(storedForeign.exchangeRateSource, /exchangerate-api/);
    console.log("PASS actual isolated process restart/read/resave, cross-intake rejection and locked 248.28 USD / 1.3 = 190.98 EUR after quote changed");
  } finally {
    if (browser) await browser.close();
    if (restarted && restarted.exitCode === null) {
      const exited = new Promise(resolve => restarted.once("exit", resolve));
      restarted.kill();
      await exited;
    }
    if (listener) await new Promise(resolve => listener.close(resolve));
    fs.rmSync(temp, { recursive: true, force: true });
  }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
