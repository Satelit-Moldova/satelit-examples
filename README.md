# Satelit examples

Real, runnable starting points for the [Satelit data API](https://developer.satelit.md/en/docs/): Moldova's
exchange rates, fuel, shop prices, laws, companies, courts, citizenship dossiers, news and cinema, through one API.
Each example is one small folder with its own README, no or almost no dependencies, offline tests, and output
copied from a live run against `https://api.satelit.md/v1` on 19 Nov 2026.

| Example | What it solves | Language | Products used | Credits per run |
|---|---|---|---|---|
| [telegram-bot-python](telegram-bot-python/) | `/curs`, `/benzina`, `/cinema`, `/film`, `/pret`, `/stiri` in a Telegram chat | Python | rates, fuel, prices, news, movies | 1-5 per command, movies 40; cached |
| [google-sheets-apps-script](google-sheets-apps-script/) | `=SATELIT_RATE("EUR")`, `=SATELIT_FUEL("a95")`, `=SATELIT_PRICE("lapte")` in Google Sheets | Apps Script | rates, fuel, prices | 1-5 per answer, cached up to 6 h |
| [price-alert-node](price-alert-node/) | a message when a product falls under your price (Slack, Discord, Telegram, e-mail) | Node.js | prices | 2 per product |
| [fuel-prometheus-go](fuel-prometheus-go/) | Prometheus exporter + Grafana dashboard for fuel and BNM rates | Go | fuel, rates | 2 per refresh (hourly: 48/day) |
| [law-digest-email-python](law-digest-email-python/) | the day's Monitorul Oficial as an HTML e-mail | Python | law | 2 |
| [slack-discord-daily-brief](slack-discord-daily-brief/) | a morning brief (rates, fuel, top news) in a team channel | Node.js | rates, fuel, news | 4 |
| [company-check-cli](company-check-cli/) | a company's register card, finances, contracts and court cases by IDNO or name | Python | companies | 2-5 |
| [citizenship-tracker](citizenship-tracker/) | a message when a Romanian citizenship dossier moves | Python | citizenship | 1 per dossier |
| [courts-hearings-calendar](courts-hearings-calendar/) | a party's or a case's court hearings as an `.ics` calendar | Python | courts | 6 per name, 1 per case |
| [movie-night](movie-night/) | tonight's films by city, genre and language, plus an `.ics` invite | Node.js | movies | 40 per city per 2 h (+40 per film with `--genre`, kept 30 days) |
| [github-action-daily-json](github-action-daily-json/) | a daily `rates.json` + `fuel.json` + SVG badges committed by GitHub Actions | Node.js, YAML | rates, fuel | 2 |
| [ai-agent-mcp](ai-agent-mcp/) | connect an AI assistant to Satelit's MCP server; config snippets and a check | JSON, Node.js | MCP | 0 (MCP spends no API credits) |

## Get a key

Satelit's API is paid; there is no free plan. Try it first without a key: `curl https://api.satelit.md/v1/sample`
(rates, fuel and news, 60 calls a minute per address) and the [console](https://developer.satelit.md/en/console/).
Then choose a plan on the [pricing page](https://developer.satelit.md/en/pricing/) and make a key in the console.

Every example reads the key from the `SATELIT_API_KEY` environment variable (Apps Script: Script Properties;
GitHub Actions: a repository secret). None of them prints, logs or caches the key.

```sh
git clone https://github.com/Satelit-Moldova/satelit-examples.git
cd satelit-examples/company-check-cli
SATELIT_API_KEY=sat_live_... python company.py moldtelecom
```

## Credits and caching

Each call costs credits ([rate limits and credits](https://developer.satelit.md/en/rate-limits/)); every answer says
its price in `X-Credits-Cost` and what is left in `X-Credits-Remaining`. The examples cache with TTLs that match how
often the data changes: rates 3-6 h (BNM publishes once a day), fuel 2-3 h, shop prices 3 h, news 15 min, a city's
cinema programme 2 h, a film's card 24 h or more. Movies calls cost 40 credits each, so cache them.

## Attribution

Keep the source's line wherever you show its data: `meta.attribution` when it is not null (BNM's rates carry
`Sursa: Banca Națională a Moldovei, bnm.md, CC BY 4.0`), the shop's name next to each shop price, and a short
"Data: Satelit (satelit.md)" credit. The examples do this already.

## Tested with

| | Versions | How |
|---|---|---|
| Live runs | Python 3.13.3, Node.js 24.13.0, Go 1.27.0 on Windows 11, 19 Nov 2026 | every example against the live API; transcripts kept outside the repository |
| Offline tests | Python 3.11.0 and 3.13.3; Node.js 18.20.7, 20.16.0, 24.13.0; Go 1.27.0 | all pass |
| CI | Python 3.11 / 3.13, Node.js 18 / 20 / 24, Go 1.22 | [`.github/workflows/ci.yml`](.github/workflows/ci.yml), no network, no secrets |

Not run for this release: Telegram's real servers (a local Bot API stand-in was used), Google's Apps Script runtime
(the same `Code.gs` ran under Node with small service stand-ins), Grafana (the dashboard is checked for structure
and for metric names), GitHub's runners for the example workflows (the script ran locally), and the MCP clients'
own config loading (the server's protocol was checked live).

## Run all the offline tests

```sh
for d in telegram-bot-python law-digest-email-python company-check-cli citizenship-tracker courts-hearings-calendar; do (cd $d && python -m unittest -q); done
for d in google-sheets-apps-script price-alert-node slack-discord-daily-brief movie-night github-action-daily-json ai-agent-mcp; do (cd $d && node --test); done
(cd fuel-prometheus-go && go vet ./... && go test ./...)
```

## Pe scurt (română)

Exemple gata de copiat pentru API-ul Satelit: bot Telegram, funcții Google Sheets, alerte de preț, exporter
Prometheus cu dashboard Grafana, digestul Monitorului Oficial pe e-mail, rezumat de dimineață pe Slack/Discord,
verificarea companiilor, urmărirea dosarelor de cetățenie, ședințele de judecată în calendar, filmele de azi,
un snapshot zilnic cu GitHub Actions și conectarea unui asistent AI prin MCP. Fiecare a rulat pe API-ul live pe
19 noiembrie 2026. Cheia vine din `SATELIT_API_KEY`; API-ul e cu plată ([prețuri](https://developer.satelit.md/en/pricing/)).

## License

MIT, see [LICENSE](LICENSE). Security reports: see [SECURITY.md](SECURITY.md).
