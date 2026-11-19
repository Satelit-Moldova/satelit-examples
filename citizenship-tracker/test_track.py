"""Offline tests: a fake Satelit API and a fake webhook on 127.0.0.1."""
import contextlib
import io
import json
import os
import tempfile
import threading
import unittest
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import track

STATUS = {"value": "termen"}
POSTS = []


def lookup(q):
    if q.startswith("ordin"):
        return {"dossiers": [], "found": False, "order": {"line": "Ordinul 1054/P/2025 din 24.03.2025: 6 dosare",
                                                          "page": "https://satelit.md/x"}}
    if q == "99999/RD/2026":
        return {"dossiers": [], "found": False, "order": None, "not_found": {"line": "estimare: ~2030"},
                "as_of": {"line": "Date ANC"}}
    return {"found": True, "order": None, "as_of": {"line": "Date ANC până la 06.11.2026"}, "dossiers": [
        {"key": q, "status": STATUS["value"], "state": f"stare {STATUS['value']}", "order": None, "oath": None,
         "line": f"Dosarul {q}: {STATUS['value']}", "links": {"page": "https://satelit.md/ro/legislatie/cetatenie-romana"}}]}


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        q = urllib.parse.parse_qs(urllib.parse.urlsplit(self.path).query)["q"][0]
        body = {"data": lookup(q), "meta": {"attribution": "Sursa: ANC"}}
        self.send_response(200)
        self.end_headers()
        self.wfile.write(json.dumps(body).encode())

    def do_POST(self):
        POSTS.append(json.loads(self.rfile.read(int(self.headers["Content-Length"]))))
        self.send_response(204)
        self.end_headers()

    def log_message(self, *a):
        pass


class TrackTest(unittest.TestCase):
    def test_tells_only_about_changes(self):
        srv = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        base = f"http://127.0.0.1:{srv.server_port}"
        track.API = base + "/v1"
        state = os.path.join(tempfile.mkdtemp(), "state.json")
        os.environ.update(SATELIT_API_KEY="sat_live_test", WEBHOOK_URL=base + "/hook")
        args = ["12345/RD/2022", "ordin 1054/P/2025", "99999/RD/2026", "--state", state]
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            track.main(args)          # first look: remembered, nothing sent
            track.main(args)          # same: nothing sent
            STATUS["value"] = "ordin"
            track.main(args)          # changed: one message
        srv.shutdown()
        self.assertEqual(len(POSTS), 1)
        self.assertIn("Dosarul 12345/RD/2022 s-a schimbat: stare ordin", POSTS[0]["text"])
        self.assertIn("Ordinul 1054/P/2025", out.getvalue())
        self.assertIn("not in ANC's lists yet", out.getvalue())
        with open(state, encoding="utf-8") as f:
            self.assertEqual(json.load(f)["12345/RD/2022"]["status"], "ordin")


if __name__ == "__main__":
    unittest.main()
