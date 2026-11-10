"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const { buildLegacyOfferPrintInput } = require("../gt63-core/legacy-offer-print-input");
const { renderPrintProposal } = require("../gt63-core/renderers/print-presentation");
const { renderMultiHotelProposal } = require("../gt63-core/renderers/multi-hotel");
const { buildPresentationViewModel } = require("../gt63-core/presentation-view-model");
function fixture(travelDates) {
  return buildLegacyOfferPrintInput({ id: "SYNTHETIC-PERIOD-QA", destination: "Rome QA", travelDates,
    clientName: "Synthetic QA", guests: "2 adults", flightPrice: 200, markupPercent: 5, finalPrice: 999,
    flights: [{ route: "SOF -> CIA / CIA -> SOF", departure: "16.11.2026", arrival: "20.11.2026", price: 200 }],
    hotels: [{ id: "alpha", name: "Synthetic Alpha", price: 100, selected: false, images: ["https://example.test/alpha.jpg"] },
      { id: "beta", name: "Synthetic Beta", price: 150, selected: true, images: ["https://example.test/beta.jpg"] }] });
}
test("empty PDF dates use confirmation text in overview and recommendation, never destination", () => {
  for (const dates of ["", "  ", undefined]) {
    const input = fixture(dates), pdf = renderPrintProposal(input);
    assert.match(pdf, /Период на пътуване<\/dt>\s*<dd>Датите са за потвърждение<\/dd>/);
    assert.match(pdf, /Период: Датите са за потвърждение/);
    assert.doesNotMatch(pdf, /Период(?: на пътуване)?(?:<\/dt>\s*<dd>|:)\s*Rome QA/);
  }
});
test("valid explicitly entered PDF dates retain existing localized display", () => {
  for (const dates of ["16.11.2026 - 20.11.2026", "16 November 2026 - 20 November 2026"]) {
    const input = fixture(dates), expected = buildPresentationViewModel(input).travelDates, pdf = renderPrintProposal(input);
    assert.equal(pdf.match(/Период на пътуване<\/dt>\s*<dd>([^<]*)<\/dd>/)?.[1], expected);
    assert(pdf.includes(`Период: ${expected}`));
    assert.doesNotMatch(pdf, /Датите са за потвърждение/);
  }
});
test("PDF period fallback preserves selected hotel, images, price, input and HTML renderer behavior", () => {
  for (const dates of ["", "16.11.2026 - 20.11.2026"]) {
    const input = fixture(dates), snapshot = JSON.stringify(input), html = renderMultiHotelProposal(input);
    const model = buildPresentationViewModel(input), pdf = renderPrintProposal(input);
    assert.equal(model.selectedHotel.id, "beta");
    assert(pdf.includes("Synthetic Beta")); assert(pdf.includes("https://example.test/beta.jpg"));
    assert(pdf.includes(model.selectedPayload.priceDisplay));
    assert.equal(JSON.stringify(input), snapshot);
    assert.equal(renderMultiHotelProposal(input), html);
    assert.equal(buildPresentationViewModel(input).travelDates, model.travelDates);
  }
});
