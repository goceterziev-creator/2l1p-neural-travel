"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");

// Actual server validation, with disposable local storage only; no HTTP or OCR calls.
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "aya-rome-route-"));
for (const [key, name] of Object.entries({
  DB_FILE: "database.json", DATA_DIR: ".", AIRPORT_CONFIG_FILE: "airports.json",
  OCR_PATTERN_CONFIG_FILE: "ocr.json", REGRESSION_LIBRARY_DIR: "regression-library"
})) process.env[key] = path.join(scratch, name);
process.on("exit", () => fs.rmSync(scratch, { recursive: true, force: true }));
const { buildValidationWarnings, normalizeOffer } = require("../server");

const admin = fs.readFileSync(path.join(__dirname, "../public/admin.js"), "utf8");
function section(start, end) {
  const a = admin.indexOf(start), b = admin.indexOf(end, a);
  assert(a >= 0 && b > a, start);
  return admin.slice(a, b);
}
const browser = vm.createContext({});
vm.runInContext(section("function normalizeText(", "function isNoisyFlightDisplay(") +
  section("function destinationAlias(", "function destinationPresentationType(") +
  section("const DESTINATION_QA_PROFILES =", "function parseAdultCount("), browser);

const flight = route => ({ route, departure: "16.11.2026", arrival: "20.11.2026", price: 100 });
const fixture = (destination, route) => ({
  destination, travelDates: "16.11.2026 - 20.11.2026", guests: "2 възрастни",
  finalPrice: 200, flights: [flight(route)], hotels: []
});
const mismatch = warnings => warnings.filter(w => /\[WARNING\] Полетът не споменава ясно/.test(w));
function check(destination, route, expected) {
  assert.equal(mismatch(buildValidationWarnings(fixture(destination, route))).length, expected ? 0 : 1,
    `server: ${destination}, ${route}`);
  assert.equal(mismatch(browser.getDestinationMismatchWarnings(destination, flight(route))).length,
    expected ? 0 : 1, `browser warnings: ${destination}, ${route}`);
  assert.equal(browser.destinationMatchesFlight(destination, flight(route)), expected,
    `Smart Import gate: ${destination}, ${route}`);
}

test("Rome city code accepts the exact reported route and dates in server and Smart Import QA", () => {
  check("Рим", "SOF -> ROM / ROM -> SOF", true);
  const saved = normalizeOffer(fixture("Рим", "SOF -> ROM / ROM -> SOF"));
  assert.equal(mismatch(saved.validationWarnings).length, 0);
  assert.equal(saved.flights[0].route, "SOF -> ROM / ROM -> SOF");
  assert.equal(saved.flights[0].departure, "16.11.2026");
  assert.equal(saved.flights[0].arrival, "20.11.2026");
});

test("ROM is a case-insensitive city alias, not a claimed physical airport", () => {
  for (const route of ["SOF → ROM / ROM → SOF", "sof-rom / rom-sof", "SOF -> rom / rom -> SOF"])
    check("Rome", route, true);
  const warnings = buildValidationWarnings(fixture("Рим", "SOF -> ROM / ROM -> SOF"));
  assert.equal(warnings.some(w => /валидно летище/.test(w)), false);
});

test("ROM does not match substrings, longer codes or Unicode-adjacent text", () => {
  for (const code of ["PROMO", "FROM", "BROMLEY", "ROM123", "XROM", "ROMX", "ROM_", "БROM", "ROMя"]) {
    check("Рим", `SOF -> ${code} / ${code} -> SOF`, false);
    assert.notEqual(browser.getDestinationQaProfile(code)?.key, "rome", code);
  }
});

test("existing Rome airport and textual routes retain their previous behavior", () => {
  // Browser's legacy CIA-only gate is outside this ROM repair; FCO and city names already match.
  for (const code of ["FCO", "Rome", "Roma", "Рим", "Fiumicino"])
    check("Рим", `SOF -> ${code} / ${code} -> SOF`, true);
  assert.equal(mismatch(buildValidationWarnings(fixture("Рим", "SOF -> CIA / CIA -> SOF"))).length, 0);
});

test("other supported destinations and genuine cross-destination mismatches remain protected", () => {
  for (const [destination, code] of [["Токио", "NRT"], ["Токио", "HND"],
    ["Барселона", "BCN"], ["Бари", "BRI"], ["Малдиви", "MLE"]]) {
    check(destination, `SOF -> ${code} / ${code} -> SOF`, true);
    check(destination, "SOF -> ROM / ROM -> SOF", false);
    check("Рим", `SOF -> ${code} / ${code} -> SOF`, false);
  }
  check("Рим", "SOF -> LHR / LHR -> SOF", false);
  assert.equal(mismatch(buildValidationWarnings(fixture("Прага", "SOF -> PRG / PRG -> SOF"))).length, 0);
  assert.equal(mismatch(buildValidationWarnings(fixture("Прага", "SOF -> ROM / ROM -> SOF"))).length, 1);
});

test("fresh validation is distinct from retained incoming warning evidence", () => {
  const offer = fixture("Рим", "SOF -> ROM / ROM -> SOF");
  const stale = '[WARNING] Полетът не споменава ясно дестинацията "Рим". Проверете маршрута преди изпращане.';
  const other = "[WARNING] Synthetic independent review remains unresolved.";
  assert.equal(mismatch(buildValidationWarnings(offer)).length, 0);
  const saved = normalizeOffer({ ...offer, validationWarnings: [stale, other] });
  assert(saved.validationWarnings.includes(stale), "do not silently discard previously supplied warnings");
  assert(saved.validationWarnings.includes(other));
});
