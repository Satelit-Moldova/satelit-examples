#!/usr/bin/env node
// Daily snapshot: writes data/rates.json, data/fuel.json and two badge SVGs from the Satelit API.
// Run by the GitHub Actions workflow in .github/workflows/daily.yml (key from the repo's secrets),
// or by hand: SATELIT_API_KEY=sat_live_... node snapshot.js [out-dir]. Node 18+, no dependencies.
// 2 credits per run (/rates 1, /fuel 1).
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const API = process.env.SATELIT_API_URL || 'https://api.satelit.md/v1';

async function satelit(route) {
  const res = await fetch(API + route, {
    headers: { Authorization: `Bearer ${process.env.SATELIT_API_KEY}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(10000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Satelit ${res.status} ${body.error?.code ?? ''}: ${body.error?.message ?? ''}`);
  return body;
}

// A flat badge in the familiar two-part style; text widths are estimated (Verdana 11 px ~ 6.5 px a letter).
function badge(label, value, color = '#2563eb') {
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const w = (s) => Math.round(String(s).length * 6.5) + 12;
  const lw = w(label);
  const vw = w(value);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${lw + vw}" height="20" role="img" aria-label="${esc(label)}: ${esc(value)}">
<title>${esc(label)}: ${esc(value)}</title>
<clipPath id="r"><rect width="${lw + vw}" height="20" rx="3"/></clipPath>
<g clip-path="url(#r)"><rect width="${lw}" height="20" fill="#555"/><rect x="${lw}" width="${vw}" height="20" fill="${color}"/></g>
<g fill="#fff" text-anchor="middle" font-family="Verdana,DejaVu Sans,sans-serif" font-size="11">
<text x="${lw / 2}" y="14">${esc(label)}</text><text x="${lw + vw / 2}" y="14">${esc(value)}</text></g>
</svg>
`;
}

// Keep what a reader of the file needs: the numbers, their day, and who to credit.
const slim = (body) => ({
  data: body.data,
  updated_at: body.meta.updated_at,
  attribution: body.meta.attribution,
  notice: body.meta.notice, // BNM asks that its line "the same data is free at bnm.md" travels with the rates
  sources: body.meta.sources,
  data_by: 'Satelit (satelit.md)',
});

async function main(out = process.argv[2] || 'data') {
  if (!process.env.SATELIT_API_KEY) throw new Error('Set SATELIT_API_KEY (a repository secret in Actions).');
  const [rates, fuel] = await Promise.all([satelit('/rates'), satelit('/fuel')]);
  fs.mkdirSync(out, { recursive: true });
  const write = (name, text) => fs.writeFileSync(path.join(out, name), text);
  write('rates.json', JSON.stringify(slim(rates), null, 2) + '\n');
  write('fuel.json', JSON.stringify(slim(fuel), null, 2) + '\n');
  const eur = rates.data.find((r) => r.code === 'EUR');
  write('badge-eur.svg', badge('EUR (BNM)', `${eur.value.toFixed(4)} MDL`));
  write('badge-a95.svg', badge('benzină A95', `de la ${fuel.data.range.a95.min.toFixed(2)} lei`, '#16a34a'));
  console.log(`${eur.date}: EUR ${eur.value}, a95 from ${fuel.data.range.a95.min} lei -> ${out}/`);
}

if (require.main === module) main().catch((e) => { console.error(e.message); process.exit(1); });

module.exports = { main, badge };
