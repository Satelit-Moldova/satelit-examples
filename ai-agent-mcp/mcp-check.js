#!/usr/bin/env node
// Talks to Satelit's MCP server the way an AI client does (JSON-RPC over Streamable HTTP) and
// prints what it offers. No account and no key: the handshake and tools/list are open.
//
//   node mcp-check.js                 initialize + tools/list
//   node mcp-check.js --try "lapte"   also one search_prices call (open without signing in, a few a day)
'use strict';

const URL_ = process.env.SATELIT_MCP_URL || 'https://api.satelit.md/mcp';
const VERSION = '2025-06-18';
let nextId = 1;

async function rpc(method, params, { notify = false } = {}) {
  const body = { jsonrpc: '2.0', method, ...(params ? { params } : {}), ...(notify ? {} : { id: nextId++ }) };
  const res = await fetch(URL_, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      ...(method === 'initialize' ? {} : { 'MCP-Protocol-Version': VERSION }),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  });
  if (notify) return { status: res.status };
  const text = await res.text();
  // The server answers plain JSON; an SSE frame ("data: {...}") is read too, as clients do.
  const json = JSON.parse(text.startsWith('{') ? text : text.split('\n').find((l) => l.startsWith('data:')).slice(5));
  if (json.error) throw new Error(`${method}: ${json.error.code} ${json.error.message}`);
  return { status: res.status, result: json.result };
}

async function main(argv = process.argv.slice(2)) {
  const init = await rpc('initialize', {
    protocolVersion: VERSION,
    capabilities: {},
    clientInfo: { name: 'satelit-examples-mcp-check', version: '1.0.0' },
  });
  const info = init.result.serverInfo || {};
  console.log(`initialize -> ${init.status}: ${info.name} ${info.version || ''}, protocol ${init.result.protocolVersion}`);
  console.log(`instructions: ${(init.result.instructions || '').slice(0, 160)}…`);
  const ack = await rpc('notifications/initialized', null, { notify: true });
  console.log(`notifications/initialized -> ${ack.status}`);

  const list = await rpc('tools/list', {});
  const tools = list.result.tools;
  console.log(`tools/list -> ${list.status}: ${tools.length} tools`);
  for (const t of tools) {
    const open = (t.securitySchemes || []).some((s) => s.type === 'noauth');
    console.log(`  ${t.name.padEnd(24)} ${open ? '[open]   ' : '[sign-in]'} ${(t.description || '').split('\n')[0].slice(0, 90)}`);
  }

  const i = argv.indexOf('--try');
  if (i !== -1) {
    const q = argv[i + 1] || 'lapte';
    const call = await rpc('tools/call', { name: 'search_prices', arguments: { query: q, lang: 'ro' } });
    const text = (call.result.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('\n');
    console.log(`tools/call search_prices "${q}" -> ${call.status}${call.result.isError ? ' (error)' : ''}`);
    console.log(text.slice(0, 900));
  }
  return tools;
}

if (require.main === module) main().catch((e) => { console.error(e.message); process.exit(1); });

module.exports = { main };
