'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { buildLegacyOfferPrintInput } = require('../gt63-core/legacy-offer-print-input');
const { buildPresentationViewModel } = require('../gt63-core/presentation-view-model');
const { renderPrintProposal } = require('../gt63-core/renderers/print-presentation');

// Synthetic data only. No server, database, import, network or message calls.
const offer = {
  id: 'LOCAL-BOUNDARY-FIXTURE', currency: 'EUR',
  hotels: [
    { id: 'fixture-a', name: 'Fixture A', meal: 'Включена закуска и вечеря', description: 'Fixture description', price: 100, selected: true },
    { id: 'fixture-b', name: 'Fixture B', meal: 'Закуска', description: 'Описание със закуска и вечеря', price: 200 },
    { id: 'fixture-c', name: 'Fixture C', meal: '', description: 'Описание със закуска и вечеря', price: 300 }
  ]
};
for (const [id, expected] of [
  ['fixture-a', 'Закуска и вечеря'],
  ['fixture-b', 'Закуска'],
  ['fixture-c', 'Хранене за потвърждение']
]) {
  test(`selected hotel ${id} uses its own Meal, never description or another hotel`, () => {
    const input = buildLegacyOfferPrintInput(offer);
    const before = JSON.stringify({ offer, input });
    const options = { mode: 'selected', selectedHotelId: id };
    const view = buildPresentationViewModel(input, options);
    assert.equal(view.selectedHotel.id, id);
    assert.equal(view.selectedMealPlan, expected);
    const html = renderPrintProposal(input, options);
    assert(html.includes(expected));
    assert.equal(JSON.stringify({ offer, input }), before);
  });
}

function extract(source, startName, endName) {
  const start = source.indexOf(startName);
  const end = source.indexOf(endName, start);
  assert(start >= 0 && end > start, 'actual application function must be found');
  return source.slice(start, end);
}
const server = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
const admin = fs.readFileSync(path.join(__dirname, '../public/admin.js'), 'utf8');
const api = vm.createContext({ hotelOccupancyQa: require("../public/hotel-occupancy"), AYAHotelOccupancy: require("../public/hotel-occupancy"),
  getFlightPriceFromOffer: value => value.flightPrice,
  getHotelPriceFromOffer: value => value.hotelPrice,
  toNumber: (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback,
  safeArray: value => Array.isArray(value) ? value : []
});
vm.runInContext(extract(server, 'function summarizeOfferForList(', '\nfunction extractJsonObject('), api);

for (const [storedMarkup, displayedMarkup] of [[0, '0.00'], ['5', '5.00'], [7.5, '7.50']]) {
  test(`saved markup ${storedMarkup}% reaches actual pricing panel without recalculating prices`, () => {
    // Same explicit final price for each case: markup must not be inferred from it.
    const fixture = Object.freeze({
      id: 'LOCAL-PRICING-BOUNDARY', currency: 'EUR', flightPrice: 16426.49,
      hotelPrice: 1529.60, transferPrice: 0, basePrice: 17956.09,
      finalPrice: 18853.89, markupPercent: storedMarkup
    });
    const before = JSON.stringify(fixture);
    const summary = api.summarizeOfferForList(fixture);
    assert.equal(summary.markupPercent, Number(storedMarkup));
    for (const key of ['flightPrice', 'hotelPrice', 'transferPrice', 'finalPrice']) assert.equal(summary[key], fixture[key]);
    const drawer = { innerHTML: '', classList: { add() {} }, setAttribute() {}, focus() {} };
    const context = vm.createContext({
      activeWorkspaceOfferId: '', activeWorkspaceTab: 'pricing', workspaceReturnClientKey: '', WORKSPACE_LAZY_FLAGS: {},
      $: id => id === 'offerWorkspace' ? drawer : { classList: { add() {} } },
      getOfferById: () => summary, getOfferWarnings: () => [], qaScore: () => 100, qaTone: () => 'ready',
      getOfferFlightPrice: value => value.flightPrice, getOfferHotelPrice: value => value.hotelPrice,
      clientKeyFromOffer: () => '', getClientByKey: () => null, getLatestOfferActivity: () => null,
      statusBadge: () => '', qaBadge: () => '', escapeHtml: value => String(value || ''),
      formatPrice: (value, currency) => Number(value).toFixed(2) + ' ' + currency,
      renderWorkspaceCommandBar: () => '', renderWorkspaceSection: (id, title, content) => content,
      agencyLabel: () => '', roleLabel: () => '', reflectCapabilities() {}, persistNavigationState() {}, setTimeout() {},
      document: { body: { classList: { add() {} } } }
    });
    vm.runInContext(extract(admin, 'function renderOfferWorkspace(', '\nfunction openOfferWorkspace('), context);
    context.renderOfferWorkspace(fixture.id);
    assert(drawer.innerHTML.includes(`<span>Markup</span><strong>${displayedMarkup}%</strong>`));
    assert(drawer.innerHTML.includes('17956.09 EUR'));
    assert(drawer.innerHTML.includes('18853.89 EUR'));
    assert.equal(JSON.stringify(fixture), before);
  });
}
