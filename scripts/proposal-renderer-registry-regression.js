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
const productStyles = fs.readFileSync(path.join(__dirname, "..", "gt63-core", "product", "styles.css"), "utf8");

const fixturePath = path.join(__dirname, "..", "test", "fixtures", "smart-import", "flight-hotel-mixed.json");
const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
const productModel = adaptSmartImportForProduct(fixture);

const multiHotelModel = JSON.parse(JSON.stringify(productModel));
multiHotelModel.hotelOptions = Array.from({ length: 10 }, (_, index) => ({
  ...multiHotelModel.hotel,
  name: `Hotel ${index + 1}`,
  description: `Selected detail description ${index + 1}`,
  room: `Selected detail room ${index + 1}`,
  meal: `Selected detail meal ${index + 1}`,
  area: `Selected detail location ${index + 1}`,
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
assert.match(multiHotelHtml, /ПЕРСОНАЛНА ОФЕРТА/, "multi-hotel renderer should identify the client proposal in Bulgarian");
assert.doesNotMatch(multiHotelHtml, /multi-hotel-sequential-grid/, "multi-hotel renderer should no longer use the old comparison grid wrapper");
assert.match(multiHotelHtml, /v11-flight-summary-grid/, "multi-hotel renderer should show premium flight summary cards");
assert.match(multiHotelHtml, /&#1054;&#1073;&#1086;&#1073;&#1097;&#1077;&#1085;&#1080;&#1077; &#1085;&#1072; &#1087;&#1086;&#1083;&#1077;&#1090;&#1072;/, "multi-hotel renderer should label the flight summary in Bulgarian");
assert.match(multiHotelHtml, /v11-detailed-flight-card/, "multi-hotel renderer should keep detailed flight information below the transfer section");
assert.match(multiHotelHtml, /&#1042;&#1072;&#1088;&#1080;&#1072;&#1085;&#1090;&#1080; &#1079;&#1072; &#1085;&#1072;&#1089;&#1090;&#1072;&#1085;&#1103;&#1074;&#1072;&#1085;&#1077;/, "multi-hotel renderer should label accommodation options in Bulgarian");
assert.match(multiHotelHtml, /Хотелска опция 1/, "multi-hotel renderer should use neutral hotel option labels");
assert.match(multiHotelHtml, /Хотелска опция 2/, "multi-hotel renderer should render second hotel option");
assert.match(multiHotelHtml, /Хотелска опция 3/, "multi-hotel renderer should render third hotel option");
assert.match(multiHotelHtml, /Хотелска опция 10/, "multi-hotel renderer should render tenth hotel option");
assert.match(multiHotelHtml, /10 варианта за настаняване/, "multi-hotel renderer should explain option count factually");
assert.match(multiHotelHtml, /&#1048;&#1079;&#1073;&#1088;&#1072;&#1085; &#1093;&#1086;&#1090;&#1077;&#1083;/, "multi-hotel renderer should identify the selected hotel in the hero");
assert.match(multiHotelHtml, /Hotel 10/, "multi-hotel renderer should preserve selected hotel 10 in the hero/details");
assert.match(multiHotelHtml, /src="https:\/\/images\.example\.test\/hotel-10-1\.jpg"/, "hero image should follow the selected hotel image");
assert.match(multiHotelHtml, /Крайна цена за избрания хотел/, "multi-hotel renderer should keep the selected option estimate label");
assert.match(multiHotelHtml, /3,543\.75 EUR/, "hero should show the selected final package price");
assert.match(multiHotelHtml, /Дестинация/, "hero should include destination as a decision fact");
assert.match(multiHotelHtml, /Пътуващи/, "hero should include travelers as a decision fact");
assert.match(multiHotelHtml, /Хранене/, "hero should include concise meal information");
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
const comparisonSectionStart = multiHotelHtml.indexOf("v11-hotel-card");
const comparisonSectionEnd = multiHotelHtml.indexOf("v11-selected-hotel-card", comparisonSectionStart);
const comparisonSection = multiHotelHtml.slice(comparisonSectionStart, comparisonSectionEnd);
assert.equal((comparisonSection.match(/Избрана опция/g) || []).length, 1, "selected badge should appear exactly once in the initial comparison");
assert.match(multiHotelHtml, /data-selected-badge/, "selected badge should have accessible text support for dynamic updates");
assert.match(multiHotelHtml, /selectedBadge\.textContent = "Избрана опция"/, "selected badge should update when the client changes hotel");
assert.match(multiHotelHtml, /updateRecommendation\(button\.dataset\.optionReasons/, "recommendation should update when the client changes hotel");
assert.match(multiHotelHtml, /updateDetailGallery\(parseImages\(button\.dataset\.optionImages/, "selected detail gallery should update when the client changes hotel");
assert.match(multiHotelHtml, /data-option-name="Hotel 1"/, "hotel option buttons should carry alternate selected hotel names");
assert.match(multiHotelHtml, /data-option-price="2,598\.75 EUR"/, "hotel option buttons should carry alternate selected hotel prices");
assert.equal((comparisonSection.match(/class="v11-hotel-option /g) || []).length, 10, "comparison should render every hotel option without an artificial max");
const selectedHotelSectionStart = multiHotelHtml.indexOf("v11-selected-hotel-card");
const selectedHotelSectionEnd = multiHotelHtml.indexOf("v11-transfer-card", selectedHotelSectionStart);
const selectedHotelSection = multiHotelHtml.slice(selectedHotelSectionStart, selectedHotelSectionEnd);
assert.ok(selectedHotelSectionStart >= 0 && selectedHotelSectionEnd > selectedHotelSectionStart, "multi-hotel renderer should expose the selected hotel section");
assert.equal((selectedHotelSection.match(/v11-selected-hotel-detail/g) || []).length, 1, "selected hotel section should render exactly one hotel detail panel");
assert.equal((selectedHotelSection.match(/js-selected-detail-name">Hotel 10/g) || []).length, 1, "selected hotel section should render only one visible selected hotel name");
assert.equal((selectedHotelSection.match(/Selected detail description 10/g) || []).length, 1, "selected hotel section should render only one selected hotel description");
assert.equal((selectedHotelSection.match(/Selected detail room 10/g) || []).length, 1, "selected hotel section should render only one selected hotel room block");
assert.equal((selectedHotelSection.match(/Selected detail meal 10/g) || []).length, 1, "selected hotel section should render only one selected hotel meal block");
assert.equal((selectedHotelSection.match(/Selected detail location 10/g) || []).length, 1, "selected hotel section should render only one selected hotel location block");
assert.equal((selectedHotelSection.match(/v11-gallery-thumb/g) || []).length, 3, "selected hotel section should render up to three selected hotel gallery images");
assert.equal(/Hotel [1-9](?!0)|Selected detail (description|room|meal|location) [1-9](?!0)|hotel-[1-9](?!0)-/.test(selectedHotelSection), false, "selected hotel section should not render details or images from non-selected hotels");
assert.equal(/hotel-10-4\.jpg/.test(selectedHotelSection), false, "selected hotel section should cap selected hotel gallery images at three");
assert.match(multiHotelHtml, /&#1054;&#1073;&#1097;&#1072; &#1082;&#1083;&#1080;&#1077;&#1085;&#1090;&#1089;&#1082;&#1072; &#1094;&#1077;&#1085;&#1072;/, "multi-hotel renderer should show package price per hotel option");
assert.match(multiHotelHtml, /&#1042;&#1080;&#1078; &#1093;&#1086;&#1090;&#1077;&#1083;&#1072;/, "multi-hotel renderer should show hotel link action when URL exists");
assert.equal((multiHotelHtml.match(/&#1042;&#1080;&#1078; &#1093;&#1086;&#1090;&#1077;&#1083;&#1072;/g) || []).length >= 10, true, "multi-hotel renderer should show hotel website buttons for every hotel URL");
assert.match(multiHotelHtml, /v11-prefer-option/, "multi-hotel renderer should make hotel preference selectable");
assert.match(multiHotelHtml, /Включено в пакета/, "multi-hotel renderer should show a package summary in the hero");
assert.match(multiHotelHtml, /Препоръка от GT63/, "multi-hotel renderer should show a supported-facts recommendation block");
assert.match(multiHotelHtml, /Защо тази опция/, "multi-hotel renderer should frame the selected option decision");
assert.equal(/Крайната цена за избрания хотел е/.test(multiHotelHtml), false, "recommendation should not repeat only the final price as a reason");
assert.match(multiHotelHtml, /Хотелът е категория 5\./, "recommendation should use supported hotel category data");
assert.match(multiHotelHtml, /v11-destination-card/, "multi-hotel renderer should include destination experience copy");
assert.match(multiHotelHtml, /v11-timeline-card/, "multi-hotel renderer should include a visual travel timeline");
assert.match(multiHotelHtml, /Пътуването накратко/, "timeline should use client-facing Bulgarian copy");
assert.match(multiHotelHtml, /Полет Летище София/, "timeline should render from real flight route data");
assert.match(multiHotelHtml, /v11-detailed-flight-card/, "full technical flight segments should remain available");
assert.equal(/екскурзия|свободно време|разходка/.test(multiHotelHtml), false, "timeline should not invent activities");
assert.match(multiHotelHtml, /v11-package-grid/, "multi-hotel renderer should render included services as premium icon cards");
assert.match(multiHotelHtml, /v11-final-cta/, "multi-hotel renderer should end with an emotional final CTA");
assert.match(multiHotelHtml, /Вашата оферта е готова\./, "final CTA should use decision-oriented Bulgarian copy");
assert.match(multiHotelHtml, /Потвърди избрания хотел/, "final CTA should preserve a clear primary hotel confirmation action");
assert.match(multiHotelHtml, /Попитай консултант/, "final CTA should preserve a consultant secondary action");
assert.equal(/v11-closing|Прегледайте предложението|Готово за следваща стъпка|ЗА ПРЕГЛЕД/.test(multiHotelHtml), false, "multi-hotel client HTML should not expose internal workflow closing/status labels");
assert.match(multiHotelHtml, /&#1058;&#1088;&#1072;&#1085;&#1089;&#1092;&#1077;&#1088;/, "multi-hotel renderer should include transfer information");
assert.match(multiHotelHtml, /\u041d\u0435\u043e\u0431\u0445\u043e\u0434\u0438\u043c \u0442\u0440\u0430\u043d\u0441\u0444\u0435\u0440/, "Maldives multi-hotel renderer should not silently imply transfer is irrelevant");
assert.equal(/Premium option|Balanced option|Best price|Balan|Premi izhiv|Nai-dobra/.test(multiHotelHtml), false, "multi-hotel renderer must not invent qualitative hotel labels");
assert.equal(/MULTI-HOTEL BRIEF|Accommodation details to confirm|READY|REVIEW|recommended|best value|luxury claims/.test(multiHotelHtml), false, "multi-hotel renderer should not output English or unsafe client-facing claims");
assert.equal(/A curated private travel proposal|Review proposal|self-transfer|\bMarch\b|\bApril\b/.test(multiHotelHtml), false, "multi-hotel renderer should localize or remove remaining client-facing English copy");
assert.equal(/slice\(0,\s*3\).*hotelOptions|maxItems:\s*3/.test(multiHotelHtml), false, "client HTML should not contain a hotel option max limit");
assert.equal(/Р[ ’џћ›ќ—Ґ]|С[џњ‰‡ђ]/.test(multiHotelHtml), false, "multi-hotel renderer should not output mojibake Bulgarian labels");
assert.equal(/contractVersion|classifications|universalIntakeDeprecated|debug|sourceAuthority/.test(multiHotelHtml), false, "registry render must not leak engine fields");

const selectedSyncHotels = Array.from({ length: 6 }, (_, index) => ({
  name: index === 0 ? "Palace Hotel Tokyo" : (index === 5 ? "Home Story in Tokyo Aerial大島&東京屋語" : `Tokyo Sync Hotel ${index + 1}`),
  description: `Описание за хотелска опция ${index + 1}`,
  room: index === 5 ? "Sync room 6 за двама пътуващи" : `Sync room ${index + 1}`,
  meal: index === 5 ? "Breakfast included" : "Room only",
  area: index === 5 ? "Tokyo, Japan - option 6 area" : `Tokyo option ${index + 1} area`,
  price: index === 5 ? 5431.93 : 6100 + (index * 100),
  stars: index === 5 ? "3" : "5",
  websiteUrl: `https://sync.example.test/hotel-${index + 1}`,
  heroImage: `https://images.sync.test/hotel-${index + 1}-hero.jpg`,
  imageUrls: [
    `https://images.sync.test/hotel-${index + 1}-1.jpg`,
    `https://images.sync.test/hotel-${index + 1}-2.jpg`,
    `https://images.sync.test/hotel-${index + 1}-3.jpg`,
    `https://images.sync.test/hotel-${index + 1}-4.jpg`
  ]
}));

const selectedSyncHtml = globalThis.GT63MultiHotelRenderer.renderMultiHotelProposal({
  destination: { name: "Токио", requested: "28 March - 9 April" },
  content: {
    heroTitle: "Palace Hotel Tokyo",
    heroSubtitle: "A curated private travel proposal for Tokyo."
  },
  client: { travelers: "2", travelDates: "28 March - 9 April" },
  pricing: { currency: "EUR" },
  transfer: { status: "self-transfer" },
  flight: {
    airline: "All Nippon Airways",
    route: "SOF -> MUC -> HND",
    baggage: "Checked baggage included",
    outboundSegments: [
      { from: "SOF", to: "MUC", date: "2026-03-28", departure: "2026-03-28T06:10", arrival: "2026-03-28T07:10" },
      { from: "MUC", to: "HND", date: "2026-03-28", departure: "2026-03-28T12:00", arrival: "2026-03-29T13:15", arrivalAirport: "HND" }
    ],
    inboundSegments: [
      { from: "HND", to: "SOF", date: "2026-04-09", departure: "2026-04-09T08:15", arrival: "2026-04-09T20:10" }
    ]
  },
  hotelOptions: selectedSyncHotels,
  hotel: selectedSyncHotels[0],
  selectedHotelIndex: 5
});

const selectedSyncHero = selectedSyncHtml.slice(selectedSyncHtml.indexOf("v11-hero"), selectedSyncHtml.indexOf("v11-insight-card"));
const selectedSyncTimeline = selectedSyncHtml.slice(selectedSyncHtml.indexOf("v11-timeline-card"), selectedSyncHtml.indexOf("v11-flight-card"));
const selectedSyncRecommendation = selectedSyncHtml.slice(selectedSyncHtml.indexOf("v11-insight-card"), selectedSyncHtml.indexOf("v11-destination-card"));
const selectedSyncDetail = selectedSyncHtml.slice(selectedSyncHtml.indexOf("v11-selected-hotel-card"), selectedSyncHtml.indexOf("v11-transfer-card"));

assert.match(selectedSyncHero, /Home Story in Tokyo Aerial大島&amp;東京屋語/, "selectedHotelIndex=5 should drive the hero selected hotel name");
assert.equal(/Palace Hotel Tokyo/.test(selectedSyncHero), false, "hero should not use option 1 as the selected hotel when selectedHotelIndex=5");
assert.match(selectedSyncHero, /5,431\.93 EUR/, "hero should show the selected option 6 final price");
assert.match(selectedSyncHero, /hotel-6-hero\.jpg/, "hero image should follow selected option 6 images");
assert.match(selectedSyncTimeline, /Настаняване в Home Story in Tokyo Aerial大島&amp;東京屋語/, "timeline accommodation should use selected option 6");
assert.match(selectedSyncTimeline, /Пристигане в Токио/, "timeline should label the real final outbound arrival as arrival in the destination");
assert.match(selectedSyncTimeline, /29 март · 13:15/, "timeline should localize the final outbound arrival date and time");
assert.match(selectedSyncTimeline, /Летище Токио Ханеда|HND/, "timeline should keep the real final outbound arrival airport");
assert.match(selectedSyncRecommendation, /Sync room 6|Закуска|по-ниска/, "recommendation should describe supported facts for selected option 6");
assert.match(selectedSyncDetail, /Home Story in Tokyo Aerial大島&amp;東京屋語/, "selected detail should render selected option 6");
assert.equal(/Palace Hotel Tokyo/.test(selectedSyncDetail), false, "selected detail should not render option 1 when option 6 is selected");
assert.match(selectedSyncHtml, /data-option-whatsapp="[^"]*Home%20Story%20in%20Tokyo%20Aerial/, "WhatsApp context should contain selected option 6");
assert.match(selectedSyncHtml, /itineraryHotel\.textContent = "Настаняване в "/, "selection script should update itinerary accommodation when hotel changes");
assert.match(selectedSyncHtml, /button\.textContent = "Избран хотел"/, "selection script should update the selected comparison card action label");
assert.equal((selectedSyncHtml.match(/Избран хотел/g) || []).length >= 1, true, "selected comparison card should render a selected-state action label");
assert.equal(/A curated private travel proposal|MULTI-HOTEL BRIEF|Review proposal|READY|REVIEW|self-transfer|\bMarch\b|\bApril\b/.test(selectedSyncHtml), false, "selected sync render should not expose forbidden English client copy");
assert.equal(/alt="Home Story in Tokyo Aerial/.test(selectedSyncDetail), false, "selected detail gallery alt text should not repeat the visible selected hotel name");

const desktopSelectedDetailRule = productStyles.match(/\.shell\[data-proposal-template="multi-hotel"\]\s+\.v11-selected-hotel-detail\s*\{[^}]*\}/);
assert.ok(desktopSelectedDetailRule, "desktop CSS should define selected hotel detail layout");
assert.equal(/display\s*:\s*grid/.test(desktopSelectedDetailRule[0]), false, "desktop CSS must not force every selected hotel detail panel visible");
assert.match(productStyles, /\.shell\[data-proposal-template="multi-hotel"\]\s+\.v11-selected-hotel-detail\.active\s*\{[^}]*display\s*:\s*grid/s, "desktop CSS should display only the active selected hotel detail panel");

const flightIndex = multiHotelHtml.indexOf("v11-flight-card");
const hotelIndex = multiHotelHtml.indexOf("v11-hotel-card");
assert.ok(flightIndex >= 0 && hotelIndex > flightIndex, "multi-hotel renderer should render flight before hotel options");
const transferIndex = multiHotelHtml.indexOf("v11-transfer-card");
const detailedFlightIndex = multiHotelHtml.indexOf("v11-detailed-flight-card");
assert.ok(transferIndex >= 0 && detailedFlightIndex > transferIndex, "multi-hotel renderer should render detailed flight information after transfer");

const thinEvidenceHtml = globalThis.GT63MultiHotelRenderer.renderMultiHotelProposal({
  hotelOptions: [{ name: "Minimal Hotel", selected: true }],
  hotel: { name: "Minimal Hotel", selected: true },
  pricing: { currency: "EUR" },
  content: { heroTitle: "Minimal destination" }
});
assert.equal(/Препоръка от GT63|Защо тази опция|best value|recommended|подходящо/i.test(thinEvidenceHtml), false, "recommendation block should be omitted when evidence is insufficient");

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
assert.match(cityHtml, /КЛИЕНТСКО ПРЕДЛОЖЕНИЕ/, "non-multi-hotel templates should use the localized V11 fallback renderer until dedicated renderers exist");
assert.equal(/Flight Experience|Hotel Selection|Ready for client preview|Estimated investment|Client to confirm|Dates to confirm|Travelers to confirm|READY|REVIEW/.test(cityHtml), false, "fallback V11 renderer should not output English client-facing labels");

assert.throws(() => registry.renderProposal({
  ...cityInput,
  proposalTemplate: { selected: "unsupported-template" }
}), /Unsupported proposal template/, "registry should fail clearly for unsupported templates");

console.log("PROPOSAL RENDERER REGISTRY REGRESSION PASS");
