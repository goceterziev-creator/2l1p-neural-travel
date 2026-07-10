const assert = require("assert");
const {
  resolveAirport,
  formatAirportBg
} = require("../server/travel-normalizers/airport-normalizer");
const {
  normalizeTravelDate,
  formatDateBg,
  isCompleteTravelDate
} = require("../server/travel-normalizers/date-normalizer");
const {
  renderClientFlightItineraryBg
} = require("../server/renderers/flight-display-bg");

["SOF", "PMO", "JFK", "ZRH", "VIE", "MLE", "HND", "NRT"].forEach((code) => {
  const airport = resolveAirport(code);
  assert.strictEqual(airport.iata, code, `${code} should resolve by IATA`);
  assert.ok(formatAirportBg(code).includes("Летище") || formatAirportBg(code).includes("летище"), `${code} should format as airport`);
});

[
  ["2026-07-16", "16 юли 2026 г."],
  ["16.07.2026", "16 юли 2026 г."],
  ["16 Jul 2026", "16 юли 2026 г."],
  ["16 юли 2026 г.", "16 юли 2026 г."]
].forEach(([input, expected]) => {
  assert.strictEqual(formatDateBg(input), expected, `${input} should format safely`);
  assert.strictEqual(isCompleteTravelDate(input), true, `${input} should be complete`);
});

const partial = normalizeTravelDate("16 July");
assert.strictEqual(partial.day, 16);
assert.strictEqual(partial.month, 7);
assert.strictEqual(partial.year, null);
assert.strictEqual(partial.yearMissing, true);
assert.strictEqual(formatDateBg("16 July"), "16 юли");

const manual = normalizeTravelDate("16 July", { reviewedYear: 2026 });
assert.strictEqual(manual.year, 2026);
assert.strictEqual(manual.reviewed, true);
assert.strictEqual(formatDateBg(manual), "16 юли 2026 г.");

const rendered = renderClientFlightItineraryBg({
  outboundSegments: [
    {
      airline: "Wizz Air",
      flightNumber: "W6 4313",
      from: "SOF",
      to: "PMO",
      departure: "2026-07-16T20:20",
      arrival: "2026-07-16T21:15",
      duration: "1h 55min"
    }
  ],
  inboundSegments: [
    {
      airline: "SWISS",
      flightNumber: "LX 14",
      from: "ZRH",
      to: "JFK",
      departure: "16 July",
      arrival: "16 July",
      duration: "9h 20min"
    }
  ]
});

assert.ok(rendered.includes("Летище София"), "client renderer should use Bulgarian airport names");
assert.ok(rendered.includes("Летище Палермо"), "client renderer should use PMO dictionary name");
assert.ok(rendered.includes("Летище Цюрих"), "client renderer should use ZRH dictionary name");
assert.ok(rendered.includes("Международно летище „Джон Ф. Кенеди“"), "client renderer should use JFK dictionary name");
assert.ok(rendered.includes("16 юли 2026 г."), "complete dates should include year and г.");
assert.ok(rendered.includes("16 юли"), "partial date should render without invented year");
assert.ok(!rendered.includes("YYYY"), "client renderer must not show YYYY");
assert.ok(!rendered.includes("2026-07-16"), "client renderer must not show ISO date");
assert.ok(!rendered.includes("20:20 / 21:15"), "client renderer must not show duplicate compact time row");

console.log("V10 Bulgarian flight display regression PASS");
