// Runs Code.gs under Node with small stand-ins for the Apps Script services it uses.
// Used by the tests (fake HTTP) and by `node run-gs.js` (the live API), never in Google Sheets itself.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');

// UrlFetchApp.fetch is synchronous; Node's fetch is not, so a child process does the request.
const CHILD = `
  const o = JSON.parse(process.env.SHIM_REQUEST);
  fetch(o.url, { headers: o.headers, signal: AbortSignal.timeout(10000) })
    .then(async (r) => process.stdout.write(JSON.stringify({ code: r.status, text: await r.text() })))
    .catch((e) => { process.stdout.write(JSON.stringify({ code: 599, text: JSON.stringify({ error: { code: 'network', message: e.message } }) })); });
`;

function liveFetch(url, options) {
  const env = { ...process.env, SHIM_REQUEST: JSON.stringify({ url, headers: options.headers || {} }) };
  const out = execFileSync(process.execPath, ['-e', CHILD], { env, timeout: 15000 });
  return JSON.parse(out.toString('utf8'));
}

function load({ fetch = liveFetch, properties = {}, now = () => Date.now() } = {}) {
  const store = new Map(); // CacheService: key -> {value, until}
  const calls = [];
  const cache = {
    get: (k) => { const e = store.get(k); return e && e.until > now() ? e.value : null; },
    put: (k, v, ttl) => {
      if (String(v).length > 100000) throw new Error('CacheService: value over 100 KB');
      store.set(k, { value: String(v), until: now() + Math.min(ttl || 600, 21600) * 1000 });
    },
    removeAll: (keys) => keys.forEach((k) => store.delete(k)),
  };
  const context = {
    UrlFetchApp: {
      fetch(url, options) {
        calls.push(url);
        const r = fetch(url, options || {});
        return { getResponseCode: () => r.code, getContentText: () => r.text };
      },
    },
    CacheService: { getScriptCache: () => cache },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => properties[k] ?? null }) },
    SpreadsheetApp: { getUi: () => { throw new Error('no UI under Node'); } },
    encodeURIComponent, JSON, String, Error, Math,
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'Code.gs'), 'utf8'), context, { filename: 'Code.gs' });
  context.calls = calls;
  return context;
}

module.exports = { load, liveFetch };
