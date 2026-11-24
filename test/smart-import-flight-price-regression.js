"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { flightText, normalizePriceObservations, reviewFlightPrice, sourceFlightRecord } =
  require("../server/smart-import-flight-price");

const route = { route: "SOF -> SAW / SAW -> SOF",
  outboundSegments: [{ from: "SOF", to: "SAW" }], inboundSegments: [{ from: "SAW", to: "SOF" }] };
const total = { sourceId: "SRC-1", label: "Общо", text: "288 €", amount: 288, currency: "EUR",
  priceUnit: "party-total", routeScope: "round-trip", componentRole: "fare-total",
  passengerScope: { count: 2, adults: 2, children: 0, infants: 0 } };
const headline = { sourceId: "SRC-1", label: "11 оферти от", text: "144 €", amount: 144, currency: "EUR" };
const review = items => reviewFlightPrice(route, normalizePriceObservations(items), ["SRC-1"], 2);

test("headline stays unknown; selected amount comes from the evidenced total", () => {
  assert.equal(normalizePriceObservations([headline])[0].priceUnit, "unknown");
  assert.equal(review([headline, total]).total.amount, 288);
});
for (const [name, evidence, expected] of [
  ["unknown 144 with two passengers", [headline], "FLIGHT_PRICE_SCOPE_UNKNOWN"],
  ["explicit per-person without a party total", [{ ...total, priceUnit: "per-person" }], "FLIGHT_PRICE_SCOPE_UNKNOWN"],
  ["segment only", [{ ...total, routeScope: "segment" }], "FLIGHT_PRICE_SCOPE_UNKNOWN"],
  ["one way on round trip", [{ ...total, routeScope: "one-way" }], "FLIGHT_PRICE_SCOPE_UNKNOWN"],
  ["tax", [{ ...total, componentRole: "tax" }], "FLIGHT_PRICE_SCOPE_UNKNOWN"],
  ["add-on", [{ ...total, componentRole: "add-on" }], "FLIGHT_PRICE_SCOPE_UNKNOWN"],
  ["unknown currency", [{ ...total, currency: "" }], "FLIGHT_PRICE_EVIDENCE_INCOMPLETE"],
  ["mismatched party count", [{ ...total, passengerScope: { count: 3 } }], "FLIGHT_PRICE_EVIDENCE_INCOMPLETE"],
  ["conflicting totals", [total, { ...total, text: "289 €", amount: 289 }], "FLIGHT_PRICE_TOTAL_CONFLICT"],
  ["source outside candidate", [{ ...total, sourceId: "SRC-2" }], "FLIGHT_PRICE_SCOPE_UNKNOWN"]
]) test(name, () => assert.deepEqual(review(evidence), { warning: expected }));

for (const label of ["Обща цена за всички пътници", "Обща цена за всички пасажери"]) {
  test(`Booking total label still requires a proven party count: ${label}`, () => {
    const booking = { ...total, label, text: "294,00 €", amount: 294 };
    assert.deepEqual(review([{ ...booking, passengerScope: { count: null } }]),
      { warning: "FLIGHT_PRICE_EVIDENCE_INCOMPLETE" });
    assert.equal(review([booking]).total.amount, 294);
  });
}

test("year resolution requires partial source dates rather than only times", () => {
  const { resolveYearContext } = require("../public/flight-data-consistency");
  const flight = {
    outboundSegments: [{ from: "SOF", to: "SAW", departure: "25-ноем. 12:55", arrival: "25-ноем. 15:10" }],
    inboundSegments: [{ from: "SAW", to: "SOF", departure: "27-ноем. 18:05", arrival: "27-ноем. 18:25" }]
  };
  const context = { now: new Date("2026-11-24T12:00:00Z"), verifiedTravelDates: "2026-11-25 – 2026-11-27" };
  assert.equal(resolveYearContext(flight, context).flight.outboundSegments[0].departure, "2026-11-25T12:55");
  const timesOnly = Object.fromEntries(Object.entries(flight).map(([leg, segments]) => [leg, segments.map(segment => ({
    ...segment, departure: segment.departure.slice(-5), arrival: segment.arrival.slice(-5)
  }))]));
  assert.deepEqual(resolveYearContext(timesOnly, context), { ok: false, reason: "Ambiguous source date" });
});

test("null sentinels do not masquerade as flight facts", () => {
  for (const value of [null, undefined, "", " null ", "NULL", "Не е посочено"]) assert.equal(flightText(value), "");
  assert.equal(flightText("25-ноем. 12:55"), "25-ноем. 12:55");
});

test("EUR conversion uses the server quote and rounds to cents", () => {
  const priceReview = review([{ ...total, currency: "USD", text: "320 USD", amount: 320 }]);
  const args = { candidate: { priceReview, flight: route, provider: "Skyscanner", candidateId: "candidate", sourceIds: ["SRC-1"] },
    intakeId: "SMART-1-aaaaaa", agencyId: "QA" };
  assert.equal(sourceFlightRecord(args), null);
  const record = sourceFlightRecord({ ...args, quote: { rates: { USD: 1.3 }, provider: "source" } });
  assert.equal(record.rate, 1.3);
  assert.equal(record.eurPrice, 246.15);
});
