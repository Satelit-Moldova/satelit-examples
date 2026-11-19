// Offline tests of Code.gs: node --test
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const vm = require('node:vm');
const { load } = require('./shim');

const META = { credits: 1, sources: [], attribution: null };
const ROUTES = {
  '/rates': { data: [{ code: 'EUR', value: 20.1411, nominal: 1 }, { code: 'RUB', value: 2.26, nominal: 10 }], meta: META },
  '/fuel': {
    data: {
      networks: [{ key: 'petrom', name: 'Petrom', stale: false, prices: { a95: 28.05, diesel: 33.46 } }],
      range: { a95: { min: 27.9, max: 28.8 }, diesel: { min: 33.25, max: 34.14 } },
    },
    meta: META,
  },
  '/prices/search': { data: [{ id: 217, name: 'Lapte JLC 2.5% 1 l', min_price: 16.99 }], meta: META },
  '/prices/items/217': {
    data: {
      name: 'Lapte JLC 2.5% 1 l', min_price: 16.99,
      offers: [{ price: 15.5, in_stock: false, store: { name: 'Gone' } }, { price: 16.99, in_stock: true, store: { name: 'MegaAlina' } }],
    },
    meta: META,
  },
};

function fakeFetch(url, options) {
  if (options.headers.Authorization !== 'Bearer sat_live_test') {
    return { code: 401, text: JSON.stringify({ error: { code: 'key_invalid', message: 'Unknown key.' } }) };
  }
  const p = url.replace('https://api.satelit.md/v1', '').split('?')[0];
  return ROUTES[p] ? { code: 200, text: JSON.stringify(ROUTES[p]) } : { code: 404, text: '{"error":{"code":"not_found","message":"x"}}' };
}

const sheet = (props = { SATELIT_API_KEY: 'sat_live_test' }) => load({ fetch: fakeFetch, properties: props });
const run = (gs, f) => vm.runInContext(f, gs);

test('rate per one unit, any case', () => {
  const gs = sheet();
  assert.strictEqual(run(gs, 'SATELIT_RATE("eur")'), 20.1411);
  assert.ok(Math.abs(run(gs, 'SATELIT_RATE("RUB")') - 0.226) < 1e-9);
});

test('fuel: lowest of all, or one network', () => {
  const gs = sheet();
  assert.strictEqual(run(gs, 'SATELIT_FUEL("a95")'), 27.9);
  assert.strictEqual(run(gs, 'SATELIT_FUEL("diesel", "Petrom")'), 33.46);
  assert.throws(() => run(gs, 'SATELIT_FUEL("kerosene")'), /Unknown fuel/);
});

test('price row skips shops without stock', () => {
  assert.deepStrictEqual(JSON.parse(JSON.stringify(run(sheet(), 'SATELIT_PRICE("lapte")'))), [[16.99, 'MegaAlina', 'Lapte JLC 2.5% 1 l']]);
});

test('cache: a sheet full of formulas makes one call per answer', () => {
  const gs = sheet();
  for (let i = 0; i < 20; i++) run(gs, 'SATELIT_RATE("EUR")');
  run(gs, 'SATELIT_PRICE("lapte")');
  run(gs, 'SATELIT_PRICE("Lapte ")');
  assert.strictEqual(gs.calls.length, 3); // rates + search + item
});

test('readable errors: no key, bad key', () => {
  assert.throws(() => run(sheet({}), 'SATELIT_RATE("EUR")'), /Script Properties/);
  assert.throws(() => run(sheet({ SATELIT_API_KEY: 'wrong' }), 'SATELIT_RATE("EUR")'), /401 key_invalid/);
});

test('the key never lands in the cache', () => {
  const gs = sheet();
  run(gs, 'SATELIT_RATE("EUR")');
  const raw = gs.CacheService.getScriptCache().get('satelit:rates');
  assert.ok(!raw.includes('sat_live'));
});
