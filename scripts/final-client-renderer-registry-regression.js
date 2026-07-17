"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const serverJs = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
const offerAdapterJs = fs.readFileSync(path.join(__dirname, "..", "gt63-core", "offer-engine-adapter.js"), "utf8");
const appJs = fs.readFileSync(path.join(__dirname, "..", "gt63-core", "product", "app.js"), "utf8");
const multiHotelRendererJs = fs.readFileSync(path.join(__dirname, "..", "gt63-core", "renderers", "multi-hotel.js"), "utf8");

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

assert.match(multiHotelRendererJs, /РџСЂРµРґРїРѕС‡РёС‚Р°Рј С‚РѕР·Рё С…РѕС‚РµР»/, "multi-hotel final renderer should expose hotel preference action");
assert.match(multiHotelRendererJs, /Виж хотела/, "multi-hotel final renderer should expose hotel link action");
assert.match(multiHotelRendererJs, /РР·Р±СЂР°РЅ С…РѕС‚РµР»/, "multi-hotel final renderer should identify the selected hotel");
assert.match(multiHotelRendererJs, /РћР±С‰Р° РєР»РёРµРЅС‚СЃРєР° С†РµРЅР°/, "multi-hotel final renderer should show option-specific package pricing");
assert.match(multiHotelRendererJs, /optionPackageTotal/, "multi-hotel final renderer should price each option from flight plus selected hotel plus transfer plus margin");
assert.match(multiHotelRendererJs, /hotelImages/, "multi-hotel final renderer should render hotel image galleries");
assert.match(multiHotelRendererJs, /slice\(0, 3\)/, "multi-hotel final renderer should limit each hotel gallery to three images");
assert.match(multiHotelRendererJs, /websiteUrl/, "multi-hotel final renderer should preserve common hotel website URL fields");
assert.match(multiHotelRendererJs, /РќРµРѕР±С…РѕРґРёРј С‚СЂР°РЅСЃС„РµСЂ/, "multi-hotel final renderer should expose transfer-required status when appropriate");
assert.match(multiHotelRendererJs, /transferBlock/, "multi-hotel final renderer should expose transfer information");
assert.equal(/Р‘Р°Р»Р°РЅСЃРёСЂР°РЅР° РѕРїС†РёСЏ|РџСЂРµРјРёСѓРј РёР·Р¶РёРІСЏРІР°РЅРµ|РќР°Р№-РґРѕР±СЂР° С†РµРЅР°/.test(multiHotelRendererJs), false, "multi-hotel renderer must not hardcode legacy qualitative labels");

console.log("FINAL CLIENT RENDERER REGISTRY REGRESSION PASS");
