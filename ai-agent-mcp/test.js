// Offline tests: node --test   (a fake MCP server on 127.0.0.1; the config snippets parse)
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { once } = require('node:events');

test('handshake, tools/list and one call', async (t) => {
  const seen = [];
  const srv = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      const m = JSON.parse(raw);
      seen.push([m.method, req.headers['mcp-protocol-version']]);
      if (!('id' in m)) return res.writeHead(202).end();
      const result = {
        initialize: { protocolVersion: '2025-06-18', serverInfo: { name: 'satelit', version: '1.0.0' }, instructions: 'Satelit', capabilities: { tools: {} } },
        'tools/list': { tools: [{ name: 'search_prices', description: 'Prices', securitySchemes: [{ type: 'noauth' }, { type: 'oauth2' }] }, { name: 'get_company', description: 'Company', securitySchemes: [{ type: 'oauth2' }] }] },
        'tools/call': { content: [{ type: 'text', text: '{"products":[{"name":"Lapte JLC 2.5% 1 l"}]}' }] },
      }[m.method];
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ jsonrpc: '2.0', id: m.id, result }));
    });
  }).listen(0, '127.0.0.1');
  t.after(() => srv.close());
  await once(srv, 'listening');
  process.env.SATELIT_MCP_URL = `http://127.0.0.1:${srv.address().port}/mcp`;
  const { main } = require('./mcp-check');
  const lines = [];
  const log = console.log; console.log = (s) => lines.push(s);
  const tools = await main(['--try', 'lapte']);
  console.log = log;
  assert.strictEqual(tools.length, 2);
  assert.deepStrictEqual(seen.map((s) => s[0]), ['initialize', 'notifications/initialized', 'tools/list', 'tools/call']);
  assert.strictEqual(seen[2][1], '2025-06-18');
  assert.ok(lines.some((l) => /search_prices\s+\[open\]/.test(l)));
  assert.ok(lines.some((l) => /get_company\s+\[sign-in\]/.test(l)));
});

test('every config snippet is valid JSON and points at the MCP endpoint', () => {
  for (const f of ['.mcp.json', '.cursor/mcp.json', '.vscode/mcp.json']) {
    const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'configs', f), 'utf8'));
    const server = (cfg.mcpServers || cfg.servers).satelit;
    assert.strictEqual(server.url, 'https://api.satelit.md/mcp', f);
  }
});
