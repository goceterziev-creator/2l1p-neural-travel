"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const { adaptSmartImportForProduct } = require("../gt63-core/smart-import-consumer-adapter");
const { buildProposalInputFromProductModel } = require("../gt63-core/proposal-input-adapter");
const { renderLuxuryProposal, assertLuxuryProposalInput } = require("../gt63-core/luxury-v11-renderer");

const fixturePath = path.join(__dirname, "..", "test", "fixtures", "smart-import", "flight-hotel-mixed.json");
const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
const productModel = adaptSmartImportForProduct(fixture);
const proposalInput = buildProposalInputFromProductModel(productModel, {
  clientName: "G. Terziev",
  destination: "Maldives",
  travelDates: "31 August - 15 September",
  travelers: "2"
});

assertLuxuryProposalInput(proposalInput);
const html = renderLuxuryProposal(proposalInput);

assert.match(html, /Luxury V11 proposal preview/, "renderer should expose V11 preview aria label");
assert.match(html, /AYA TRAVEL · V11 CLIENT BRIEF/, "renderer should expose V11 client brief label");
assert.match(html, /Maldives/, "renderer should render destination");
assert.match(html, /Estimated investment/, "renderer should render investment block");
assert.match(html, /12,675 EUR/, "renderer should render combined preview amount");
assert.match(html, /Flight Experience/, "renderer should render flight section");
assert.match(html, /Emirates EK2229/, "renderer should render outbound flight segment");
assert.match(html, /Etihad Airways EY377/, "renderer should render inbound flight segment");
assert.match(html, /Hotel Selection/, "renderer should render hotel section");
assert.match(html, /Patina Maldives/, "renderer should render hotel name");
assert.match(html, /images\.unsplash\.com/, "renderer should render a usable visual fallback when fixture image is placeholder");
assert.match(html, /READY/, "renderer should expose readiness status");
assert.equal(/contractVersion|classifications|universalIntakeDeprecated|debug|sourceAuthority/.test(html), false, "renderer must not leak engine fields");
assert.equal(/example\.com/.test(html), false, "renderer must not render placeholder image URLs");

console.log("LUXURY V11 RENDERER REGRESSION PASS");
