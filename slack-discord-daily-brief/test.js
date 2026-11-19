// Offline tests: node --test   (a fake Satelit API and a fake webhook on 127.0.0.1)
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const { once } = require('node:events');
const { start } = require('./dev-webhook');

const ROUTES = {
  '/rates': {
    data: [{ code: 'EUR', value: 20.1411, date: '2026-11-19', change_7d_pct: -0.1 }, { code: 'GBP', value: 23, change_7d_pct: 0 }],
    meta: { attribution: 'Sursa: Banca Națională a Moldovei, bnm.md, CC BY 4.0' },
  },
  '/fuel': {
    data: {
      date: '2026-11-19', cap: { a95: 28.08, diesel: 33.46 }, cheapest: { a95: 'tlx' },
      networks: [{ key: 'tlx', name: 'TLX' }], range: { a95: { min: 27.9 }, diesel: { min: 33.25 } },
    },
    meta: {},
  },
  '/news': {
    data: [
      { title: 'Mică', gravity: 10, sources: [{ url: 'https://a.example/1' }] },
      { title: 'Bugetul <2027>', gravity: 51, sources: [{ url: 'https://a.example/2' }] },
    ],
    meta: {},
  },
};

test('posts one brief in Slack and in Discord format', async (t) => {
  let newsDown = false;
  const api = http.createServer((req, res) => {
    const p = req.url.replace('/v1', '').split('?')[0];
    const ok = ROUTES[p] && !(newsDown && p === '/news');
    res.writeHead(ok ? 200 : 503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(ok ? ROUTES[p] : { error: { code: 'busy', message: 'x' } }));
  }).listen(0, '127.0.0.1');
  const posts = [];
  const hook = start(0, (m) => posts.push(m));
  await Promise.all([once(api, 'listening'), once(hook, 'listening')]);
  t.after(() => { api.close(); hook.close(); });
  process.env.SATELIT_API_KEY = 'sat_live_test';
  process.env.SATELIT_API_URL = `http://127.0.0.1:${api.address().port}/v1`;
  const { main } = require('./brief');

  process.env.WEBHOOK_URL = `http://127.0.0.1:${hook.address().port}/slack`;
  await main();
  const slack = posts[0].body.text;
  assert.match(slack, /EUR 20\.1411 \(-0\.1% 7z\)/);
  assert.doesNotMatch(slack, /GBP/);
  assert.ok(slack.indexOf('Bugetul') < slack.indexOf('Mică'), 'weightiest story first');
  assert.match(slack, /<https:\/\/a\.example\/2\|Bugetul &lt;2027&gt;>/);
  assert.match(slack, /Sursa: Banca Națională a Moldovei/);

  process.env.WEBHOOK_URL = `http://127.0.0.1:${hook.address().port}/discord`;
  process.env.WEBHOOK_KIND = 'discord';
  newsDown = true; // one part down: the brief still goes, without it
  await main();
  const discord = posts[1].body.content;
  assert.match(discord, /\*\*Curs BNM 2026-11-19:\*\*/);
  assert.doesNotMatch(discord, /Știri/);
  assert.deepStrictEqual(posts[1].body.allowed_mentions, { parse: [] });
});
