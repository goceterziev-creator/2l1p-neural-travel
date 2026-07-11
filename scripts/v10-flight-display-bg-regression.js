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

["SOF", "PMO", "JFK", "ZRH", "VIE", "MLE", "HND", "NRT", "PTY", "SCL"].forEach((code) => {
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

[
  "15 September 01",
  "15 September 07",
  "15 September 13",
  "16 September 00",
  "15 September 2001",
  "15 September 2007",
  "15 September 2013",
  "16 September 2000",
  "15 \u0441\u0435\u043f\u0442\u0435\u043c\u0432\u0440\u0438 01",
  "15 \u0441\u0435\u043f\u0442\u0435\u043c\u0432\u0440\u0438 2001",
  "15 September EK 2001"
].forEach((input) => {
  const date = normalizeTravelDate(input);
  assert.strictEqual(date.year, null, `${input} must not invent a year`);
  assert.strictEqual(date.yearMissing, true, `${input} should remain year-missing`);
  assert.ok(!/\b(?:19|20)\d{2}\b/.test(formatDateBg(input)), `${input} should render without an invented year`);
});

assert.strictEqual(formatDateBg("15 September 2026"), "15 септември 2026 г.");

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

const directRoundtrip = renderClientFlightItineraryBg({
  outboundSegments: [
    {
      airline: "Wizz Air",
      flightNumber: "W6 4301",
      from: "SOF",
      to: "LTN",
      departureDate: "9 July",
      departureTime: "06:00",
      arrivalDate: "9 July",
      arrivalTime: "07:15",
      duration: "3h 15min"
    }
  ],
  inboundSegments: [
    {
      airline: "Wizz Air",
      flightNumber: "W6 4302",
      from: "LTN",
      to: "SOF",
      departureDate: "16 July",
      departureTime: "08:20",
      arrivalDate: "16 July",
      arrivalTime: "13:35",
      duration: "3h 15min"
    }
  ]
});

assert.ok(directRoundtrip.includes("Летище София"), "direct roundtrip should render SOF as Bulgarian airport name");
assert.ok(directRoundtrip.includes("Летище Лондон Лутън"), "direct roundtrip should render LTN as Bulgarian airport name");
assert.ok(directRoundtrip.includes("9 юли"), "direct roundtrip should render missing year without guessing");
assert.ok(!directRoundtrip.includes("2009"), "direct roundtrip must not invent a year from date tokens");

const maldivesRendered = renderClientFlightItineraryBg({
  outboundSegments: [
    {
      airline: "Turkish Airlines",
      flightNumber: "TK1030",
      from: "SOF",
      to: "IST",
      departureDate: "15 September",
      departureTime: "01:10",
      arrivalDate: "15 September",
      arrivalTime: "07:10",
      duration: "3h 30min"
    },
    {
      airline: "Turkish Airlines",
      flightNumber: "TK734",
      from: "IST",
      to: "MLE",
      departureDate: "15 September",
      departureTime: "02:10",
      arrivalDate: "15 September",
      arrivalTime: "13:10",
      duration: "10h"
    }
  ],
  inboundSegments: [
    {
      airline: "Etihad Airways",
      flightNumber: "EY877",
      from: "MLE",
      to: "AUH",
      departureDate: "15 September",
      departureTime: "21:25",
      arrivalDate: "16 September",
      arrivalTime: "00:25",
      duration: "4h"
    },
    {
      airline: "Etihad Airways",
      flightNumber: "EY6790",
      from: "AUH",
      to: "ATH",
      departureDate: "16 September",
      departureTime: "02:10",
      arrivalDate: "16 September",
      arrivalTime: "06:15",
      duration: "4h 5min"
    },
    {
      airline: "Etihad Airways",
      flightNumber: "EY790",
      from: "ATH",
      to: "SOF",
      departureDate: "16 September",
      departureTime: "07:35",
      arrivalDate: "16 September",
      arrivalTime: "09:00",
      duration: "1h 25min"
    }
  ]
});

assert.ok(maldivesRendered.includes("Отиване"), "multi-segment renderer should include outbound label");
assert.ok(maldivesRendered.includes("Връщане"), "multi-segment renderer should include inbound label");
assert.ok(maldivesRendered.includes("Летище Истанбул"), "multi-segment renderer should render IST as Bulgarian airport name");
assert.ok(maldivesRendered.includes("Международно летище Велана"), "multi-segment renderer should render MLE as Bulgarian airport name");
assert.ok(maldivesRendered.includes("Международно летище Абу Даби"), "multi-segment renderer should render AUH as Bulgarian airport name");
assert.ok(maldivesRendered.includes("Международно летище Атина"), "multi-segment renderer should render ATH as Bulgarian airport name");
assert.ok(maldivesRendered.includes("15 септември / 16 септември"), "overnight arrival should show both dates without year");
assert.ok(maldivesRendered.includes("21:25 → 00:25"), "overnight arrival should show one clean time row");
assert.ok(!maldivesRendered.includes("SOF -> MLE"), "client renderer should not output compact raw route summaries");
assert.ok(!maldivesRendered.includes("YYYY"), "client renderer should not output placeholders");
assert.ok(!/\b20(?:00|01|07|13)\b/.test(maldivesRendered), "client renderer must not output invented years");

const santiagoRendered = renderClientFlightItineraryBg({
  outboundSegments: [
    {
      airline: "Turkish Airlines",
      flightNumber: "TK 801",
      from: "IST",
      to: "PTY",
      departureDate: "29 March",
      departureTime: "09:40",
      arrivalDate: "29 March",
      arrivalTime: "18:30",
      duration: "16h 50min"
    },
    {
      airline: "Turkish Airlines",
      flightNumber: "TK 9608",
      from: "PTY",
      to: "SCL",
      departureDate: "29 March",
      departureTime: "21:24",
      arrivalDate: "30 March",
      arrivalTime: "05:56",
      duration: "6h 32min"
    }
  ]
});

assert.ok(santiagoRendered.includes("Международно летище Токумен"), "client renderer should render PTY as Bulgarian airport name");
assert.ok(santiagoRendered.includes("Международно летище Артуро Мерино Бенитес"), "client renderer should render SCL as Bulgarian airport name");
assert.ok(!santiagoRendered.includes("PTY → SCL"), "client renderer should not show raw PTY/SCL route row");

console.log("V10 Bulgarian flight display regression PASS");
