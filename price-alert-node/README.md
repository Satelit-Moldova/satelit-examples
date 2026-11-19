# Price alert: tell me when it gets cheaper

Watches products in Moldova's online shops and sends one message when the lowest in-stock price falls under your
target: Slack, Discord, a Telegram bot, e-mail, or all of them. State lives in a JSON file, so it runs from cron,
systemd, Task Scheduler or GitHub Actions. Node 18+, no dependencies.

**Who it is for:** a household waiting for the coffee or the diapers it always buys, a small shop watching
suppliers' retail prices, anyone who wants a nudge instead of checking every day.

Real output from the live run on 19 Nov 2026 (two runs, the second one quiet):

```
== run 1
Lapte JLC 2.5% 1 l: 16.99 lei at MegaAlina (target 17) UNDER
Cafea macinată Lavazza Crema e Gusto 250 g: 89.99 lei at Local (target 75)
Lapte Casuta Mea 2.5% 1 l: 15.99 lei at METRO (target 14)
== run 2 (same prices: no second alert)
Lapte JLC 2.5% 1 l: 16.99 lei at MegaAlina (target 17) UNDER
...
```

and the message that reached the local Slack, Discord, Telegram and SMTP stand-ins, once:

```
Price alert: Lapte JLC 2.5% 1 l costs 16.99 lei at MegaAlina (your target: 17 lei)
https://www.megaalina.md/ro/catalog/lapte/jlc-lapte-1l-25-pelicula
Data: Satelit (satelit.md)
```

## Run it in 3 commands

```sh
cd satelit-examples/price-alert-node
export SATELIT_API_KEY=sat_live_...  SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...
node watch.js
```

Edit `watchlist.json` first: a `query` (the first in-stock match is pinned in `state.json`, so later runs follow
the same product) or a product `id` from the API, and a `target` in lei.

```json
[
  { "query": "lapte jlc 2.5%", "target": 17 },
  { "id": 3487, "target": 14 }
]
```

## Where the alert goes

Each channel is used when its settings are present:

| Channel | Environment |
|---|---|
| Slack | `SLACK_WEBHOOK_URL` |
| Discord | `DISCORD_WEBHOOK_URL` |
| Telegram | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` |
| E-mail | `SMTP_HOST`, `SMTP_PORT` (465), `SMTP_TLS=1` (implicit TLS), `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`, `MAIL_TO` |

Without any, the alert is only printed. An alert goes out when the price crosses under the target, and again only
when it drops further; a failed channel is logged and the others still go.

## Credits

2 credits per product per run (`/prices/items/{id}`), plus 3 once for each `query` to find it. Ten products checked
four times a day: 80 credits a day. Shop prices change a few times a day at most; checking more often than hourly
buys nothing.

## Schedule it

cron (every 4 hours):

```cron
0 */4 * * * cd /opt/price-alert-node && SATELIT_API_KEY=sat_live_... node watch.js >> alert.log 2>&1
```

systemd timer:

```ini
# price-alert.service
[Service]
Type=oneshot
WorkingDirectory=/opt/price-alert-node
EnvironmentFile=/etc/price-alert.env
ExecStart=/usr/bin/node watch.js
# price-alert.timer
[Timer]
OnCalendar=*-*-* 08,12,16,20:00
Persistent=true
[Install]
WantedBy=timers.target
```

Windows Task Scheduler:

```powershell
schtasks /Create /TN "Satelit price alert" /SC HOURLY /MO 4 /TR "cmd /c cd /d C:\price-alert-node && node watch.js >> alert.log 2>&1"
```

(set `SATELIT_API_KEY` as a user environment variable first). GitHub Actions: see
[`github-actions.yml`](github-actions.yml), which keeps `state.json` between runs in the Actions cache.

## Try it locally

```sh
node dev-receivers.js 18352 18353 &      # a fake webhook on :18352 and a fake SMTP server on :18353
SLACK_WEBHOOK_URL=http://127.0.0.1:18352/slack SMTP_HOST=127.0.0.1 SMTP_PORT=18353 MAIL_TO=me@example.org node watch.js
node --test                              # offline tests
```

## Troubleshooting

- `nothing found for "…"`: try fewer words; `in_stock=true` leaves out products no shop has today.
- `Satelit 429 rate_limited`: you run it too often; once an hour is plenty.
- No e-mail: most providers want port 465 with `SMTP_TLS=1` and an app password.

## Pe scurt (română)

Urmărește produse și trimite un mesaj (Slack, Discord, Telegram, e-mail) când prețul minim scade sub ținta ta.
Starea stă în `state.json`; rulează din cron, systemd, Task Scheduler sau GitHub Actions. 2 credite pe produs.
