"use strict";

// Source-level regression for the shared HTML/print/PDF notice projection.
// Run: node test/client-flight-diagnostics-provenance-regression.js
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const source = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
const between = (start, end) => {
  const a = source.indexOf(start);
  assert.ok(a !== -1, "missing start: " + start);
  const b = source.indexOf(end, a + start.length);
  assert.ok(b > a, "missing end: " + end);
  return source.slice(a, b);
};
const validation = between("function buildValidationWarnings(", "\nfunction uniqueOfferFlights(");
const projection = between("function projectOfferNotices(", "\nfunction renderGt63RegistryOfferHtml(");
const html = between("async function renderOfferHtml(", "\nfunction ");
assert.match(validation, /add\("FLIGHT_DATE_SAFETY", message, "OPERATOR"/);
assert.match(validation, /add\("FLIGHT_DATES_UNCONFIRMED_CLIENT", "\[WARNING\] Датите на полетите предстои да бъдат потвърдени\.", "CLIENT"\)/);
assert.match(validation, /add\("AIRPORT_TRANSFER",[^\n]*"OPERATOR"\)/);
assert.match(validation, /add\("AIRPORT_TRANSFER_CLIENT", "\[INFO\] Трансферът от летището до хотела подлежи на потвърждение\.", "CLIENT"\)/);
assert.match(projection, /generated\.filter\(notice => notice\.audience === "CLIENT"\)/);
assert.match(html, /projectOfferNotices\(offer\)\.map\(notice => notice\.message\)/);
assert.match(html, /const \{ forPdf = false, showWarnings = true \} = options/);
assert.match(html, /const segments = routeSegments\(flight\.route \|\| offer\.flightRoute\)/);
console.log("PASS: operator flight diagnostics excluded from shared HTML/print/PDF notices; neutral client notices preserved; no inferred flight segments");
