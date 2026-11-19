# Connect an AI assistant to Satelit (MCP)

Satelit runs a Model Context Protocol server at **`https://api.satelit.md/mcp`**. An assistant that speaks MCP can
then answer "where is milk cheapest?", "what did today's Monitorul Oficial publish?" or "what is the euro at?"
from Satelit's data, with links. This folder holds config snippets for common MCP clients and a script that checks
the server the way a client does.

**Who it is for:** people who use an AI assistant at work or at home in Moldova, and developers wiring Satelit into
their own agent. Full documentation: https://developer.satelit.md/en/mcp/

Real output of the check from the live run on 19 Nov 2026 (no key, no account):

```
$ node mcp-check.js --try "lapte"
initialize -> 200: satelit 1.0.0, protocol 2025-06-18
instructions: Satelit (satelit.md) is Moldova's service for prices and everyday data. Use these tools when the person asks about prices, shops, discounts, fuel, exchange rate…
notifications/initialized -> 202
tools/list -> 200: 48 tools
  search_prices            [open]    Current prices of a product across Moldova's online and chain shops (supermarkets, electro
  get_product              [sign-in] One product by its id: its price in every shop that sells it in Moldova, cheapest first, o
  everyday_prices          [sign-in] Moldova's everyday numbers today: fuel prices by network and ANRE's caps (fuel), the Natio
  search_laws              [sign-in] Search Moldova's legislation (laws, codes, government decisions, orders) by words, title o
  get_company              [sign-in] One company by the IDNO a company search gave: the register's row with its directors and f
  citizenship_lookup       [sign-in] Romanian citizenship (ANC): a dossier by its number in any usual spelling (12345/RD/2022,
  ...
tools/call search_prices "lapte" -> 200
{"query":"lapte","currency":"MDL","page":1,"pages":1,"products":[{"id":217,"name":"Lapte JLC 2.5% 1 l","brand":"JLC","size":"1 l","min_price":16.99,…,"cheapest":{"store":"MegaAlina","price":16.99},"shops":4,…
```

## Add it to your client

Every client below connects over Streamable HTTP to the same URL. The first tool that needs an account opens
Satelit's sign-in in the browser (OAuth); you approve the app once. No API key goes into these files.

**Project file `.mcp.json`** (read by command-line coding assistants that support project MCP config):

```json
{ "mcpServers": { "satelit": { "type": "http", "url": "https://api.satelit.md/mcp" } } }
```

**`.cursor/mcp.json`**:

```json
{ "mcpServers": { "satelit": { "url": "https://api.satelit.md/mcp" } } }
```

**`.vscode/mcp.json`**:

```json
{ "servers": { "satelit": { "type": "http", "url": "https://api.satelit.md/mcp" } } }
```

**Desktop and web assistants with "custom connectors"**: Settings → Connectors → Add custom connector → URL
`https://api.satelit.md/mcp`.

The same files are in [`configs/`](configs/).

## What you get, and what it costs

`search_prices` answers a few times without signing in. Everything else needs a Satelit account; how much each
tool returns depends on the account's plan (see the [MCP docs](https://developer.satelit.md/en/mcp/) and
[pricing](https://developer.satelit.md/en/pricing/)). **MCP calls do not spend API credits.** For bulk data and
automation, use the REST API (`/v1`) the other examples here use.

## Check it yourself

```sh
cd satelit-examples/ai-agent-mcp
node mcp-check.js            # initialize + tools/list, no key
node --test                  # offline: a fake MCP server; the config snippets parse
```

Or by hand, one JSON-RPC call:

```sh
curl -s https://api.satelit.md/mcp -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"curl","version":"1"}}}'
```

## Tested with

The protocol check ran live (Node 24.13.0, protocol 2025-06-18). The client config snippets were checked to parse
and to point at the endpoint; they were not loaded into each client for this release.

## Pe scurt (română)

Serverul MCP al Satelit (`https://api.satelit.md/mcp`) pentru asistenții AI: fișiere de configurare gata de copiat
și un script care verifică `initialize` și `tools/list`. Apelurile MCP nu consumă credite API.
