"""company-check: look up a Moldovan company by IDNO or name, for KYC and sales checks.

    python company.py 1002600048836              the register card, finances, public contracts, court cases
    python company.py "iute credit"              search by name; one match opens its card
    python company.py 1002600048836 --contracts  every public contract won (50 a page)
    python company.py moldtelecom --json         the raw API answer, for scripts

Standard library only, Python 3.11+. 2-3 credits per lookup, +2 per page of contracts.
"""
import argparse
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request

API = os.environ.get("SATELIT_API_URL", "https://api.satelit.md/v1")


class ApiError(Exception):
    pass


def satelit(path, **params):
    url = API + path + ("?" + urllib.parse.urlencode(params) if params else "")
    req = urllib.request.Request(url, headers={
        "Authorization": "Bearer " + os.environ["SATELIT_API_KEY"], "Accept": "application/json",
        "User-Agent": "satelit-examples/1.0 (company-check-cli)"})
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        try:
            err = json.load(e)["error"]
        except Exception:
            err = {"code": e.code, "message": e.reason}
        raise ApiError(f"{e.code} {err['code']}: {err['message']}") from None
    except (urllib.error.URLError, TimeoutError) as e:
        raise ApiError(f"network: {e}") from None


def money(v):
    return "—" if v is None else f"{v:,.0f} MDL".replace(",", " ")


def card(c):
    """The report for one company, as plain text lines."""
    act = c.get("activity") or {}
    sector = (act.get("division") or {}).get("name") or (act.get("sector") or {}).get("name") or "—"
    state = {True: "active", False: "inactive", None: "unknown"}[c.get("active")]
    out = [f"{c['display']} ({c.get('legal_form') or '?'})  IDNO {c['idno']}",
           f"  Register name : {c['name']}",
           f"  State         : {state}; registered {c.get('registered') or '—'}; register file of {c.get('register_date') or '—'}",
           f"  Address       : {c.get('address') or c.get('city') or '—'}",
           f"  Activity      : {sector}"]
    people = c.get("people") or {}
    if people.get("directors"):
        out.append(f"  Directors     : {'; '.join(people['directors'])}")
    if people.get("founders"):
        out.append(f"  Founders      : {'; '.join(people['founders'])}")
    for s in (c.get("statements") or [])[:2]:
        out.append(f"  {s['year']} statement: revenue {money(s.get('revenue'))}, profit {money(s.get('profit'))}, "
                   f"employees {s.get('employees') or '—'}")
    k = c.get("contracts") or {}
    if k:
        out.append(f"  Public contracts won: {k['count']}, {money(k['mdl'])}")
        for b in k.get("buyers", [])[:3]:
            out.append(f"    top buyer: {b['name']} ({b['n']}, {money(b['mdl'])})")
    courts = c.get("courts")
    if courts:
        nxt = courts.get("next") or {}
        out.append(f"  Court cases   : {courts['cases']} ({courts['as_plaintiff']} as plaintiff, {courts['as_defendant']} as defendant)"
                   + (f"; next hearing {nxt.get('date')} {nxt.get('time') or ''} {nxt.get('court') or ''}".rstrip() if nxt else ""))
    if (c.get("site") or {}).get("website"):
        out.append(f"  Website       : {c['site']['website']}")
    out.append(f"  Page          : {c['page']}")
    return out


def main(argv=None):
    p = argparse.ArgumentParser(description="Look up a Moldovan company by IDNO or name.")
    p.add_argument("query", help="13-digit IDNO, or 2+ letters of the name")
    p.add_argument("--contracts", action="store_true", help="list the public contracts won")
    p.add_argument("--page", type=int, default=1, help="page of contracts (50 a page)")
    p.add_argument("--json", action="store_true", help="print the API's JSON")
    a = p.parse_args(argv)
    if not os.environ.get("SATELIT_API_KEY"):
        sys.exit("Set SATELIT_API_KEY first.")
    try:
        q = a.query.strip()
        if re.fullmatch(r"\d{13}", q):
            idno = q
        else:
            found = satelit("/companies", q=q, per=10)
            if a.json and not a.contracts:
                print(json.dumps(found, ensure_ascii=False, indent=2))
                return
            rows = found["data"]
            if not rows:
                sys.exit(f'No company matches "{q}".')
            if len(rows) > 1:
                print(f"{found['meta'].get('page', {}).get('total', len(rows))} companies match \"{q}\":")
                for c in rows:
                    print(f"  {c['idno']}  {c['display']} ({c.get('legal_form') or '?'}), {c.get('city') or '—'}, "
                          f"{c.get('contracts_won') or 0} contracts")
                print("Run again with the IDNO for the full card.")
                return
            idno = rows[0]["idno"]
        if a.contracts:
            body = satelit(f"/companies/{idno}/contracts", page=a.page)
            if a.json:
                print(json.dumps(body, ensure_ascii=False, indent=2))
                return
            for k in body["data"]:
                print(f"{k['at'][:10]}  {money(k['amount']):>16}  {k['title'][:60]:<60}  {k['buyer']}")
            print(f"{len(body['data'])} contracts on page {a.page}.")
        else:
            body = satelit(f"/companies/{idno}")
            if a.json:
                print(json.dumps(body, ensure_ascii=False, indent=2))
                return
            print("\n".join(card(body["data"])))
        meta = body["meta"]
        print(f"\n{meta.get('attribution') or 'Sources: ' + ', '.join(s['name'] for s in meta.get('sources', []))}")
        print("Data: Satelit (satelit.md)")
    except ApiError as e:
        sys.exit(f"Satelit {e}")


if __name__ == "__main__":
    main()
