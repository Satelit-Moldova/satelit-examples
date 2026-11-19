#!/usr/bin/env node
// Price alert: watch products in Moldova's online shops and send one message when the lowest
// in-stock price falls under your target. Node 18+, no dependencies.
//
//   SATELIT_API_KEY=sat_live_... node watch.js            (reads watchlist.json, writes state.json)
'use strict';
const fs = require('node:fs');
const net = require('node:net');
const tls = require('node:tls');

const API = process.env.SATELIT_API_URL || 'https://api.satelit.md/v1';
const WATCHLIST = process.env.WATCHLIST || 'watchlist.json';
const STATE = process.env.STATE_FILE || 'state.json';

async function satelit(path) {
  const res = await fetch(API + path, {
    headers: { Authorization: `Bearer ${process.env.SATELIT_API_KEY}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(10000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Satelit ${res.status} ${body.error?.code ?? ''}: ${body.error?.message ?? ''}`);
  return body;
}

// The product a watch means: its id if given, else the first in-stock search result (kept in state).
async function resolveId(watch, state) {
  if (watch.id) return watch.id;
  const known = state.ids?.[watch.query];
  if (known) return known;
  const found = await satelit(`/prices/search?in_stock=true&q=${encodeURIComponent(watch.query)}`);
  if (!found.data.length) throw new Error(`nothing found for "${watch.query}"`);
  (state.ids ??= {})[watch.query] = found.data[0].id;
  return found.data[0].id;
}

// Lowest in-stock offer of one product, with its shop.
async function lowest(id) {
  const { data } = await satelit(`/prices/items/${id}`);
  const offers = data.offers.filter((o) => o.in_stock).sort((a, b) => a.price - b.price);
  return offers.length ? { name: data.name, price: offers[0].price, shop: offers[0].store.name, url: offers[0].url } : null;
}

// ---- notifiers: each one runs only when its settings are present ----

async function postJson(url, payload) {
  const res = await fetch(url, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload), signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`${new URL(url).host} answered ${res.status}`);
}

// A minimal SMTP client: implicit TLS on 465 (SMTP_TLS=1) or plain for a local relay.
function sendMail({ host, port, user, pass, from, to, subject, text }) {
  return new Promise((resolve, reject) => {
    const sock = process.env.SMTP_TLS === '1' ? tls.connect(port, host, { servername: host }) : net.connect(port, host);
    sock.setTimeout(10000, () => sock.destroy(new Error('SMTP timeout')));
    const steps = [
      `EHLO price-alert`,
      ...(user ? [`AUTH PLAIN ${Buffer.from(`\0${user}\0${pass}`).toString('base64')}`] : []),
      `MAIL FROM:<${from}>`, `RCPT TO:<${to}>`, 'DATA',
      [`From: ${from}`, `To: ${to}`, `Date: ${new Date().toUTCString()}`, `Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`,
        'MIME-Version: 1.0', 'Content-Type: text/plain; charset=utf-8', 'Content-Transfer-Encoding: 8bit', '',
        text.replace(/^\./gm, '..'), '.'].join('\r\n'),
      'QUIT',
    ];
    let buf = '';
    sock.on('data', (d) => {
      buf += d.toString();
      const lines = buf.split('\r\n');
      const last = lines[lines.length - 2]; // the text before the final CRLF
      if (!buf.endsWith('\r\n') || !/^\d{3} /.test(last)) return; // "250-..." lines: more to come
      const code = Number(last.slice(0, 3));
      buf = '';
      if (code >= 400) return sock.destroy(new Error(`SMTP ${code}`));
      const next = steps.shift();
      if (next === undefined) return sock.end();
      sock.write(next + '\r\n');
    });
    sock.on('error', reject);
    sock.on('close', () => (steps.length ? reject(new Error('SMTP closed early')) : resolve()));
  });
}

async function notify(text) {
  const env = process.env;
  const jobs = [];
  if (env.SLACK_WEBHOOK_URL) jobs.push(postJson(env.SLACK_WEBHOOK_URL, { text }));
  if (env.DISCORD_WEBHOOK_URL) jobs.push(postJson(env.DISCORD_WEBHOOK_URL, { content: text }));
  if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) {
    const base = env.TELEGRAM_API_URL || 'https://api.telegram.org';
    jobs.push(postJson(`${base}/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, { chat_id: env.TELEGRAM_CHAT_ID, text }));
  }
  if (env.SMTP_HOST && env.MAIL_TO) {
    jobs.push(sendMail({
      host: env.SMTP_HOST, port: Number(env.SMTP_PORT || 465), user: env.SMTP_USER, pass: env.SMTP_PASS,
      from: env.MAIL_FROM || env.SMTP_USER, to: env.MAIL_TO, subject: text.split('\n')[0], text,
    }));
  }
  if (!jobs.length) console.log('(no notifier set, message only printed)');
  const results = await Promise.allSettled(jobs);
  results.filter((r) => r.status === 'rejected').forEach((r) => console.error(`notify failed: ${r.reason.message}`));
}

async function main() {
  const watches = JSON.parse(fs.readFileSync(WATCHLIST, 'utf8'));
  const state = fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, 'utf8')) : {};
  state.items ??= {};
  for (const w of watches) {
    const label = w.query || `#${w.id}`;
    try {
      const id = await resolveId(w, state);
      const best = await lowest(id);
      if (!best) { console.log(`${label}: no shop has it in stock`); continue; }
      const prev = state.items[id] || {};
      const under = best.price <= w.target;
      console.log(`${best.name}: ${best.price} lei at ${best.shop} (target ${w.target})${under ? ' UNDER' : ''}`);
      // Alert once when the price crosses under the target, and again only if it drops further.
      if (under && (!prev.under || best.price < prev.alerted_price)) {
        await notify(`Price alert: ${best.name} costs ${best.price} lei at ${best.shop} (your target: ${w.target} lei)\n${best.url}\nData: Satelit (satelit.md)`);
        prev.alerted_price = best.price;
        prev.alerted_at = new Date().toISOString();
      }
      state.items[id] = { ...prev, name: best.name, price: best.price, shop: best.shop, under, checked_at: new Date().toISOString() };
    } catch (e) {
      console.error(`${label}: ${e.message}`); // one bad product does not stop the rest
    }
  }
  fs.writeFileSync(STATE + '.tmp', JSON.stringify(state, null, 2));
  fs.renameSync(STATE + '.tmp', STATE); // atomic: a crash never leaves half a file
}

if (require.main === module) {
  if (!process.env.SATELIT_API_KEY) { console.error('Set SATELIT_API_KEY first.'); process.exit(1); }
  main().catch((e) => { console.error(e.message); process.exit(1); });
}

module.exports = { main, sendMail, notify };
