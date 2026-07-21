"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const serverJs = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
const offerAdapterJs = fs.readFileSync(path.join(__dirname, "..", "gt63-core", "offer-engine-adapter.js"), "utf8");
const appJs = fs.readFileSync(path.join(__dirname, "..", "gt63-core", "product", "app.js"), "utf8");
const multiHotelRendererJs = fs.readFileSync(path.join(__dirname, "..", "gt63-core", "renderers", "multi-hotel.js"), "utf8");
const productCss = fs.readFileSync(path.join(__dirname, "..", "gt63-core", "product", "styles.css"), "utf8");

assert.match(appJs, /payload\.proposalInput = proposalInputAdapter\.buildProposalInputFromProductModel/, "Core Create Offer should send the same proposal input used by preview");
assert.match(appJs, /payload\.proposalTemplate = payload\.proposalInput\.proposalTemplate/, "Core Create Offer should send selected proposal template metadata");

assert.match(offerAdapterJs, /proposalTemplate: safeModel\.proposalTemplate/, "Offer payload should preserve proposal template metadata");
assert.match(offerAdapterJs, /url:\s*firstText\(/, "Offer payload should preserve hotel URLs for final client actions");

assert.match(serverJs, /normalizeProposalInputForOffer/, "server should normalize persisted GT63 proposal input");
assert.match(serverJs, /proposalTemplate,\s*\n\s*proposalInput,/m, "server should persist proposal template and proposal input with the offer");
assert.match(serverJs, /renderGt63RegistryOfferHtml/, "server should expose a GT63 registry render path");
assert.match(serverJs, /gt63ProposalRendererRegistry\.renderProposal/, "server final client HTML should render through the registry");
assert.match(serverJs, /if \(registryHtml\) return registryHtml;/, "server should prefer registry HTML when proposal metadata exists");
assert.match(serverJs, /async function renderOfferHtml/, "legacy renderer should remain available as fallback");
assert.match(serverJs, /\.shell\[data-proposal-template="multi-hotel"\]\s*\{\s*width:\s*min\(1480px, calc\(100% - 44px\)\);/m, "multi-hotel final client HTML should use a wide desktop shell");
assert.equal(/\.shell\s*\{\s*max-width:\s*1040px/.test(serverJs), false, "final client HTML must not lock proposals to the old narrow desktop shell");

assert.match(multiHotelRendererJs, /&#1055;&#1088;&#1077;&#1076;&#1087;&#1086;&#1095;&#1080;&#1090;&#1072;&#1084; &#1090;&#1086;&#1079;&#1080; &#1093;&#1086;&#1090;&#1077;&#1083;/, "multi-hotel final renderer should expose hotel preference action");
assert.match(multiHotelRendererJs, /&#1042;&#1080;&#1078; &#1093;&#1086;&#1090;&#1077;&#1083;&#1072;/, "multi-hotel final renderer should expose hotel link action");
assert.match(multiHotelRendererJs, /&#1048;&#1079;&#1073;&#1088;&#1072;&#1085; &#1093;&#1086;&#1090;&#1077;&#1083;/, "multi-hotel final renderer should identify the selected hotel");
assert.match(multiHotelRendererJs, /&#1054;&#1073;&#1097;&#1072; &#1082;&#1083;&#1080;&#1077;&#1085;&#1090;&#1089;&#1082;&#1072; &#1094;&#1077;&#1085;&#1072;/, "multi-hotel final renderer should show option-specific package pricing");
assert.match(multiHotelRendererJs, /optionPackageTotal/, "multi-hotel final renderer should price each option from flight plus selected hotel plus transfer plus margin");
assert.match(multiHotelRendererJs, /hotelImages/, "multi-hotel final renderer should render hotel image galleries");
assert.match(multiHotelRendererJs, /COMPACT_GALLERY_IMAGE_COUNT = 3/, "multi-hotel final renderer should limit compact card galleries without limiting hotel count");
assert.match(multiHotelRendererJs, /websiteUrl/, "multi-hotel final renderer should preserve common hotel website URL fields");
assert.match(multiHotelRendererJs, /\\u041d\\u0435\\u043e\\u0431\\u0445\\u043e\\u0434\\u0438\\u043c \\u0442\\u0440\\u0430\\u043d\\u0441\\u0444\\u0435\\u0440/, "multi-hotel final renderer should expose transfer-required status when appropriate");
assert.match(multiHotelRendererJs, /transferBlock/, "multi-hotel final renderer should expose transfer information");
assert.match(multiHotelRendererJs, /flightSummaryCards/, "multi-hotel final renderer should render premium flight summary cards");
assert.match(multiHotelRendererJs, /v11-detailed-flight-card/, "multi-hotel final renderer should preserve detailed flight information below transfer");
assert.match(multiHotelRendererJs, /packageSummaryBlock/, "multi-hotel final renderer should expose package included services");
assert.match(multiHotelRendererJs, /insightBlock/, "multi-hotel final renderer should expose supported-facts GT63 insight");
assert.match(multiHotelRendererJs, /v11-gallery-dialog/, "multi-hotel final renderer should include fullscreen selected hotel gallery");
assert.match(multiHotelRendererJs, /pointerdown/, "multi-hotel final renderer should support touch or pointer gallery navigation");
assert.match(multiHotelRendererJs, /destinationExperience/, "multi-hotel final renderer should include destination experience copy");
assert.match(multiHotelRendererJs, /travelTimeline/, "multi-hotel final renderer should include a minimal visual travel timeline");
assert.match(multiHotelRendererJs, /finalCtaBlock/, "multi-hotel final renderer should include the final client CTA");
assert.match(multiHotelRendererJs, /packageIconCards/, "multi-hotel final renderer should render package includes as premium icon cards");
assert.match(multiHotelRendererJs, /hotelOptions\.map/, "multi-hotel final renderer should render all hotel options from the array");
assert.equal(/hotelOptions\.slice\(\s*0\s*,\s*3\s*\)/.test(multiHotelRendererJs), false, "multi-hotel final renderer must not cap rendered hotel options at three");
assert.match(multiHotelRendererJs, /v11-selected-hotel-detail/, "multi-hotel final renderer should render selected hotel details");
assert.match(multiHotelRendererJs, /js-selected-option-image/, "multi-hotel final renderer should update hero image from selected hotel state");
assert.match(multiHotelRendererJs, /js-selected-option-website/, "multi-hotel final renderer should update selected hotel website link");
assert.match(productCss, /\.v11-flight-summary-grid/, "multi-hotel CSS should style premium flight summary cards");
assert.match(productCss, /\.v11-gallery-dialog/, "multi-hotel CSS should style fullscreen gallery");
assert.match(productCss, /@media \(min-width: 1180px\)[\s\S]*\.shell\[data-proposal-template="multi-hotel"\][\s\S]*\.v11-selected-hotel-detail/, "multi-hotel CSS should include a wide desktop layout for final client HTML");
assert.equal(/Р[ ’џћ›ќ—Ґ]|С[џњ‰‡ђ]/.test(multiHotelRendererJs), false, "multi-hotel renderer should not contain mojibake Bulgarian labels");
assert.equal(/outboundСегменти|inboundСегменти|totalПродължителност/.test(multiHotelRendererJs), false, "multi-hotel renderer must keep canonical flight property names untranslated");
assert.equal(/Selected option estimate|Package Includes|GT63 Insight|Ready for client preview|Accommodation details to confirm|MULTI-HOTEL BRIEF|READY|REVIEW/.test(multiHotelRendererJs), false, "multi-hotel renderer should not keep old English client-facing labels");
assert.equal(/Premium option|Balanced option|Best price|Premi izhiv|Nai-dobra/.test(multiHotelRendererJs), false, "multi-hotel renderer must not hardcode legacy qualitative labels");

console.log("FINAL CLIENT RENDERER REGISTRY REGRESSION PASS");
