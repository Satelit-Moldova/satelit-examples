"""Daily Monitorul Oficial digest as an HTML e-mail, from the Satelit API.

    SATELIT_API_KEY=... SMTP_HOST=smtp.example.org MAIL_TO=team@example.org python digest.py
    python digest.py --date 2026-11-19 --out digest.html      (write the HTML, send nothing)

Standard library only, Python 3.11+. 2 credits per run.
"""
import argparse
import datetime as dt
import html
import json
import os
import smtplib
import ssl
import sys
import urllib.error
import urllib.request
from email.message import EmailMessage

API = os.environ.get("SATELIT_API_URL", "https://api.satelit.md/v1")


class NotFound(Exception):
    pass


def satelit(path):
    req = urllib.request.Request(API + path, headers={
        "Authorization": "Bearer " + os.environ["SATELIT_API_KEY"], "Accept": "application/json",
        "User-Agent": "satelit-examples/1.0 (law-digest-email-python)"})
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        if e.code == 404:
            raise NotFound(path) from None
        try:
            err = json.load(e)["error"]
        except Exception:
            err = {"code": e.code, "message": e.reason}
        raise SystemExit(f"Satelit {e.code} {err['code']}: {err['message']}") from None


def render(digest, meta):
    """The e-mail body: important acts first, each with its Monitorul Oficial reference and link."""
    e = lambda s: html.escape(str(s or ""))
    items = sorted(digest["items"], key=lambda a: not a.get("important"))
    rows = []
    for a in items:
        badge = ' <span style="color:#b45309">●</span>' if a.get("important") else ""
        subject = a.get("subject") or a.get("title")
        rows.append(
            f'<tr><td style="padding:10px 0;border-bottom:1px solid #e5e7eb">'
            f'<div style="font-size:12px;color:#6b7280">{e(a["type_label"])} {e(a.get("number"))}'
            f' · {e(a.get("issuer_name") or a.get("issuer"))}{badge}</div>'
            f'<div style="font-size:15px;margin:2px 0"><a href="{e(a["url"])}" style="color:#1d4ed8">{e(subject)}</a></div>'
            f'<div style="font-size:12px;color:#6b7280">{e(a.get("mo_ref"))}</div></td></tr>')
    sources = ", ".join(f'<a href="{e(s["url"])}">{e(s["name"])}</a>' for s in meta.get("sources", []))
    attribution = f"<br>{e(meta['attribution'])}" if meta.get("attribution") else ""
    return f"""<!doctype html><html><body style="font-family:Arial,sans-serif;max-width:640px;margin:auto;color:#111827">
<h1 style="font-size:20px">{e(digest["title"])}</h1>
<p>{e(digest.get("intro"))}</p>
<table style="width:100%;border-collapse:collapse">{"".join(rows) or "<tr><td>Nicio publicare în această zi.</td></tr>"}</table>
<p style="font-size:12px;color:#6b7280">● important · Sursa: {sources}{attribution}<br>
Date: <a href="https://satelit.md">Satelit</a> (satelit.md)</p></body></html>"""


def send(subject, body_html, text):
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = os.environ.get("MAIL_FROM") or os.environ.get("SMTP_USER") or "digest@localhost"
    msg["To"] = os.environ["MAIL_TO"]
    msg.set_content(text)
    msg.add_alternative(body_html, subtype="html")
    host, port = os.environ["SMTP_HOST"], int(os.environ.get("SMTP_PORT", "587"))
    security = os.environ.get("SMTP_SECURITY", "starttls")  # starttls | ssl | none (a local relay)
    if security == "ssl":
        smtp = smtplib.SMTP_SSL(host, port, timeout=10, context=ssl.create_default_context())
    else:
        smtp = smtplib.SMTP(host, port, timeout=10)
        if security == "starttls":
            smtp.starttls(context=ssl.create_default_context())
    with smtp:
        if os.environ.get("SMTP_USER"):
            smtp.login(os.environ["SMTP_USER"], os.environ.get("SMTP_PASS", ""))
        smtp.send_message(msg)


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("--date", default=dt.date.today().isoformat(), help="YYYY-MM-DD, default today")
    p.add_argument("--out", help="write the HTML to this file instead of sending it")
    p.add_argument("--skip-empty", action="store_true", help="send nothing on a day without acts")
    args = p.parse_args(argv)
    if not os.environ.get("SATELIT_API_KEY"):
        sys.exit("Set SATELIT_API_KEY first.")
    try:
        body = satelit(f"/law/digests/{args.date}")
    except NotFound:
        body = {"data": {"title": f"Monitorul Oficial, {args.date}", "intro": "", "items": []}, "meta": {}}
    digest = body["data"]
    if args.skip_empty and not digest["items"]:
        print(f"{args.date}: no acts published, nothing sent")
        return
    page = render(digest, body["meta"])
    text = digest["title"] + "\n\n" + "\n".join(
        f"- {a['type_label']} {a.get('number') or ''}: {a.get('subject') or a['title']} ({a['url']})" for a in digest["items"])
    if args.out:
        with open(args.out, "w", encoding="utf-8") as f:
            f.write(page)
        print(f"{digest['title']}: {len(digest['items'])} acts, written to {args.out}")
    else:
        send(digest["title"], page, text)
        print(f"{digest['title']}: {len(digest['items'])} acts, sent to {os.environ['MAIL_TO']}")


if __name__ == "__main__":
    main()
