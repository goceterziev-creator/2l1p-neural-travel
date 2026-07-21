"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const viewModel = require("../gt63-core/presentation-view-model");
const multiHotelRendererJs = fs.readFileSync(path.join(__dirname, "..", "gt63-core", "renderers", "multi-hotel.js"), "utf8");
const productIndexHtml = fs.readFileSync(path.join(__dirname, "..", "gt63-core", "product", "index.html"), "utf8");

const hotelOptions = Array.from({ length: 6 }, (_, index) => ({
  id: `hotel-${index + 1}`,
  name: `Print Test Hotel ${index + 1}`,
  price: 1000 + (index * 100),
  room: `Room ${index + 1}`,
  meal: index === 0 ? "Breakfast included" : "",
  stars: index === 5 ? "4" : "5",
  selected: index === 2
}));

const input = {
  destination: { name: "Токио", requested: "2027-03-28 - 2027-04-08" },
  client: { travelers: "2", travelDates: "2027-03-28 - 2027-04-08" },
  contact: { whatsappPhone: "+359 885 078 980" },
  pricing: { currency: "EUR", flightAmount: 500, marginPercent: 5 },
  hotelOptions,
  hotel: hotelOptions[0]
};

const selectedByFlag = viewModel.resolvePrintModeContract(input);
assert.equal(selectedByFlag.mode, "selected", "print contract should default to selected mode");
assert.equal(selectedByFlag.selectedHotelIndex, 2, "selected flag should resolve the persisted selected hotel");
assert.equal(selectedByFlag.selectedHotel.name, "Print Test Hotel 3", "selected flag should resolve hotel option 3");

const selectedById = viewModel.resolvePrintModeContract(input, {
  mode: "comparison",
  selectedHotelId: "hotel-6"
});
assert.equal(selectedById.mode, "comparison", "print contract should accept comparison mode");
assert.equal(selectedById.selectedHotelIndex, 5, "explicit selectedHotelId should resolve hotel option 6");
assert.equal(selectedById.selectedHotel.name, "Print Test Hotel 6", "explicit selectedHotelId should override persisted selection");
assert.equal(selectedById.explicitSelectedHotelId, true, "contract should record explicit selectedHotelId usage");

const selectedView = viewModel.buildPresentationViewModel(input, {
  mode: "selected",
  selectedHotelId: "hotel-6"
});
assert.equal(selectedView.selectedHotel.name, "Print Test Hotel 6", "shared presentation view model should expose one selectedHotel source");
assert.equal(selectedView.selectedMealPlan, "Хранене за потвърждение", "selected meal should come from selected hotel, not hotel option 1");
assert.equal(/закуска/i.test(selectedView.selectedRecommendationReasons.join(" ")), false, "breakfast from non-selected hotel must not leak into recommendation");
assert.match(selectedView.selectedPayload.whatsappUrl, /Print%20Test%20Hotel%206/, "WhatsApp context should use selected hotel");
assert.match(selectedView.selectedPayload.whatsappUrl, /%D0%A5%D1%80%D0%B0%D0%BD%D0%B5%D0%BD%D0%B5%20%D0%B7%D0%B0%20%D0%BF%D0%BE%D1%82%D0%B2%D1%8A%D1%80%D0%B6%D0%B4%D0%B5%D0%BD%D0%B8%D0%B5/, "WhatsApp context should use selected meal fallback");

assert.throws(
  () => viewModel.resolvePrintModeContract(input, { selectedHotelId: "missing-hotel" }),
  (error) => error.code === "GT63_PRINT_INVALID_SELECTED_HOTEL_ID" && error.status === 400,
  "invalid explicit selectedHotelId should return a controlled error without fallback"
);

assert.throws(
  () => viewModel.resolvePrintModeContract(input, { mode: "gallery" }),
  (error) => error.code === "GT63_PRINT_INVALID_MODE" && error.status === 400,
  "unsupported print mode should return a controlled error"
);

const fallbackInput = {
  hotelOptions: [
    { id: "fallback-1", name: "Fallback Hotel 1", price: 900 },
    { id: "fallback-2", name: "Fallback Hotel 2", price: 1000 }
  ],
  pricing: { currency: "EUR" }
};
const fallback = viewModel.resolvePrintModeContract(fallbackInput);
assert.equal(fallback.selectedHotelIndex, 0, "first hotel should be final fallback when no selected state exists");
assert.equal(fallback.fallbackUsed, true, "contract should mark documented final fallback");

assert.match(multiHotelRendererJs, /presentationViewModel\.buildPresentationViewModel/, "interactive renderer should consume the shared presentation view model");
assert.match(multiHotelRendererJs, /presentationViewModel\.selectedOptionPayload/, "interactive renderer should delegate selected payload business logic");
assert.match(multiHotelRendererJs, /presentationViewModel\.supportedRecommendationReasons/, "interactive renderer should delegate recommendation business logic");
assert.equal(/function renderMultiHotelProposal\(input\)[\s\S]{0,600}hotelOptions\.find\(\(hotel\) => hotel\?\.selected\)/.test(multiHotelRendererJs), false, "interactive renderer should not resolve selected hotel independently in render entrypoint");
assert.ok(
  productIndexHtml.indexOf("../presentation-view-model.js") >= 0 &&
    productIndexHtml.indexOf("../presentation-view-model.js") < productIndexHtml.indexOf("../renderers/multi-hotel.js"),
  "browser product shell should load shared presentation view model before the multi-hotel renderer"
);

console.log("PRESENTATION VIEW MODEL REGRESSION PASS");
