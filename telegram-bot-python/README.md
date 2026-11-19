# Telegram bot: rates, fuel, cinema, prices and news

A Telegram bot that answers six commands with Moldova's data from the Satelit API. Plain Bot API over `urllib`:
one file, no dependencies.

**Who it is for:** anyone who wants a family, office or community chat to answer "how much is the euro today?"
or "where is milk cheapest?" without leaving Telegram.

```
/curs
Cursul BNM, 2026-11-19
1 EUR = 20.1411 MDL (-0.1% / 7 zile)
1 USD = 18.3744 MDL (+1.5% / 7 zile)
1 RON = 3.7671 MDL (-0.1% / 7 zile)
1 UAH = 0.4067 MDL (+1.8% / 7 zile)
Sursa: Banca Națională a Moldovei, bnm.md, CC BY 4.0
Date: Satelit

/pret lapte
Prețuri: lapte
• Lapte JLC 2.5% 1 l: de la 16.99 lei (4 magazine)
...
Lapte JLC 2.5% 1 l
  16.99 lei la MegaAlina
  17.99 lei la Linella
  18.05 lei la Bonus

/cinema Bălți
Filme azi, 2026-11-19
Cineplex Balti (Bălți)
• Dune: 10:40, 16:00
• Insula pierdută: 11:40
• Cum să spargi o bancă: 14:00, 18:30, 20:50
```

Real replies from the live run on 19 Nov 2026 (HTML tags removed here, Telegram shows them bold and italic).

## Commands

| Command | Route | Credits | Cached |
|---|---|---|---|
| `/curs` | `/rates` | 1 | 3 h |
| `/benzina` | `/fuel` | 1 | 2 h |
| `/pret <produs>` | `/prices/search` + `/prices/items/{id}` (the cheapest shops of the first match) | 3 + 2 | 3 h |
| `/stiri` | `/news?per=5` | 2 | 15 min |
| `/film <titlu>` | `/movies/search` | 40 | 24 h |
| `/cinema [oraș]` | `/movies/cinemas/today` | 40 | 2 h |

The cache is a folder of JSON files (`.cache/`, or `SATELIT_CACHE_DIR`). A hundred people asking `/curs` in an
hour cost 1 credit. When the API fails, the bot answers from the last cached copy, or with one short line.

## Run it in 3 commands

Talk to [@BotFather](https://t.me/BotFather), send `/newbot` and copy the token. Then:

```sh
cd satelit-examples/telegram-bot-python
export TELEGRAM_BOT_TOKEN=123456:ABC...  SATELIT_API_KEY=sat_live_...
python bot.py
```

Requirements: Python 3.11 or newer. Get an API key in the [console](https://developer.satelit.md/en/console/)
([plans](https://developer.satelit.md/en/pricing/)).

## Try it without Telegram

`fake_telegram.py` stands in for the Bot API on your machine: it hands the bot your messages and prints its replies.

```sh
python fake_telegram.py 18351 "/curs" "/pret lapte" &
TELEGRAM_API_URL=http://127.0.0.1:18351 TELEGRAM_BOT_TOKEN=test python bot.py
```

## Keep it running

It is a long-polling loop, so run it as a service rather than on a schedule:

```ini
# /etc/systemd/system/satelit-bot.service
[Service]
WorkingDirectory=/opt/satelit-examples/telegram-bot-python
EnvironmentFile=/etc/satelit-bot.env
ExecStart=/usr/bin/python3 bot.py
Restart=always
```

On Windows: `nssm install satelit-bot python bot.py`, or a Task Scheduler task "At startup".

## Tests

```sh
python -m unittest -v        # a fake Satelit API and a fake Bot API on 127.0.0.1, no network
```

## Troubleshooting

- **"Datele nu sunt disponibile acum"**: the API answered an error and nothing was cached yet. The exact code is on
  stderr (`satelit: 401 key_invalid: …`). See [errors](https://developer.satelit.md/en/errors/).
- **The bot is silent in a group**: by default bots see only commands. That is all it needs. Check that no other
  process polls the same token (Telegram gives updates to one poller).
- `/film` and `/cinema` cost 40 credits each when not cached. Keep the TTLs if credits matter.

## Pe scurt (română)

Bot Telegram cu `/curs`, `/benzina`, `/cinema`, `/film`, `/pret`, `/stiri`. Un singur fișier Python, fără
dependențe. Răspunsurile stau în cache pe disc, deci costă puține credite. Pornește cu tokenul de la @BotFather și
cheia Satelit: `python bot.py`.
