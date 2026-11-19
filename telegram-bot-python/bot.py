"""A Telegram bot that answers with Moldova's data from the Satelit API.

Commands: /curs, /benzina, /cinema [oras], /film <titlu>, /pret <produs>, /stiri.
Plain Bot API over urllib: no dependencies, Python 3.11+.
"""
import hashlib
import html
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

SATELIT_URL = os.environ.get("SATELIT_API_URL", "https://api.satelit.md/v1")
TELEGRAM_URL = os.environ.get("TELEGRAM_API_URL", "https://api.telegram.org")
CACHE_DIR = Path(os.environ.get("SATELIT_CACHE_DIR", ".cache"))
TIMEOUT = 10  # seconds, every Satelit call

# Cache lifetimes in seconds. Movies cost 40 credits a call, so they live longest.
TTL = {"rates": 3 * 3600, "fuel": 2 * 3600, "prices": 3 * 3600, "news": 15 * 60,
       "cinema": 2 * 3600, "film": 24 * 3600}

FOOTER = '\n\n<i>Date: <a href="https://satelit.md">Satelit</a></i>'


class ApiError(Exception):
    pass


def satelit(path, params=None, ttl=3600):
    """GET a Satelit route, cached on disk. A stale copy is served when the API fails."""
    url = SATELIT_URL + path + ("?" + urllib.parse.urlencode(params) if params else "")
    cached = CACHE_DIR / (hashlib.sha1(url.encode()).hexdigest() + ".json")
    if cached.exists() and time.time() - cached.stat().st_mtime < ttl:
        return json.loads(cached.read_text("utf-8"))
    req = urllib.request.Request(url, headers={
        "Authorization": "Bearer " + os.environ["SATELIT_API_KEY"],
        "Accept": "application/json",
        "User-Agent": "satelit-examples/1.0 (telegram-bot-python)",
    })
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
            body = json.load(r)
    except urllib.error.HTTPError as e:
        try:
            err = json.load(e)["error"]
        except Exception:
            err = {"code": str(e.code), "message": e.reason}
        if cached.exists():
            return json.loads(cached.read_text("utf-8"))
        raise ApiError(f"{err['code']}: {err['message']}") from None
    except (urllib.error.URLError, TimeoutError) as e:
        if cached.exists():
            return json.loads(cached.read_text("utf-8"))
        raise ApiError(f"network: {e}") from None
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cached.write_text(json.dumps(body, ensure_ascii=False), "utf-8")
    return body


def esc(s):
    return html.escape(str(s if s is not None else ""), quote=False)


def footer(meta):
    """The attribution line the source asks for, plus the Satelit link."""
    line = f"\n\n<i>{esc(meta['attribution'])}</i>" if meta.get("attribution") else ""
    return line + FOOTER


def cmd_curs(_args):
    body = satelit("/rates", ttl=TTL["rates"])
    wanted = ["EUR", "USD", "RON", "UAH", "GBP"]
    rows = [r for r in body["data"] if r["code"] in wanted]
    rows.sort(key=lambda r: wanted.index(r["code"]))
    day = rows[0]["date"] if rows else ""
    lines = [f"<b>Cursul BNM, {esc(day)}</b>"]
    for r in rows:
        lines.append(f"{r['nominal']} {esc(r['code'])} = <b>{r['value']:.4f}</b> MDL ({r['change_7d_pct']:+.1f}% / 7 zile)")
    return "\n".join(lines) + footer(body["meta"])


def cmd_benzina(_args):
    body = satelit("/fuel", ttl=TTL["fuel"])
    d = body["data"]
    names = {n["key"]: n["name"] for n in d["networks"]}
    lines = [f"<b>Carburanți, {esc(d['date'])}</b>",
             f"Plafon ANRE: benzină {d['cap']['a95']} lei, motorină {d['cap']['diesel']} lei"]
    for fuel, label in (("a95", "Benzină 95"), ("diesel", "Motorină"), ("lpg", "GPL")):
        rng = d["range"].get(fuel)
        if rng:
            cheapest = names.get(d["cheapest"].get(fuel), d["cheapest"].get(fuel))
            lines.append(f"{label}: {rng['min']}–{rng['max']} lei, cel mai ieftin: {esc(cheapest)}")
    return "\n".join(lines) + footer(body["meta"])


def cmd_cinema(args):
    params = {"country": "MD"}
    if args:
        params["city"] = args
    body = satelit("/movies/cinemas/today", params, ttl=TTL["cinema"])
    d = body["data"]
    if not d["cinemas"]:
        return f"Nicio sală cu filme azi{' în ' + esc(args) if args else ''}." + FOOTER
    lines = [f"<b>Filme azi, {esc(d['day'])}</b>"]
    for c in d["cinemas"][:3]:
        lines.append(f"\n<b>{esc(c['cinema']['name'])}</b> ({esc(c['cinema']['city'])})")
        for f in c["films"][:6]:
            times = ", ".join(s["time"] for s in f["sessions"][:5])
            lines.append(f"• {esc(f['title'])}: {esc(times)}")
    return "\n".join(lines) + footer(body["meta"])


def cmd_film(args):
    if not args:
        return "Scrie titlul: /film Matrix"
    body = satelit("/movies/search", {"q": args, "kind": "movie"}, ttl=TTL["film"])
    results = body["data"]["results"][:3]
    if not results:
        return f"Nu am găsit „{esc(args)}”." + FOOTER
    lines = []
    for m in results:
        rating = f" ★ {m['rating']['value']}" if m.get("rating") else ""
        genres = ", ".join(m.get("genres") or [])
        lines.append(f"<b>{esc(m['title'])}</b> ({m.get('year') or '?'}){rating}\n<i>{esc(genres)}</i>\n"
                     f"{esc((m.get('overview') or '')[:200])}")
    return "\n\n".join(lines) + footer(body["meta"])


def cmd_pret(args):
    if len(args) < 2:
        return "Scrie produsul: /pret lapte"
    found = satelit("/prices/search", {"q": args, "in_stock": "true"}, ttl=TTL["prices"])
    if not found["data"]:
        return f"Nu am găsit „{esc(args)}”." + FOOTER
    lines = [f"<b>Prețuri: {esc(args)}</b>"]
    for item in found["data"][:4]:
        lines.append(f"• {esc(item['name'])}: de la <b>{item['min_price']}</b> lei ({item['stores']} magazine)")
    # The cheapest shop of the first product: one more call, 2 credits.
    top = satelit(f"/prices/items/{found['data'][0]['id']}", ttl=TTL["prices"])
    offers = [o for o in top["data"]["offers"] if o["in_stock"]][:3]
    if offers:
        lines.append(f"\n<b>{esc(top['data']['name'])}</b>")
        for o in offers:
            lines.append(f"  {o['price']} lei la {esc(o['store']['name'])}")
    return "\n".join(lines) + FOOTER


def cmd_stiri(_args):
    body = satelit("/news", {"per": 5}, ttl=TTL["news"])
    lines = ["<b>Știri</b>"]
    for n in body["data"]:
        src = n["sources"][0] if n["sources"] else None
        link = f' — <a href="{esc(src["url"])}">{esc(src["name"])}</a>' if src else ""
        lines.append(f"• {esc(n['title'])}{link}")
    return "\n".join(lines) + footer(body["meta"])


COMMANDS = {"curs": cmd_curs, "benzina": cmd_benzina, "cinema": cmd_cinema,
            "film": cmd_film, "pret": cmd_pret, "stiri": cmd_stiri}

HELP = ("<b>Comenzi</b>\n/curs — cursul BNM\n/benzina — carburanți\n/cinema [oraș] — filme azi\n"
        "/film &lt;titlu&gt; — despre un film\n/pret &lt;produs&gt; — prețuri în magazine\n/stiri — știri")


def handle(text):
    """Turn one message into one HTML reply (None: not a command)."""
    if not text.startswith("/"):
        return None
    head, _, args = text.partition(" ")
    name = head[1:].split("@")[0].lower()
    fn = COMMANDS.get(name)
    if fn is None:
        return HELP
    try:
        return fn(args.strip())
    except ApiError as e:
        print(f"satelit: {e}", file=sys.stderr)
        return "Datele nu sunt disponibile acum. Încearcă mai târziu."


def telegram(method, **params):
    url = f"{TELEGRAM_URL}/bot{os.environ['TELEGRAM_BOT_TOKEN']}/{method}"
    req = urllib.request.Request(url, data=json.dumps(params).encode(),
                                 headers={"Content-Type": "application/json"})
    # Long polling holds the request up to 25 s, so this one timeout is longer.
    with urllib.request.urlopen(req, timeout=35) as r:
        return json.load(r)["result"]


def run(polls=None):
    """Long-poll Telegram; polls=N stops after N rounds (tests)."""
    offset = 0
    while polls is None or polls > 0:
        if polls is not None:
            polls -= 1
        try:
            updates = telegram("getUpdates", offset=offset, timeout=25, allowed_updates=["message"])
        except (urllib.error.URLError, TimeoutError) as e:
            print(f"telegram: {e}", file=sys.stderr)
            time.sleep(5)
            continue
        for u in updates:
            offset = u["update_id"] + 1
            msg = u.get("message") or {}
            reply = handle(msg.get("text") or "")
            if reply:
                telegram("sendMessage", chat_id=msg["chat"]["id"], text=reply,
                         parse_mode="HTML", disable_web_page_preview=True)


if __name__ == "__main__":
    for var in ("TELEGRAM_BOT_TOKEN", "SATELIT_API_KEY"):
        if not os.environ.get(var):
            sys.exit(f"Set {var} first.")
    run()
