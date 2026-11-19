# Romanian citizenship dossier tracker

Checks Romanian citizenship dossiers (article 11, 10, 8…) against ANC's published lists on a schedule and sends one
message when a dossier's state, order or oath date changes. Python standard library only.

**Who it is for:** people waiting for their own dossier or their family's, and the lawyers and agencies who file
dossiers for clients and want to stop checking ANC's PDFs by hand.

Real output from the live run on 19 Nov 2026:

```
$ python track.py 12345/RD/2022 "ordin 1054/P/2025" 99999/RD/2026
Dosarul 12345/RD/2022: în analiză în lista ANC din 08.10.2026, termen 20.06.2025. Listele ANC mai noi decât 08.10.2026 lipsesc aici: ordinul poate fi deja emis, verifică la ANC.
  (Date ANC până la 06.11.2026)
Ordinul 1054/P/2025 din 24.03.2025: 6 dosare — https://satelit.md/ro/legislatie/cetatenie-romana/ordin-1054-p-2025
99999/RD/2026: not in ANC's lists yet. Dosarul 99999/RD/2026: nu apare încă în listele ANC; estimare: ordin în ~februarie 2030. …
```

When a dossier changed since the last run (shown in the live run by editing `state.json` back to an older state):

```
CHANGED: Dosarul 12345/RD/2022 s-a schimbat: în analiză în lista ANC din 08.10.2026, termen 20.06.2025
```

and the webhook received:

```json
{"text": "Dosarul 12345/RD/2022 s-a schimbat: în analiză în lista ANC din 08.10.2026, termen 20.06.2025\nhttps://satelit.md/ro/legislatie/cetatenie-romana?q=12345/RD/2022\nSursa: Autoritatea Națională pentru Cetățenie (cetatenie.just.ro); listele mai vechi: copiile Internet Archive (web.archive.org)\nDate: Satelit (satelit.md)", "content": "…"}
```

## Run it in 3 commands

```sh
cd satelit-examples/citizenship-tracker
export SATELIT_API_KEY=sat_live_...  WEBHOOK_URL=https://hooks.slack.com/services/...
python track.py 12345/RD/2022
```

Dossiers are written as people write them: `12345/RD/2022`, `12345/2022`. An order as `ordin 1054/P/2025` (shown,
not tracked: an order does not change). Many dossiers: one per line in a file, `python track.py --file dossiers.txt`.
`WEBHOOK_URL` takes a Slack or Discord webhook or any endpoint that accepts JSON (`text` and `content` are both
sent). Without it, changes are only printed.

The first run only remembers. Later runs report what moved. State: `state.json` (or `--state path`).

## Credits

1 per dossier per run (`/citizenship/lookup`). ANC publishes new lists every few weeks and orders a few times a
week, so once a day is plenty: 30 credits a month per dossier.

## Schedule it

```cron
0 10 * * * cd /opt/citizenship-tracker && SATELIT_API_KEY=sat_live_... WEBHOOK_URL=... python3 track.py --file dossiers.txt
```

Windows: `schtasks /Create /TN "ANC tracker" /SC DAILY /ST 10:00 /TR "cmd /c cd /d C:\citizenship-tracker && python track.py --file dossiers.txt"`.

## Tests

```sh
python -m unittest -v      # a fake Satelit API and webhook on 127.0.0.1
```

## Good to know

Satelit reads ANC's lists as ANC publishes them, and says how fresh they are (`Date ANC până la …`). The line
"verifică la ANC" is there on purpose: ANC's own page (`cetatenie.just.ro/stadiu-dosar/`) is the official answer.

## Pe scurt (română)

Urmărește dosarele de cetățenie română în listele ANC și trimite un mesaj când se schimbă starea, ordinul sau
jurământul. 1 credit pe dosar. O rulare pe zi ajunge.
