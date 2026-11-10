"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");
const Module = require("node:module");
const test = require("node:test");

// Synthetic inputs only; loading the application never starts an HTTP listener.
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "aya-warning-consistency-"));
for (const [key, name] of Object.entries({ DATA_DIR: ".", DB_FILE: "db.json",
  AIRPORT_CONFIG_FILE: "airports.json", OCR_PATTERN_CONFIG_FILE: "ocr.json",
  REGRESSION_LIBRARY_DIR: "library" })) process.env[key] = path.join(scratch, name);
delete process.env.SERPAPI_KEY;
process.on("exit", () => fs.rmSync(scratch, { recursive: true, force: true }));
const filename = path.join(__dirname, "../server.js");
const serverSource = fs.readFileSync(filename, "utf8");
const harness = new Module(filename, module);
harness.filename = filename;
harness.paths = Module._nodeModulePaths(path.dirname(filename));
harness._compile(serverSource + "\nmodule.exports.qaTest = { renderOfferHtml };", filename);
const { normalizeOffer, buildValidationWarnings } = harness.exports;
const admin = fs.readFileSync(path.join(__dirname, "../public/admin.js"), "utf8");
function section(source, start, end) {
  const a = source.indexOf(start), b = source.indexOf(end, a);
  assert(a >= 0 && b > a, start);
  return source.slice(a, b);
}
const browser = vm.createContext({ URL, AYAHotelOccupancy: require("../public/hotel-occupancy") });
vm.runInContext(section(admin, "function getOfferWarnings(", "function warningChips(") +
  section(admin, "function isLikelyHotelImageUrl(", "function calculatePricing(") +
  section(admin, "function offerNeedsReview(", "function syncHomeFieldsToCreateSurface("), browser);

const photos = [123456789, 987654321, 456789123].map(id =>
  `https://cf.bstatic.com/xdata/images/hotel/max1024x768/${id}.jpg`);
const hotel = (id, images = photos) => ({ id, name: `Rome synthetic ${id}`, selected: id === "a",
  room: "Double", meal: "Закуска", price: 100, images,
  occupancy: { adults: 2, children: 0, rooms: 1, childAges: null, confirmed: true } });
const input = (code = "CIA") => ({ destination: "Рим", guests: "2 възрастни",
  travelDates: "16.11.2026 - 20.11.2026", markupPercent: 5, currency: "EUR",
  flights: [{ route: `SOF -> ${code} / ${code} -> SOF`, departure: "16.11.2026", arrival: "20.11.2026", price: 200 }],
  hotels: [hotel("a")], validationWarnings: [] });
const stale = '[WARNING] Полетът не споменава ясно дестинацията "Рим". Проверете маршрута преди изпращане.';
const mismatch = list => list.filter(w => /Полетът не споменава ясно/.test(w));
const imageWarnings = list => list.filter(w => /нямат запазени адреси на снимки/.test(w));

for (const code of ["CIA", "FCO"]) {
  test(`Rome ${code}: remove only the obsolete generated warning and retain transfer INFO`, () => {
    const body = input(code);
    const custom = '[WARNING] Оператор: проверете маршрута и специалните условия.';
    body.validationWarnings = [stale, custom, "Flight destination mismatch: operator note", stale + " Operator note."];
    const before = JSON.stringify(body);
    const offer = normalizeOffer(body);
    assert(!offer.validationWarnings.includes(stale));
    assert(offer.validationWarnings.includes(custom));
    assert(offer.validationWarnings.includes("Flight destination mismatch: operator note"));
    assert(offer.validationWarnings.includes(stale + " Operator note."));
    assert(offer.validationWarnings.some(w => w.startsWith("[INFO]") && /трансфера/.test(w)));
    assert.equal(JSON.stringify(body), before, "normalization must not mutate input records");
    assert.equal(mismatch(buildValidationWarnings(offer)).length, 0);
  });
}

test("unrelated, missing and partial airport routes do not clear destination findings", () => {
  for (const code of ["LHR", "NRT", "SPECIAL", "XFC O", ""]) {
    const body = input(code); body.validationWarnings = [stale];
    assert(normalizeOffer(body).validationWarnings.includes(stale), code);
  }
  const body = input("CIA"); body.destination = "Токио"; body.validationWarnings = [stale];
  assert(normalizeOffer(body).validationWarnings.includes(stale));
  assert(mismatch(normalizeOffer(body).validationWarnings).some(w => w.includes('"Токио"')));
  const notesOnly = input("LHR"); notesOnly.flights[0].notes = "CIA mentioned only in a note";
  notesOnly.validationWarnings = [stale];
  assert(normalizeOffer(notesOnly).validationWarnings.includes(stale));
});

test("mixed Rome and unrelated flights retain the real incoming destination mismatch", () => {
  const custom = "[WARNING] Оператор: проверете втория полет.";
  for (const romeCode of ["CIA", "FCO"]) {
    for (const unrelated of ["LHR", "NRT"]) {
      for (const reverse of [false, true]) {
        const body = input(romeCode);
        body.flights.push({ ...input(unrelated).flights[0] });
        if (reverse) body.flights.reverse();
        body.validationWarnings = [stale, custom];
        const before = JSON.stringify(body);
        const offer = normalizeOffer(body);
        assert(offer.validationWarnings.includes(stale), `${romeCode}/${unrelated}, reverse=${reverse}`);
        assert(offer.validationWarnings.includes(custom));
        assert(offer.validationWarnings.some(w => w.startsWith("[INFO]") && /трансфера/.test(w)));
        assert.deepEqual(offer.flights.map(f => f.route), body.flights.map(f => f.route));
        assert.deepEqual(offer.hotels[0].images, photos);
        assert.equal(JSON.stringify(body), before);
      }
    }
  }
});

test("all Rome flights can resolve the generated warning, but an unproven flight cannot", () => {
  const body = input("CIA"); body.flights.push({ ...input("FCO").flights[0] });
  body.validationWarnings = [stale];
  assert(!normalizeOffer(body).validationWarnings.includes(stale));
  body.flights.push({ airline: "Synthetic flight without a route", price: 10 });
  assert(normalizeOffer(body).validationWarnings.includes(stale));
  body.flights = [];
  assert(buildValidationWarnings({ destination: "Рим", flights: [], hotels: [], finalPrice: 100 },
    { validationWarnings: [stale] }).includes(stale), "empty flight list is not proof");
});

test("two hotels retain a shared URL while duplicates within each gallery are removed", () => {
  const shared = photos[0];
  const body = input(); body.hotels = [hotel("a", [shared, shared + "?size=small"]), hotel("b", [shared])];
  const offer = normalizeOffer(body);
  assert.deepEqual(offer.hotels.map(h => h.images), [[shared], [shared]]);
  assert.equal(imageWarnings(offer.validationWarnings).length, 0);
  const ui = Array.from(browser.dedupeHotelOptionImages(body.hotels));
  assert.deepEqual(ui.map(h => Array.from(h.images)), [[shared], [shared]]);
});

test("all input image aliases survive normalization without changing prices or hotel selection", () => {
  const body = input(); body.hotels = [hotel("a", []), hotel("b", [])];
  body.hotels[0].imageUrls = [photos[0]]; body.hotels[1].heroImage = photos[0];
  const offer = normalizeOffer(body);
  assert.deepEqual(offer.hotels.map(h => h.images), [[photos[0]], [photos[0]]]);
  assert.deepEqual(offer.hotels.map(h => [h.id, h.price, h.selected]), [["a", 100, true], ["b", 100, false]]);
  assert.equal(offer.flightPrice, 200); assert.equal(offer.hotelPrice, 100);
  assert.equal(offer.finalPrice, 315);
  assert.equal(offer.flights[0].route, body.flights[0].route);
});

test("a genuinely missing or invalid hotel image URL remains a warning, without fallback invention", () => {
  for (const images of [[], ["https://www.booking.com/hotel/it/example.html"], ["not-an-image"]]) {
    const body = input(); body.hotels = [hotel("a", images)];
    const offer = normalizeOffer(body);
    assert.deepEqual(offer.hotels[0].images, []);
    assert.equal(imageWarnings(offer.validationWarnings).length, 1);
  }
});

test("generated stored image counts are recalculated, while custom image warnings remain", () => {
  const body = input();
  const old = "[WARNING] 2 хотел(а) нямат запазени адреси на снимки. Проверете кориците на PDF преди изпращане.";
  const custom = "[WARNING] Оператор: снимката може да е за друга сграда.";
  body.validationWarnings = [old, custom];
  const offer = normalizeOffer(body);
  assert(!offer.validationWarnings.includes(old));
  assert(offer.validationWarnings.includes(custom));
  body.hotels = [hotel("a", [])];
  assert.equal(imageWarnings(normalizeOffer(body).validationWarnings).length, 1);
});

test("legacy HTML galleries do not steal another hotel's three stored images", async () => {
  const body = input(); body.hotels = [hotel("a"), hotel("b")];
  const offer = normalizeOffer(body);
  // Isolate rendering from normalization: both stored galleries already exist.
  offer.hotels = body.hotels;
  const before = JSON.stringify(offer);
  const html = await harness.exports.qaTest.renderOfferHtml(offer);
  const cards = [...html.matchAll(/<article class="card hotel-card[\s\S]*?<\/article>/g)];
  assert.equal(cards.length, 2);
  for (const [card] of cards) {
    for (const photo of photos) assert(card.includes(`src="${photo}"`), photo);
    assert.equal((card.match(/<img /g) || []).length, 3);
  }
  assert.equal(JSON.stringify(offer), before, "rendering does not change stored input");
});

test("Bulgarian findings classify by category while INFO and CRITICAL take precedence", () => {
  for (const [warning, expected] of [
    [stale, "destination"],
    ["[WARNING] Локацията на хотела не съвпада с дестинацията.", "destination"],
    ["[WARNING] Два хотела нямат запазени адреси на снимки.", "images"],
    ["[WARNING] Липсват потвърдени дати на пътуването.", "dates"],
    ["[WARNING] Проверете периода и нощувките.", "dates"],
    ["[WARNING] Хотелската заетост не е потвърдена.", "guests"],
    ["[WARNING] Проверете броя възрастни, деца и пътници.", "guests"],
    ["[WARNING] Хотелът показва ограничена наличност.", "availability"],
    ["[INFO] Полетът каца в CIA; проверете трансфера до хотела.", "info"],
    ["[CRITICAL] Липсват снимки и дати.", "critical"]
  ]) assert.equal(browser.classifyWarning(warning), expected, warning);
});

test("warningsDismissed hides neither active QA findings nor readiness blockers", () => {
  const offer = normalizeOffer(input()); offer.validationWarnings = [stale];
  const score = browser.qaScore(offer);
  assert.equal(browser.offerReadyToSend(offer), false);
  offer.warningsDismissed = true;
  assert.equal(browser.qaScore(offer), score);
  assert(Array.from(browser.getOfferWarnings(offer)).includes(stale));
  assert.equal(browser.offerReadyToSend(offer), false);
  offer.validationWarnings = ["[INFO] Полетът каца в CIA; проверете трансфера до хотела."];
  assert.equal(browser.qaScore(offer), 100);
  assert.equal(browser.offerReadyToSend(offer), true);
});
