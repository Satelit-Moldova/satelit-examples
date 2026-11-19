"""Watch Romanian citizenship dossiers (ANC lists) and get a message when one changes.

    python track.py 12345/RD/2022 "ordin 1054/P/2025"     check now, print, remember in state.json
    WEBHOOK_URL=https://hooks.slack.com/... python track.py --file dossiers.txt

A change of state, order or oath date sends one message to WEBHOOK_URL (Slack, Discord or any
endpoint that takes JSON). Standard library only, Python 3.11+. 1 credit per dossier per run.
"""
import argparse
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

API = os.environ.get("SATELIT_API_URL", "https://api.satelit.md/v1")
WATCHED = ("status", "state", "order", "oath")  # the fields whose change is news


def satelit(path, **params):
    url = API + path + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={
        "Authorization": "Bearer " + os.environ["SATELIT_API_KEY"], "Accept": "application/json",
        "User-Agent": "satelit-examples/1.0 (citizenship-tracker)"})
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        try:
            err = json.load(e)["error"]
        except Exception:
            err = {"code": e.code, "message": e.reason}
        raise RuntimeError(f"Satelit {e.code} {err['code']}: {err['message']}") from None


def notify(text):
    url = os.environ.get("WEBHOOK_URL")
    if not url:
        return
    # "text" is read by Slack, "content" by Discord; other endpoints get both.
    data = json.dumps({"text": text, "content": text[:2000]}).encode()
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
    try:
        urllib.request.urlopen(req, timeout=10).close()
    except (urllib.error.URLError, TimeoutError) as e:
        print(f"notify failed: {e}", file=sys.stderr)


def snapshot(d):
    return {k: d.get(k) for k in WATCHED}


def check(queries, state):
    """Look every dossier up; return the messages for those that changed."""
    messages = []
    for q in queries:
        try:
            body = satelit("/citizenship/lookup", q=q)
        except RuntimeError as e:
            print(f"{q}: {e}", file=sys.stderr)
            continue
        data = body["data"]
        if data.get("order"):  # an order number: it does not change, so it is only shown
            print(f"{data['order']['line']} — {data['order']['page']}")
            continue
        if not data.get("found"):
            print(f"{q}: not in ANC's lists yet. {(data.get('not_found') or {}).get('line', '')}".rstrip())
            continue
        for d in data["dossiers"]:
            print(d["line"])
            now, before = snapshot(d), state.get(d["key"])
            if before is not None and before != now:
                messages.append(f"Dosarul {d['key']} s-a schimbat: {d['state']}\n{d['links']['page']}\n"
                                f"{body['meta'].get('attribution') or ''}\nDate: Satelit (satelit.md)")
            state[d["key"]] = now
        print(f"  ({data['as_of']['line']})")
    return messages


def main(argv=None):
    p = argparse.ArgumentParser(description="Watch Romanian citizenship dossiers.")
    p.add_argument("dossiers", nargs="*", help='e.g. 12345/RD/2022 or "ordin 1054/P/2025"')
    p.add_argument("--file", help="a text file with one dossier per line")
    p.add_argument("--state", default=os.environ.get("STATE_FILE", "state.json"))
    a = p.parse_args(argv)
    if not os.environ.get("SATELIT_API_KEY"):
        sys.exit("Set SATELIT_API_KEY first.")
    queries = list(a.dossiers)
    if a.file:
        with open(a.file, encoding="utf-8") as f:
            queries += [ln.strip() for ln in f if ln.strip() and not ln.startswith("#")]
    if not queries:
        p.error("give at least one dossier")
    state = {}
    if os.path.exists(a.state):
        with open(a.state, encoding="utf-8") as f:
            state = json.load(f)
    for m in check(queries, state):
        print("CHANGED:", m.splitlines()[0])
        notify(m)
    with open(a.state + ".tmp", "w", encoding="utf-8") as f:
        json.dump(state, f, ensure_ascii=False, indent=2)
    os.replace(a.state + ".tmp", a.state)


if __name__ == "__main__":
    main()
