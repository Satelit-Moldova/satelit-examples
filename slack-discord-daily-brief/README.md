# Morning brief for Slack or Discord

One message a morning in a team channel: BNM's rates, today's fuel prices and the five weightiest news stories,
posted to a Slack or Discord incoming webhook. Node 18+, no dependencies.

**Who it is for:** teams in Moldova whose day starts with "what is the euro at?", sales teams quoting in lei,
newsrooms and offices that want one short summary instead of five tabs.

Real message from the live run on 19 Nov 2026, as the local webhook stand-in received it (Slack format, trimmed):

```
*Curs BNM 2026-11-19:* EUR 20.1411 (-0.1% 7z) · USD 18.3744 (+1.5% 7z) · RON 3.7671 (-0.1% 7z)
*Carburanți 2026-11-19:* benzină de la 27.9 lei (TLX), motorină de la 33.25 lei, plafon ANRE 28.08 / 33.46
*Știri:*
• <https://tv8.md/ru/2026/11/19/…|Guvernul a aprobat bugetul pe 2027: deficit de aproape 20 de miliarde de lei …>
• <https://stiri.md/article/social/…|Un judecător nu a trecut vettingul pentru a doua oară>
• …
_Sursa: Banca Națională a Moldovei, bnm.md, CC BY 4.0 · Date: <https://satelit.md|Satelit>_
```

Discord gets the same text with `**bold**` and `[title](<url>)` links, mentions switched off.

## Run it in 3 commands

```sh
cd satelit-examples/slack-discord-daily-brief
export SATELIT_API_KEY=sat_live_... WEBHOOK_URL=https://hooks.slack.com/services/T000/B000/XXXX
node brief.js                     # or: node brief.js --print  (show it, post nothing)
```

A Discord URL (`discord.com/api/webhooks/…`) is recognised; `WEBHOOK_KIND=slack|discord` forces the format.
Make the webhook in Slack (an app with **Incoming Webhooks**) or in Discord (channel → **Integrations → Webhooks**).

## Credits

4 per run: `/rates` 1, `/fuel` 1, `/news?per=20` 2. One brief a working day: about 88 a month. If one part fails
(say the news), the brief still goes without it and the error is logged.

## Schedule it

```cron
0 9 * * 1-5 cd /opt/daily-brief && SATELIT_API_KEY=sat_live_... WEBHOOK_URL=https://hooks.slack.com/... node brief.js
```

GitHub Actions (secrets `SATELIT_API_KEY`, `WEBHOOK_URL`):

```yaml
on:
  schedule: [{ cron: "0 7 * * 1-5" }]   # 07:00 UTC
jobs:
  brief:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: node slack-discord-daily-brief/brief.js
        env:
          SATELIT_API_KEY: ${{ secrets.SATELIT_API_KEY }}
          WEBHOOK_URL: ${{ secrets.WEBHOOK_URL }}
```

## Try it locally

```sh
node dev-webhook.js 18356 &          # prints every JSON body it gets
WEBHOOK_URL=http://127.0.0.1:18356/slack node brief.js
node --test                          # offline tests
```

## Troubleshooting

- `webhook answered 404`: the webhook was deleted; make a new one.
- `webhook answered 400 invalid_blocks` (Slack): a story title with odd characters; the text is escaped, so report it.

## Pe scurt (română)

Un mesaj de dimineață pe Slack sau Discord: cursul BNM, carburanții și cinci știri. Node, fără dependențe;
4 credite pe rulare; pornește din cron sau GitHub Actions.
