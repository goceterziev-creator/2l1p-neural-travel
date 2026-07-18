"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

globalThis.GT63FlightDisplayBg = require("../gt63-core/flight-display-bg");
globalThis.GT63LuxuryV11Renderer = require("../gt63-core/luxury-v11-renderer");
globalThis.GT63MultiHotelRenderer = require("../gt63-core/renderers/multi-hotel");

const { adaptSmartImportForProduct } = require("../gt63-core/smart-import-consumer-adapter");
const { buildProposalInputFromProductModel } = require("../gt63-core/proposal-input-adapter");
const registry = require("../gt63-core/proposal-renderer-registry");

const fixturePath = path.join(__dirname, "..", "test", "fixtures", "smart-import", "flight-hotel-mixed.json");
const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
const productModel = adaptSmartImportForProduct(fixture);

const multiHotelModel = JSON.parse(JSON.stringify(productModel));
multiHotelModel.hotelOptions = Array.from({ length: 10 }, (_, index) => ({
  ...multiHotelModel.hotel,
  name: `Hotel ${index + 1}`,
  price: 1000 + (index * 100),
  selected: index === 9,
  websiteUrl: `https://example.test/hotel-${index + 1}`,
  heroImage: `https://images.example.test/hotel-${index + 1}-hero.jpg`,
  imageUrls: [
    `https://images.example.test/hotel-${index + 1}-1.jpg`,
    `https://images.example.test/hotel-${index + 1}-2.jpg`,
    `https://images.example.test/hotel-${index + 1}-3.jpg`,
    `https://images.example.test/hotel-${index + 1}-4.jpg`
  ]
}));
multiHotelModel.hotel = multiHotelModel.hotelOptions[9];
multiHotelModel.proposalTemplate = {
  recommended: "multi-hotel",
  selected: "multi-hotel",
  source: "resolver",
  reason: "10 accommodation options detected."
};

const multiHotelInput = buildProposalInputFromProductModel(multiHotelModel, {
  clientName: "G. Terziev",
  destination: "Maldives",
  travelDates: "31 August - 15 September",
  travelers: "2"
});

assert.equal(registry.selectedTemplate(multiHotelInput), "multi-hotel", "registry should read selected proposal template");
assert.equal(registry.rendererFor(multiHotelInput).label, "Multi-Hotel Selector", "registry should select multi-hotel renderer");

const multiHotelHtml = registry.renderProposal(multiHotelInput);
assert.match(multiHotelHtml, /MULTI-HOTEL BRIEF/, "multi-hotel renderer should identify the template");
assert.doesNotMatch(multiHotelHtml, /multi-hotel-sequential-grid/, "multi-hotel renderer should no longer use the old comparison grid wrapper");
assert.match(multiHotelHtml, /v11-flight-summary-grid/, "multi-hotel renderer should show premium flight summary cards");
assert.match(multiHotelHtml, /&#1054;&#1073;&#1086;&#1073;&#1097;&#1077;&#1085;&#1080;&#1077; &#1085;&#1072; &#1087;&#1086;&#1083;&#1077;&#1090;&#1072;/, "multi-hotel renderer should label the flight summary in Bulgarian");
assert.match(multiHotelHtml, /v11-detailed-flight-card/, "multi-hotel renderer should keep detailed flight information below the transfer section");
assert.match(multiHotelHtml, /&#1042;&#1072;&#1088;&#1080;&#1072;&#1085;&#1090;&#1080; &#1079;&#1072; &#1085;&#1072;&#1089;&#1090;&#1072;&#1085;&#1103;&#1074;&#1072;&#1085;&#1077;/, "multi-hotel renderer should label accommodation options in Bulgarian");
assert.match(multiHotelHtml, /Hotel option 1/, "multi-hotel renderer should use neutral hotel option labels");
assert.match(multiHotelHtml, /Hotel option 2/, "multi-hotel renderer should render second hotel option");
assert.match(multiHotelHtml, /Hotel option 3/, "multi-hotel renderer should render third hotel option");
assert.match(multiHotelHtml, /Hotel option 10/, "multi-hotel renderer should render tenth hotel option");
assert.match(multiHotelHtml, /10 варианта за настаняване/, "multi-hotel renderer should explain option count factually");
assert.match(multiHotelHtml, /&#1048;&#1079;&#1073;&#1088;&#1072;&#1085; &#1093;&#1086;&#1090;&#1077;&#1083;/, "multi-hotel renderer should identify the selected hotel in the hero");
assert.match(multiHotelHtml, /Hotel 10/, "multi-hotel renderer should preserve selected hotel 10 in the hero/details");
assert.match(multiHotelHtml, /Крайна цена за избрания хотел/, "multi-hotel renderer should keep the selected option estimate label");
assert.match(multiHotelHtml, /js-selected-option-price/, "multi-hotel renderer should expose a dynamic selected package price");
assert.match(multiHotelHtml, /v11-hotel-gallery/, "multi-hotel renderer should show a hotel image gallery");
assert.match(multiHotelHtml, /v11-selected-hotel-gallery/, "multi-hotel renderer should show a larger selected hotel gallery");
assert.match(multiHotelHtml, /v11-gallery-dialog/, "multi-hotel renderer should include fullscreen gallery support");
assert.match(multiHotelHtml, /data-gallery-action="next"/, "multi-hotel renderer should include gallery next navigation");
assert.match(multiHotelHtml, /pointerdown/, "multi-hotel renderer should include touch or pointer gallery navigation");
assert.doesNotMatch(multiHotelHtml, /hotel-10-4\.jpg/, "multi-hotel renderer should not render more than three compact gallery images per hotel option");
assert.match(multiHotelHtml, /https:\/\/example\.test\/hotel-10/, "multi-hotel renderer should preserve hotel website links from websiteUrl");
assert.match(multiHotelHtml, /data-option-index="9"/, "multi-hotel renderer should expose selectable state for hotel option 10");
assert.match(multiHotelHtml, /data-selected-detail-index="9"/, "multi-hotel renderer should expose details for hotel option 10");
assert.match(multiHotelHtml, /js-selected-option-image/, "multi-hotel renderer should expose dynamic hero image target");
assert.match(multiHotelHtml, /js-selected-option-website/, "multi-hotel renderer should expose dynamic hotel website target");
assert.match(multiHotelHtml, /js-selected-option-transfer/, "multi-hotel renderer should expose dynamic transfer summary target");
assert.match(multiHotelHtml, /v11-selected-hotel-detail active/, "multi-hotel renderer should mark the selected hotel details active");
assert.match(multiHotelHtml, /&#1054;&#1073;&#1097;&#1072; &#1082;&#1083;&#1080;&#1077;&#1085;&#1090;&#1089;&#1082;&#1072; &#1094;&#1077;&#1085;&#1072;/, "multi-hotel renderer should show package price per hotel option");
assert.match(multiHotelHtml, /&#1042;&#1080;&#1078; &#1093;&#1086;&#1090;&#1077;&#1083;&#1072;/, "multi-hotel renderer should show hotel link action when URL exists");
assert.match(multiHotelHtml, /v11-prefer-option/, "multi-hotel renderer should make hotel preference selectable");
assert.match(multiHotelHtml, /Включено в пакета/, "multi-hotel renderer should show a package summary in the hero");
assert.match(multiHotelHtml, /Защо избрахме тези варианти/, "multi-hotel renderer should show a supported-facts insight block");
assert.match(multiHotelHtml, /&#1058;&#1088;&#1072;&#1085;&#1089;&#1092;&#1077;&#1088;/, "multi-hotel renderer should include transfer information");
assert.match(multiHotelHtml, /\u041d\u0435\u043e\u0431\u0445\u043e\u0434\u0438\u043c \u0442\u0440\u0430\u043d\u0441\u0444\u0435\u0440/, "Maldives multi-hotel renderer should not silently imply transfer is irrelevant");
assert.equal(/Premium option|Balanced option|Best price|Balan|Premi izhiv|Nai-dobra/.test(multiHotelHtml), false, "multi-hotel renderer must not invent qualitative hotel labels");
assert.equal(/Р[ ’џћ›ќ—Ґ]|С[џњ‰‡ђ]/.test(multiHotelHtml), false, "multi-hotel renderer should not output mojibake Bulgarian labels");
assert.equal(/contractVersion|classifications|universalIntakeDeprecated|debug|sourceAuthority/.test(multiHotelHtml), false, "registry render must not leak engine fields");

const flightIndex = multiHotelHtml.indexOf("v11-flight-card");
const hotelIndex = multiHotelHtml.indexOf("v11-hotel-card");
assert.ok(flightIndex >= 0 && hotelIndex > flightIndex, "multi-hotel renderer should render flight before hotel options");
const transferIndex = multiHotelHtml.indexOf("v11-transfer-card");
const detailedFlightIndex = multiHotelHtml.indexOf("v11-detailed-flight-card");
assert.ok(transferIndex >= 0 && detailedFlightIndex > transferIndex, "multi-hotel renderer should render detailed flight information after transfer");

const cityInput = buildProposalInputFromProductModel({
  ...productModel,
  proposalTemplate: {
    recommended: "city-discovery",
    selected: "city-discovery",
    source: "resolver",
    reason: "Single city proposal detected."
  }
}, {
  destination: "Tokyo"
});
const cityHtml = registry.renderProposal(cityInput);
assert.match(cityHtml, /V11 CLIENT BRIEF/, "non-multi-hotel templates should use the V11 fallback renderer until dedicated renderers exist");

assert.throws(() => registry.renderProposal({
  ...cityInput,
  proposalTemplate: { selected: "unsupported-template" }
}), /Unsupported proposal template/, "registry should fail clearly for unsupported templates");

console.log("PROPOSAL RENDERER REGISTRY REGRESSION PASS");
