// Offline tests: node --test   (a fake Satelit API on 127.0.0.1)
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { once } = require('node:events');

test('writes both JSON files and both badges', async (t) => {
  const api = http.createServer((req, res) => {
    const body = {
      '/v1/rates': { data: [{ code: 'EUR', value: 20.1411, date: '2026-11-19' }], meta: { updated_at: 'x', attribution: 'Sursa: BNM', notice: 'free at bnm.md', sources: [] } },
      '/v1/fuel': { data: { range: { a95: { min: 27.9 } } }, meta: { updated_at: 'x', attribution: null, sources: [] } },
    }[req.url];
    res.writeHead(body ? 200 : 404, { 'Content-Type': 'application/json' }).end(JSON.stringify(body || {}));
  }).listen(0, '127.0.0.1');
  t.after(() => api.close());
  await once(api, 'listening');
  Object.assign(process.env, { SATELIT_API_KEY: 'sat_live_test', SATELIT_API_URL: `http://127.0.0.1:${api.address().port}/v1` });
  const { main, badge } = require('./snapshot');
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'snap-'));
  await main(out);
  const rates = JSON.parse(fs.readFileSync(path.join(out, 'rates.json'), 'utf8'));
  assert.strictEqual(rates.attribution, 'Sursa: BNM');
  assert.strictEqual(rates.notice, 'free at bnm.md');
  assert.match(fs.readFileSync(path.join(out, 'badge-eur.svg'), 'utf8'), /20\.1411 MDL/);
  assert.match(fs.readFileSync(path.join(out, 'badge-a95.svg'), 'utf8'), /de la 27\.90 lei/);
  assert.match(badge('a<b', '1'), /a&lt;b/);
  assert.doesNotThrow(() => JSON.parse(fs.readFileSync(path.join(out, 'fuel.json'), 'utf8')));
});
