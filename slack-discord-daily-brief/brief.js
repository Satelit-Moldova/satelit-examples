#!/usr/bin/env node
// Morning brief for a team channel: BNM rates, fuel and the day's top news, posted to a Slack or
// Discord incoming webhook. Node 18+, no dependencies. 4 credits per run.
//
//   SATELIT_API_KEY=sat_live_... WEBHOOK_URL=https://hooks.slack.com/services/... node brief.js
//   node brief.js --print        (show the message, post nothing)
'use strict';

const API = process.env.SATELIT_API_URL || 'https://api.satelit.md/v1';

async function satelit(path) {
  const res = await fetch(API + path, {
    headers: { Authorization: `Bearer ${process.env.SATELIT_API_KEY}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(10000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Satelit ${res.status} ${body.error?.code ?? ''}: ${body.error?.message ?? ''}`);
  return body;
}

// Collect the three parts; a part that fails is left out, the brief still goes.
async function collect() {
  const [rates, fuel, news] = await Promise.allSettled([
    satelit('/rates'), satelit('/fuel'), satelit('/news?per=20'),
  ]);
  for (const r of [rates, fuel, news]) if (r.status === 'rejected') console.error(r.reason.message);
  const out = {};
  if (rates.status === 'fulfilled') {
    out.rates = rates.value.data.filter((r) => ['EUR', 'USD', 'RON'].includes(r.code));
    out.ratesSource = rates.value.meta.attribution;
  }
  if (fuel.status === 'fulfilled') out.fuel = fuel.value.data;
  if (news.status === 'fulfilled') {
    // The five weightiest stories of the last page, newest first among equals.
    out.news = [...news.value.data].sort((a, b) => b.gravity - a.gravity).slice(0, 5);
  }
  return out;
}

const sign = (v) => (v > 0 ? `+${v}` : `${v}`);

// Plain lines shared by both formats. Slack and Discord both read *bold* and <url|text>-style links differently,
// so links are written per format below.
function lines(b, link) {
  const out = [];
  if (b.rates?.length) {
    out.push(`*Curs BNM ${b.rates[0].date}:* ` + b.rates.map((r) => `${r.code} ${r.value.toFixed(4)} (${sign(r.change_7d_pct)}% 7z)`).join(' · '));
  }
  if (b.fuel) {
    const names = Object.fromEntries(b.fuel.networks.map((n) => [n.key, n.name]));
    out.push(`*Carburanți ${b.fuel.date}:* benzină de la ${b.fuel.range.a95.min} lei (${names[b.fuel.cheapest.a95] ?? b.fuel.cheapest.a95}), ` +
      `motorină de la ${b.fuel.range.diesel.min} lei, plafon ANRE ${b.fuel.cap.a95} / ${b.fuel.cap.diesel}`);
  }
  if (b.news?.length) {
    out.push('*Știri:*');
    for (const n of b.news) out.push(`• ${n.sources[0] ? link(n.sources[0].url, n.title) : n.title}`);
  }
  out.push(`_${b.ratesSource ? b.ratesSource + ' · ' : ''}Date: ${link('https://satelit.md', 'Satelit')}_`);
  return out;
}

function slackPayload(b) {
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const text = lines(b, (url, t) => `<${url}|${esc(t)}>`).join('\n');
  return { text, blocks: [{ type: 'section', text: { type: 'mrkdwn', text: text.slice(0, 2900) } }], unfurl_links: false };
}

function discordPayload(b) {
  const text = lines(b, (url, t) => `[${t.replace(/[[\]]/g, '')}](<${url}>)`).join('\n').replace(/(^|\s)\*([^*]+)\*/g, '$1**$2**');
  return { content: text.slice(0, 2000), allowed_mentions: { parse: [] } }; // Discord's limit; no @everyone
}

async function main() {
  if (!process.env.SATELIT_API_KEY) throw new Error('Set SATELIT_API_KEY first.');
  const url = process.env.WEBHOOK_URL;
  const kind = process.env.WEBHOOK_KIND || (url && /discord(app)?\.com/.test(url) ? 'discord' : 'slack');
  const payload = (kind === 'discord' ? discordPayload : slackPayload)(await collect());
  if (process.argv.includes('--print') || !url) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }
  const res = await fetch(url, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload), signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`webhook answered ${res.status}: ${(await res.text()).slice(0, 200)}`);
  console.log(`posted the ${kind} brief (${res.status})`);
}

if (require.main === module) main().catch((e) => { console.error(e.message); process.exit(1); });

module.exports = { main, collect, slackPayload, discordPayload };
