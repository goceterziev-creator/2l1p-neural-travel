'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { prepareHotelPrintImages } = require('../gt63-core/hotel-print-images');
const { renderPrintProposal } = require('../gt63-core/renderers/print-presentation');
const origin = 'https://fixture.example';

test('one usable stored image survives a failed hotel-specific replenishment search', async () => {
  let searches = 0;
  const input = { destination: { name: 'Paris' }, hotel: { name: 'Fixture hotel', images: ['https://fixture.example/stored.jpg'] } };
  const before = JSON.stringify(input);
  const prepared = await prepareHotelPrintImages(input, {}, {
    origin, resolveImage: async url => url,
    findImages: async (name, destination) => { searches++; assert.equal(name, 'Fixture hotel'); assert.equal(destination, 'Paris'); throw Error('Simulated optional lookup outage'); }
  });
  assert.equal(searches, 1);
  assert.deepEqual(prepared.hotel.imageUrls, ['https://fixture.example/stored.jpg']);
  assert.match(renderPrintProposal(prepared), /stored\.jpg/);
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


test('two stored photos replenish only for the same hotel, deduplicate and cap at three', async () => {
  const existing = ['https://fixture.example/a.jpg', 'https://fixture.example/b.jpg'];
  let searches = 0;
  const prepared = await prepareHotelPrintImages({ destination: { name: 'Paris' }, hotel: { name: 'Fixture hotel', images: existing } }, {}, {
    origin, resolveImage: async url => url,
    findImages: async (name, destination) => {
      searches++; assert.equal(name, 'Fixture hotel'); assert.equal(destination, 'Paris');
      return [existing[0], 'https://fixture.example/c.jpg', 'https://fixture.example/d.jpg'];
    }
  });
  assert.equal(searches, 1);
  assert.deepEqual(prepared.hotel.imageUrls, [...existing, 'https://fixture.example/c.jpg']);
});

test('three stored photos need no replenishment search', async () => {
  const images = ['https://fixture.example/a.jpg', 'https://fixture.example/b.jpg', 'https://fixture.example/c.jpg'];
  let searches = 0;
  const prepared = await prepareHotelPrintImages({ hotel: { name: 'Fixture hotel', images } }, {}, {
    origin, resolveImage: async url => url,
    findImages: async () => { searches++; throw Error('Unexpected lookup'); }
  });
  assert.equal(searches, 0);
  assert.deepEqual(prepared.hotel.imageUrls, images);
});
