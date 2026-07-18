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
multiHotelModel.hotelOptions = [
  {
    ...multiHotelModel.hotel,
    name: "Hotel Alpha",
    price: 1000,
    selected: true,
    websiteUrl: "https://example.test/hotel-alpha",
    imageUrls: [
      "https://images.example.test/alpha-1.jpg",
      "https://images.example.test/alpha-2.jpg",
      "https://images.example.test/alpha-3.jpg",
      "https://images.example.test/alpha-4.jpg"
    ]
  },
  { ...multiHotelModel.hotel, name: "Hotel Beta", price: 1200, selected: false },
  { ...multiHotelModel.hotel, name: "Hotel Gamma", price: 900, selected: false }
];
multiHotelModel.hotel = multiHotelModel.hotelOptions[0];
multiHotelModel.proposalTemplate = {
  recommended: "multi-hotel",
  selected: "multi-hotel",
  source: "resolver",
  reason: "3 accommodation options detected."
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
assert.match(multiHotelHtml, /multi-hotel-sequential-grid/, "multi-hotel renderer should use a sequential single-column content grid");
assert.match(multiHotelHtml, /&#1042;&#1072;&#1096;&#1080;&#1103;&#1090; &#1087;&#1086;&#1083;&#1077;&#1090;/, "multi-hotel renderer should label the flight section in Bulgarian");
assert.match(multiHotelHtml, /&#1042;&#1072;&#1088;&#1080;&#1072;&#1085;&#1090;&#1080; &#1079;&#1072; &#1085;&#1072;&#1089;&#1090;&#1072;&#1085;&#1103;&#1074;&#1072;&#1085;&#1077;/, "multi-hotel renderer should label accommodation options in Bulgarian");
assert.match(multiHotelHtml, /Hotel option 1/, "multi-hotel renderer should use neutral hotel option labels");
assert.match(multiHotelHtml, /Hotel option 2/, "multi-hotel renderer should render second hotel option");
assert.match(multiHotelHtml, /Hotel option 3/, "multi-hotel renderer should render third hotel option");
assert.match(multiHotelHtml, /3 accommodation options/, "multi-hotel renderer should explain option count factually");
assert.match(multiHotelHtml, /&#1048;&#1079;&#1073;&#1088;&#1072;&#1085; &#1093;&#1086;&#1090;&#1077;&#1083;/, "multi-hotel renderer should identify the selected hotel in the hero");
assert.match(multiHotelHtml, /Selected option estimate/, "multi-hotel renderer should keep the selected option estimate label");
assert.match(multiHotelHtml, /js-selected-option-price/, "multi-hotel renderer should expose a dynamic selected package price");
assert.match(multiHotelHtml, /v11-hotel-gallery/, "multi-hotel renderer should show a hotel image gallery");
assert.doesNotMatch(multiHotelHtml, /alpha-4\.jpg/, "multi-hotel renderer should not render more than three gallery images per hotel option");
assert.match(multiHotelHtml, /https:\/\/example\.test\/hotel-alpha/, "multi-hotel renderer should preserve hotel website links from websiteUrl");
assert.match(multiHotelHtml, /&#1054;&#1073;&#1097;&#1072; &#1082;&#1083;&#1080;&#1077;&#1085;&#1090;&#1089;&#1082;&#1072; &#1094;&#1077;&#1085;&#1072;/, "multi-hotel renderer should show package price per hotel option");
assert.match(multiHotelHtml, /&#1042;&#1080;&#1078; &#1093;&#1086;&#1090;&#1077;&#1083;&#1072;/, "multi-hotel renderer should show hotel link action when URL exists");
assert.match(multiHotelHtml, /v11-prefer-option/, "multi-hotel renderer should make hotel preference selectable");
assert.match(multiHotelHtml, /&#1058;&#1088;&#1072;&#1085;&#1089;&#1092;&#1077;&#1088;/, "multi-hotel renderer should include transfer information");
assert.match(multiHotelHtml, /\u041d\u0435\u043e\u0431\u0445\u043e\u0434\u0438\u043c \u0442\u0440\u0430\u043d\u0441\u0444\u0435\u0440/, "Maldives multi-hotel renderer should not silently imply transfer is irrelevant");
assert.equal(/Premium|Balanced|Best price|Balan|Premi|Nai-dobra/.test(multiHotelHtml), false, "multi-hotel renderer must not invent qualitative hotel labels");
assert.equal(/Р[ ’џћ›ќ—Ґ]|С[џњ‰‡ђ]/.test(multiHotelHtml), false, "multi-hotel renderer should not output mojibake Bulgarian labels");
assert.equal(/contractVersion|classifications|universalIntakeDeprecated|debug|sourceAuthority/.test(multiHotelHtml), false, "registry render must not leak engine fields");

const flightIndex = multiHotelHtml.indexOf("v11-flight-card");
const hotelIndex = multiHotelHtml.indexOf("v11-hotel-card");
assert.ok(flightIndex >= 0 && hotelIndex > flightIndex, "multi-hotel renderer should render flight before hotel options");

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
