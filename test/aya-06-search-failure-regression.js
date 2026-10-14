'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { prepareHotelPrintImages } = require('../gt63-core/hotel-print-images');
const { renderPrintProposal } = require('../gt63-core/renderers/print-presentation');
const origin = 'https://fixture.example';

test('one usable stored image is sufficient and never triggers image search', async () => {
  let searches = 0;
  const input = { destination: { name: 'Paris' }, hotel: { name: 'Fixture hotel', images: ['https://fixture.example/stored.jpg'] } };
  const before = JSON.stringify(input);
  const prepared = await prepareHotelPrintImages(input, {}, {
    origin, resolveImage: async url => url,
    findImages: async () => { searches++; throw Error('Unexpected search'); }
  });
  assert.equal(searches, 0);
  assert.deepEqual(prepared.hotel.imageUrls, ['https://fixture.example/stored.jpg']);
  assert.equal(JSON.stringify(input), before);
});

test('exact verified fallback prevents image search when originals fail', async () => {
  let searches = 0;
  const prepared = await prepareHotelPrintImages({ destination: { name: 'Zurich' }, hotel: { name: 'La Réserve Eden au Lac Zurich', images: ['https://fixture.example/broken.jpg'] } }, {}, {
    origin, resolveImage: async () => null,
    findImages: async () => { searches++; throw Error('Unexpected search'); }
  });
  assert.equal(searches, 0);
  assert.deepEqual(prepared.hotel.imageUrls, [origin + '/images/hotels/eden-au-lac-zurich.jpg']);
});

test('failed last-resort search still produces print HTML with the existing placeholder', async () => {
  let searches = 0;
  const input = { destination: { name: 'Paris' }, hotel: { name: 'Fixture hotel', price: 100, heroImage: 'https://fixture.example/broken.jpg' }, pricing: { currency: 'EUR', flightAmount: 100, marginPercent: 5 } };
  const before = JSON.stringify(input);
  const prepared = await prepareHotelPrintImages(input, {}, {
    origin, resolveImage: async () => null,
    findImages: async () => { searches++; throw Error('Simulated lookup outage'); }
  });
  assert.equal(searches, 1);
  assert.deepEqual(prepared.hotel.imageUrls, []);
  const html = renderPrintProposal(prepared);
  assert.match(html, /Снимка за потвърждение/i);
  assert.match(html, /210\.00 EUR/);
  assert.doesNotMatch(html, /broken\.jpg/);
  assert.equal(JSON.stringify(input), before);
});
