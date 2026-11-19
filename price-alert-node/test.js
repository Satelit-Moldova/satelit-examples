// Offline tests: node --test   (a fake Satelit API, webhook and SMTP server on 127.0.0.1)
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { once } = require('node:events');
const { webhook, smtp } = require('./dev-receivers');

let price = 16.99;
const api = http.createServer((req, res) => {
  const p = req.url.replace('/v1', '').split('?')[0];
  const routes = {
    '/prices/search': { data: [{ id: 217, name: 'Lapte JLC 2.5% 1 l' }] },
    '/prices/items/217': {
      data: {
        name: 'Lapte JLC 2.5% 1 l',
        offers: [
          { price: 15, in_stock: false, store: { name: 'Gone' }, url: 'x' },
          { price, in_stock: true, store: { name: 'MegaAlina' }, url: 'https://shop.example/217' },
        ],
      },
    },
  };
  const ok = req.headers.authorization === 'Bearer sat_live_test' && routes[p];
  res.writeHead(ok ? 200 : 404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(ok ? { ...routes[p], meta: {} } : { error: { code: 'not_found', message: 'x' } }));
});

test('alerts once on each channel, again only on a further drop', async () => {
  const hooks = [];
  const mails = [];
  const hook = webhook(0, (m) => hooks.push(m));
  const mail = smtp(0, (m) => mails.push(m));
  api.listen(0, '127.0.0.1');
  await Promise.all([once(hook, 'listening'), once(mail, 'listening'), once(api, 'listening')]);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'alert-'));
  fs.writeFileSync(path.join(dir, 'w.json'), JSON.stringify([{ query: 'lapte', target: 17 }]));
  Object.assign(process.env, {
    SATELIT_API_KEY: 'sat_live_test',
    SATELIT_API_URL: `http://127.0.0.1:${api.address().port}/v1`,
    WATCHLIST: path.join(dir, 'w.json'), STATE_FILE: path.join(dir, 'state.json'),
    SLACK_WEBHOOK_URL: `http://127.0.0.1:${hook.address().port}/slack`,
    TELEGRAM_BOT_TOKEN: '1:T', TELEGRAM_CHAT_ID: '42', TELEGRAM_API_URL: `http://127.0.0.1:${hook.address().port}`,
    SMTP_HOST: '127.0.0.1', SMTP_PORT: String(mail.address().port), MAIL_FROM: 'a@example.org', MAIL_TO: 'b@example.org',
  });
  const { main } = require('./watch');
  await main();
  await main(); // same price: quiet
  assert.strictEqual(hooks.length, 2);
  assert.strictEqual(mails.length, 1);
  assert.match(hooks[0].body.text, /16\.99 lei at MegaAlina/);
  assert.match(mails[0], /^Subject: =\?UTF-8\?B\?/m);
  price = 16.5; // drops further: one more alert
  await main();
  assert.strictEqual(hooks.length, 4);
  const state = JSON.parse(fs.readFileSync(path.join(dir, 'state.json'), 'utf8'));
  assert.strictEqual(state.items['217'].alerted_price, 16.5);
  assert.strictEqual(state.ids.lapte, 217);
  hook.close(); mail.close(); api.close();
});
