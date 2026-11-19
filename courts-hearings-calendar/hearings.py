"""Put a party's upcoming court hearings in Moldova into an .ics calendar (Google, Outlook, Apple).

    python hearings.py "iute credit"                  next hearings of the best-matching party -> hearings.ics
    python hearings.py --case 2-25001485-12-3-03012025  every future hearing of one case
    python hearings.py "moldtelecom" -o moldtelecom.ics

Standard library only, Python 3.11+. A name costs 6 credits (search 3 + the party's page 3), a case 1.
"""
import argparse
import datetime as dt
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

API = os.environ.get("SATELIT_API_URL", "https://api.satelit.md/v1")

# Moldova's time zone, so calendars show the court's local time all year.
VTIMEZONE = """BEGIN:VTIMEZONE
TZID:Europe/Chisinau
BEGIN:STANDARD
DTSTART:19701025T030000
RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU
TZOFFSETFROM:+0300
TZOFFSETTO:+0200
TZNAME:EET
END:STANDARD
BEGIN:DAYLIGHT
DTSTART:19700329T020000
RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU
TZOFFSETFROM:+0200
TZOFFSETTO:+0300
TZNAME:EEST
END:DAYLIGHT
END:VTIMEZONE"""


def satelit(path, **params):
    url = API + path + ("?" + urllib.parse.urlencode(params) if params else "")
    req = urllib.request.Request(url, headers={
        "Authorization": "Bearer " + os.environ["SATELIT_API_KEY"], "Accept": "application/json",
        "User-Agent": "satelit-examples/1.0 (courts-hearings-calendar)"})
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        try:
            err = json.load(e)["error"]
        except Exception:
            err = {"code": e.code, "message": e.reason}
        sys.exit(f"Satelit {e.code} {err['code']}: {err['message']}")


def by_name(name):
    """Hearings of the party whose name matches best: /courts/search finds it, its page lists the next ones."""
    found = satelit("/courts/search", q=name, per=1)
    profile = found["meta"].get("profile")
    if not profile:
        sys.exit(f'No party named "{name}" in the courts\' agendas.')
    slug = profile.get("slug") or profile["url"].rstrip("/").rsplit("/", 1)[-1]
    page = satelit(f"/courts/names/{profile['kind']}/{slug}", per=1)
    print(f"{profile['name']}: {profile['cases']} cases, {len(page['data']['upcoming'])} upcoming hearings")
    return [{"id": h["id"], "date": h["date"], "time": h.get("time"), "where": ", ".join(filter(None, [h.get("seat") or h["court"], h.get("room")])),
             "judge": h.get("judge"), "number": h["case"]["number"], "title": h["case"]["title"], "url": h["case"]["url"]}
            for h in page["data"]["upcoming"]]


def by_case(number):
    c = satelit("/courts/case", number=number)["data"]
    today = dt.date.today().isoformat()
    seat = (c.get("seat") or c["court"])["name"]
    print(f"{c['number']}: {c['title'][:90]}")
    return [{"id": f"{c['number']}-{h['date']}-{h.get('time') or ''}", "date": h["date"], "time": h.get("time"),
             "where": ", ".join(filter(None, [seat, h.get("room")])), "judge": h.get("judge"),
             "number": c["number"], "title": c["title"], "url": c["url"]}
            for h in c["timeline"] if h["date"] >= today]


def esc(s):
    return str(s).replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,").replace("\n", "\\n")


def fold(line):
    """RFC 5545: lines of at most 75 octets, continued with a space."""
    out, cur = [], b""
    for ch in line:
        b = ch.encode("utf-8")
        if len(cur) + len(b) > (75 if not out else 74):
            out.append(cur)
            cur = b""
        cur += b
    out.append(cur)
    return "\r\n ".join(x.decode("utf-8") for x in out)


def to_ics(hearings, stamp=None):
    stamp = stamp or dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Satelit examples//courts-hearings-calendar//EN",
             "CALSCALE:GREGORIAN", "X-WR-CALNAME:Ședințe de judecată", *VTIMEZONE.splitlines()]
    for h in hearings:
        day = h["date"].replace("-", "")
        if h.get("time"):
            start = f"DTSTART;TZID=Europe/Chisinau:{day}T{h['time'].replace(':', '')}00"
            length = "DURATION:PT1H"
        else:  # a day without an hour: an all-day entry
            start = f"DTSTART;VALUE=DATE:{day}"
            length = "DURATION:P1D"
        desc = f"Dosar {h['number']}\n{h['title']}\nJudecător: {h.get('judge') or '—'}\n{h['url']}\nDate: Satelit (satelit.md)"
        lines += ["BEGIN:VEVENT", f"UID:hearing-{esc(h['id'])}@examples.satelit.md", f"DTSTAMP:{stamp}", start, length,
                  f"SUMMARY:{esc('Ședință: ' + h['title'][:80].rstrip())}", f"LOCATION:{esc(h['where'])}",
                  f"DESCRIPTION:{esc(desc)}", f"URL:{h['url']}", "END:VEVENT"]
    lines.append("END:VCALENDAR")
    return "\r\n".join(fold(x) for x in lines) + "\r\n"


def main(argv=None):
    p = argparse.ArgumentParser(description="Export court hearings to an .ics calendar.")
    p.add_argument("name", nargs="?", help="a company's name as it appears in the cases")
    p.add_argument("--case", help="one case number (or PIGD)")
    p.add_argument("-o", "--out", default="hearings.ics")
    a = p.parse_args(argv)
    if not os.environ.get("SATELIT_API_KEY"):
        sys.exit("Set SATELIT_API_KEY first.")
    if not (a.name or a.case):
        p.error("give a name or --case")
    hearings = by_case(a.case) if a.case else by_name(a.name)
    for h in hearings:
        print(f"  {h['date']} {h.get('time') or '--:--'}  {h['where'][:60]:<60}  {h['number']}")
    with open(a.out, "w", encoding="utf-8", newline="") as f:
        f.write(to_ics(hearings))
    print(f"{len(hearings)} hearings written to {a.out}")


if __name__ == "__main__":
    main()
