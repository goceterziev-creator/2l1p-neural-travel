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
  fixtures["skyscanner-unknown.jpg"] = { ...fixtures["skyscanner.jpg"], totalPrice: undefined,
    priceObservations: [fixtures["skyscanner.jpg"].priceObservations[0]] };
  fixtures["hotel-child.jpg"] = { ...fixtures["hotel-checkout.jpg"], occupancy: {adults:2, children:1, rooms:1, childAges:[7]} };
  fixtures["hotel-unknown.jpg"] = { ...fixtures["hotel-checkout.jpg"], occupancy: {}, nonRefundable: null };
  fixtures["hotel-refundable.jpg"] = { ...fixtures["hotel-checkout.jpg"], nonRefundable: false };
  fixtures["hotel-foreign.jpg"] = { ...fixtures["hotel-checkout.jpg"], priceText: "248,28 USD" };
  fixtures["hotel-no-address.jpg"] = { ...fixtures["hotel-property.jpg"], address: "" };
  fixtures["hotel-conflicting.jpg"] = { ...fixtures["hotel-property.jpg"], address: "", transferOnRequest: false };
  fixtures["hotel-other-checkout.jpg"] = { ...fixtures["hotel-checkout.jpg"], address: "Beta 2" };
  classifySmartImportSource = async (file, index) => ({
    sourceId: "SRC-" + (index + 1), sourceType: file.originalname.startsWith("hotel") ? "hotel" : "flight",
    flightProvider: fixtures[file.originalname].provider
  });
  extractFlightWithAiVision = async (files, {sourceIds}) => {
    if (files.length !== 1) throw Error("Unrelated providers reached one extraction");
    const fixture = fixtures[files[0].originalname];
    const canonical = validateGeminiFlightJson({ ...fixture,
      priceObservations: fixture.priceObservations?.map(item => ({ ...item, sourceId: sourceIds[0] })) });

    return { canonical, flight: geminiCanonicalToFlight(canonical) };
  };
  callVisionJson = async ({imageBuffer}) => structuredClone(fixtures[imageBuffer.toString()]);
  archiveUniversalSourceEvidenceSafe = ({sources}) => ({sources});
  module.exports.istanbulQa = { app, buildLegacyOfferPrintInput, renderGt63RegistryOfferHtml };
`, filename);

async function run() {
  const skyscanner = process.argv.includes("--skyscanner");
  const flightTotal = skyscanner ? 288 : 294;
  const baseTotal = skyscanner ? 478.98 : 484.98;
  const advertisedTotal = skyscanner ? 502.93 : 509.23;
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
    const skyDebug = await page.$eval("#smartImportReview details pre", node => JSON.parse(node.textContent).flight);
    assert.equal(skyDebug.representation, "normalized-selected-candidate");
    assert.equal(skyDebug.provider, "Skyscanner");
    assert.deepEqual(skyDebug.sourceIds, ["SRC-4"]);
    assert.deepEqual(skyDebug.observations.map(item => [item.amount, item.priceUnit]), [[144,"unknown"],[288,"party-total"]]);
    assert.equal(skyDebug.flight.baggage, "");
    assert.equal(skyDebug.flight.outboundSegments[0].flightNumber, "");
    if (!skyscanner) await page.select("#reviewFlightCandidate", "0");
    assert.equal(await page.$eval("#universalFlightPrice", node => Number(node.value)), flightTotal);
    await page.evaluate(() => applyUniversalTravelIntakeResult());
    const applied = await page.evaluate(() => ({ hotels, flights }));
    assert.equal(applied.hotels.length, 1);
    assert.deepEqual(applied.hotels[0].occupancy, { adults: 2, children: 0, rooms: 1, childAges: null, confirmed: false });
    assert.equal(applied.flights[0].price, flightTotal);
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
    assert.equal(offer.flightPrice, flightTotal);
    assert.equal(offer.basePrice, baseTotal);
    assert.equal(offer.markupPercent, 5);
    assert.equal(Number(offer.finalPrice.toFixed(2)), advertisedTotal);
    assert.equal(offer.hotels[0].occupancy.confirmed, true);
    assert.equal(offer.hotels[0].nights, 2);
    assert.equal(offer.hotels[0].nonRefundable, true);
    const proof = offer.hotels[0].importedPrice;
    assert.equal(proof.kind, "checkout");
    assert.equal(proof.version, 2);
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
    assert.equal(offer.flights[0].importSelection.alternatives[0].amount, skyscanner ? 294 : 288);
    assert.equal(offer.flights[0].importSelection.provider, skyscanner ? "Skyscanner" : "Booking Flights");
    assert.equal(offer.flights[0].importedFlightPrice.kind, "source-total");
    assert.equal(offer.flights[0].outboundSegments[0].flightNumber, skyscanner ? "" : "PC272");
    if (skyscanner) assert(!JSON.stringify(offer.flights[0].baggage).includes("2 лични вещи"));
    else assert(JSON.stringify(offer.flights[0].baggage).includes("2 лични вещи"));
    assert.equal(offer.flights.length, 1);
    console.log("PASS local Admin save/readback 200/200", baseTotal, advertisedTotal);

    const visible = text => {
      for (const value of ["Beethoven Premium Hotel", "Невъзвръщаема тарифа", "2 нощувки", ...(skyscanner ? [] : ["PC272", "PC273"]),
        "При заявка, извън включените услуги"]) assert(text.includes(value), value);
      assert(text.includes(String(advertisedTotal)) || text.includes(String(advertisedTotal).replace(".", ",")));
      if (skyscanner) assert(!text.includes("PC272") && !text.includes("PC273"));
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

    if (process.argv.includes("--flight-evidence-only")) {
      const target = base + "/api/offers/" + id;
      const readSnapshot = async () => (await (await fetch(target, { headers: { cookie } })).json());
      const snapshot = await readSnapshot();
      const flight = snapshot.offer.flights[0];
      const claim = flight.importedFlightPrice;
      const selection = flight.importSelection;
      const initialBytes = fs.readFileSync(process.env.DB_FILE);
      const apiRequest = (method, flight, overrides = {}, auth = cookie) => fetch(method === "PUT" ? target : base + "/api/offers", {
        method, headers: { cookie: auth, "content-type": "application/json" },
        body: JSON.stringify({ ...snapshot.offer, expectedVersion: snapshot.offerVersion, flights: [flight], ...overrides })
      });
      const cases = [
        [{ importedFlightPrice: { ...claim, referenceId: "forged" } }, {}, "FLIGHT_PRICE_REFERENCE_INVALID"],
        [{ importedFlightPrice: { ...claim, intakeId: "SMART-1-aaaaaa" } }, {}, "FLIGHT_PRICE_REFERENCE_INVALID"],
        [{ importedFlightPrice: { ...claim, candidateId: "other" } }, {}, "FLIGHT_PRICE_REFERENCE_INVALID"],
        [{ importSelection: { ...selection, provider: skyscanner ? "Booking Flights" : "Skyscanner" } }, {}, "FLIGHT_PRICE_REFERENCE_INVALID"],
        [{ importSelection: { ...selection, sourceIds: ["SRC-1"] } }, {}, "FLIGHT_PRICE_REFERENCE_INVALID"],
        [{ route: "SOF -> IST / IST -> SOF" }, {}, "FLIGHT_PRICE_ROUTE_MISMATCH"],
        [{}, { guests: "3 възрастни" }, "FLIGHT_PRICE_PASSENGERS_MISMATCH"],
        [{}, { guests: "1 възрастен и 1 дете" }, "FLIGHT_PRICE_PASSENGERS_MISMATCH"],
        [{ price: 144 }, {}, "FLIGHT_PRICE_AMOUNT_OR_FX_MISMATCH"],
        [{ importedFlightPrice: { ...claim, rate: 2 } }, {}, "FLIGHT_PRICE_AMOUNT_OR_FX_MISMATCH"],
        [{ importedFlightPrice: null }, {}, "FLIGHT_PRICE_PROVENANCE_REQUIRED"]
      ];
      for (const [change, overrides, code] of cases) {
        for (const method of ["POST", "PUT"]) {
          const response = await apiRequest(method, { ...flight, ...change }, overrides);
          assert.equal(response.status, 422, code);
          assert.deepEqual((await response.json()).details, { flightIndex: 0, code });
          assert.deepEqual(fs.readFileSync(process.env.DB_FILE), initialBytes);
        }
        assert.deepEqual(await readSnapshot(), snapshot);
      }
      assert.equal((await apiRequest("POST", flight, {}, "aya_session=" + sessionFor("QA2"))).status, 422);
      assert.deepEqual(fs.readFileSync(process.env.DB_FILE), initialBytes);
      for (const method of ["POST", "PUT"]) {
        const double = await apiRequest(method, flight, { flights: [flight, flight] });
        assert.equal(double.status, 422);
        assert.deepEqual((await double.json()).details, { flightIndex: 1, code: "FLIGHT_PRICE_MULTIPLE_CANDIDATES" });
        assert.deepEqual(fs.readFileSync(process.env.DB_FILE), initialBytes);
      }
      assert.equal((await apiRequest("PUT", flight)).status, 200);
      const operator = await apiRequest("POST", { ...flight, price: 300, importedFlightPrice: { kind: "operator" } });
      assert.equal(operator.status, 200);
      assert.deepEqual((await operator.json()).offer.flights[0].importedFlightPrice, { kind: "operator" });
      const legacyCreate = await apiRequest("POST", { ...flight, importSelection: undefined, importedFlightPrice: undefined });
      assert.equal(legacyCreate.status, 200);
      const legacyId = (await legacyCreate.json()).offer.id;
      const legacyUrl = base + "/api/offers/" + legacyId;
      const legacySnapshot = await (await fetch(legacyUrl, { headers: { cookie } })).json();
      const legacyResave = await fetch(legacyUrl, { method: "PUT", headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({ ...legacySnapshot.offer, expectedVersion: legacySnapshot.offerVersion }) });
      assert.equal(legacyResave.status, 200);
      assert.equal((await legacyResave.json()).offer.flights[0].importedFlightPrice, undefined);
      if (!skyscanner) {
        await page.goto(base + "/admin", { waitUntil: "networkidle0" });
        await page.evaluate(() => {
          const transfer = new DataTransfer();
          transfer.items.add(new File(["skyscanner-unknown.jpg"], "skyscanner-unknown.jpg", { type:"image/jpeg" }));
          document.getElementById("smartImportImage").files = transfer.files;
          return uploadSmartImport();
        });
        const debug = await page.$eval("#smartImportReview details pre", node => JSON.parse(node.textContent).flight);
        assert.equal(debug.observations[0].amount, 144);
        assert.equal(debug.flight.price, 0);
        assert.deepEqual(debug.warnings, ["FLIGHT_PRICE_SCOPE_UNKNOWN"]);
        await page.evaluate(() => applyUniversalTravelIntakeResult());
        assert.equal(await page.evaluate(() => flights.length), 0);
      }
      console.log("PASS flight scope POST/PUT matrix, cross-agency rejection, atomic readback and operator price");
      return;
    }

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

    const readOffer = async id => {
      const response = await fetch(base + "/api/offers/" + id, { headers: { cookie } });
      assert.equal(response.status, 200);
      return response.json();
    };
    const importHotel = async filename => {
      const form = new FormData();
      form.append("image", new Blob([filename], { type: "image/jpeg" }), filename);
      const response = await fetch(base + "/api/smart-import", { method: "POST", headers: { cookie }, body: form });
      assert.equal(response.status, 200);
      const hotel = (await response.json()).offerHotelOptions[0];
      const { rate, eurPrice, ...reference } = hotel.checkoutBinding;
      return { ...hotel, sourcePrice: hotel.price, sourceCurrency: hotel.currency, exchangeRate: rate,
        currency: "EUR", price: eurPrice, importedPrice: { kind: "checkout", ...reference } };
    };
    async function assertScopeRejected(snapshot, change, fields, code = "CHECKOUT_COMMERCIAL_SCOPE_MISMATCH") {
      const hotel = { ...snapshot.offer.hotels[0], ...change };
      const before = fs.readFileSync(process.env.DB_FILE);
      const responses = [
        await submit(hotel),
        await put({ ...snapshot, offer: { ...snapshot.offer, hotels: [hotel] } })
      ];
      for (const response of responses) {
        assert.equal(response.status, 422);
        assert.deepEqual((await response.json()).details, { hotelIndex: 0, code, ...(fields ? { fields } : {}) });
      }
      assert.deepEqual(await readOffer(snapshot.offer.id), snapshot);
      assert.deepEqual(fs.readFileSync(process.env.DB_FILE), before);
    }
    const scopeCreate = await submit(offer.hotels[0]);
    assert.equal(scopeCreate.status, 200);
    const scopeId = (await scopeCreate.json()).offer.id;
    const original = await readOffer(scopeId);
    const originalHotel = original.offer.hotels[0];
    const pendingCreate = await submit({ ...originalHotel, occupancy: { ...originalHotel.occupancy, confirmed: false } });
    assert.equal(pendingCreate.status, 200);
    const pending = await readOffer((await pendingCreate.json()).offer.id);
    const confirm = await put({ ...pending, offer: { ...pending.offer, hotels: [originalHotel] } });
    assert.equal(confirm.status, 200);
    const confirmed = await readOffer(pending.offer.id);
    assert.equal(confirmed.offer.hotels[0].occupancy.confirmed, true);
    assert.deepEqual(confirmed.offer.hotels[0].importedPrice, proof);
    assert.equal((await submit(originalHotel)).status, 200);

    const changes = [
      [{ occupancy: { ...originalHotel.occupancy, adults: 3 } }, "adults"],
      [{ occupancy: { ...originalHotel.occupancy, children: 1 } }, "children"],
      [{ occupancy: { ...originalHotel.occupancy, rooms: 2 } }, "rooms"],
      [{ nights: 3 }, "nights"], [{ meal: "Без изхранване" }, "meal"],
      [{ nonRefundable: false }, "nonRefundable"]
    ];
    for (const [change, field] of changes) {
      // Child age evidence is unknown again when the child count changes.
      await assertScopeRejected(original, change, field === "children" ? ["children", "childAges"] : [field]);
    }

    const child = await importHotel("hotel-child.jpg");
    const newBinding = await put({ ...original, offer: { ...original.offer, hotels: [child] } });
    assert.equal(newBinding.status, 200);
    const childSnapshot = await readOffer(scopeId);
    assert.equal(childSnapshot.offer.hotels[0].occupancy.children, 1);
    assert.equal(childSnapshot.offer.hotels[0].importedPrice.referenceId, child.importedPrice.referenceId);
    await assertScopeRejected(childSnapshot, { occupancy: { ...child.occupancy, childAges: [8] } }, ["childAges"]);
    const equivalent = { ...child, meal: "  ВКЛЮЧЕНА   ЗАКУСКА ", nights: "2",
      occupancy: { adults: "2", children: "1", rooms: "1", childAges: ["7"] } };
    assert.equal((await submit(equivalent)).status, 200);
    assert.equal((await put({ ...childSnapshot, offer: { ...childSnapshot.offer, hotels: [equivalent] } })).status, 200);

    const unknown = await importHotel("hotel-unknown.jpg");
    const unknownResponse = await submit(unknown);
    assert.equal(unknownResponse.status, 200);
    const unknownSnapshot = await readOffer((await unknownResponse.json()).offer.id);
    await assertScopeRejected(unknownSnapshot, { nonRefundable: false }, ["nonRefundable"]);
    await assertScopeRejected(unknownSnapshot, { occupancy: { children: 0 } }, ["children", "childAges"]);
    const refundable = await importHotel("hotel-refundable.jpg");
    const refundableResponse = await submit(refundable);
    assert.equal(refundableResponse.status, 200);
    assert.equal((await refundableResponse.json()).offer.hotels[0].nonRefundable, false);

    // Seed a pre-change server record in the isolated DB, without adding commercial evidence to it.
    const db = JSON.parse(fs.readFileSync(process.env.DB_FILE, "utf8"));
    const intake = db.smartImportPriceEvidenceV1[proof.intakeId];
    const v1 = { ...intake.records[0], version: 1, referenceId: crypto.randomUUID() };
    delete v1.commercialScope;
    intake.records.push(v1);
    fs.writeFileSync(process.env.DB_FILE, JSON.stringify(db));
    const latest = await readOffer(scopeId);
    await assertScopeRejected(latest, { importedPrice: { ...proof, version: 1, referenceId: v1.referenceId } },
      undefined, "CHECKOUT_COMMERCIAL_SCOPE_UNAVAILABLE");

    await page.goto(base + "/admin", { waitUntil: "networkidle0" });
    await page.evaluate(offerId => editOffer(offerId), scopeId);
    const alerts = [];
    const captureAlert = dialog => alerts.push(dialog.message());
    page.on("dialog", captureAlert);
    await page.evaluate(() => { hotels[0].nights = 3; return saveOffer(); });
    assert(alerts.some(message => message.includes("nights") && message.includes("Използвай операторска цена")));
    assert.deepEqual((await readOffer(scopeId)).offer.hotels[0].importedPrice, latest.offer.hotels[0].importedPrice);
    await page.evaluate(() => {
      const button = [...document.querySelectorAll("button")].find(item => item.textContent === "Използвай операторска цена");
      button.click();
      return saveOffer();
    });
    page.off("dialog", captureAlert);
    const operatorSnapshot = await readOffer(scopeId);
    assert.equal(operatorSnapshot.offer.hotels[0].nights, 3);
    assert.deepEqual(operatorSnapshot.offer.hotels[0].importedPrice, { kind: "operator", sourceIds: [] });
    console.log("PASS commercial scope POST/PUT matrix, atomic refusals, normalization, legacy, fresh checkout and explicit Admin operator choice");
    if (process.argv.includes("--commercial-scope-only")) return;

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
      document.getElementById("reviewHotelOperator0").checked = true;
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
