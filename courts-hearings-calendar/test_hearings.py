"""Offline tests: a fake Satelit API on 127.0.0.1, and a structural check of the .ics."""
import contextlib
import io
import json
import os
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import hearings

CASE = {"number": "2-25001485-12-3-03012025", "title": "IUTE CREDIT SRL vs. CNPF, controlul legalităţii; actelor",
        "url": "https://satelit.md/ro/legislatie/sedinte-de-judecata/x"}
ROUTES = {
    "/v1/courts/search?q=iute+credit&per=1": {"data": [], "meta": {"profile": {
        "kind": "company", "name": "OCN Iute Credit SRL", "cases": 1047,
        "url": "https://satelit.md/ro/legislatie/sedinte-de-judecata/companie/ocn-iute-credit-srl"}}},
    "/v1/courts/names/company/ocn-iute-credit-srl?per=1": {"data": {"upcoming": [
        {"id": 43814, "date": "2026-11-24", "time": "09:00", "court": "Judecătoria Chișinău",
         "seat": "Judecătoria Chișinău, sediul Rîșcani", "room": "sala 22", "judge": "J", "case": CASE},
        {"id": 57028, "date": "2026-11-25", "time": None, "court": "Curtea Supremă de Justiție", "seat": None,
         "room": None, "judge": None, "case": CASE}]}, "meta": {}},
}


class Api(BaseHTTPRequestHandler):
    def do_GET(self):
        body = ROUTES.get(self.path)
        self.send_response(200 if body else 404)
        self.end_headers()
        self.wfile.write(json.dumps(body or {"error": {"code": "not_found", "message": "x"}}).encode())

    def log_message(self, *a):
        pass


def unfold(text):
    return text.replace("\r\n ", "").split("\r\n")


class HearingsTest(unittest.TestCase):
    def test_name_to_valid_ics(self):
        srv = ThreadingHTTPServer(("127.0.0.1", 0), Api)
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        hearings.API = f"http://127.0.0.1:{srv.server_port}/v1"
        os.environ["SATELIT_API_KEY"] = "sat_live_test"
        out = os.path.join(tempfile.mkdtemp(), "h.ics")
        with contextlib.redirect_stdout(io.StringIO()):
            hearings.main(["iute credit", "-o", out])
        srv.shutdown()
        with open(out, "rb") as f:
            raw = f.read()
        text = raw.decode("utf-8")
        for line in text.split("\r\n"):
            self.assertLessEqual(len(line.encode("utf-8")), 75, line)
        lines = unfold(text)
        self.assertEqual(lines.count("BEGIN:VEVENT"), 2)
        self.assertEqual(lines.count("BEGIN:VEVENT"), lines.count("END:VEVENT"))
        self.assertIn("DTSTART;TZID=Europe/Chisinau:20261124T090000", lines)
        self.assertIn("DTSTART;VALUE=DATE:20261125", lines)
        self.assertIn("UID:hearing-43814@examples.satelit.md", lines)
        self.assertIn(r"LOCATION:Judecătoria Chișinău\, sediul Rîșcani\, sala 22", lines)
        self.assertTrue(any(x.startswith(r"SUMMARY:Ședință: IUTE CREDIT SRL vs. CNPF\, controlul legalităţii\; actelor")
                            for x in lines))
        self.assertTrue(text.endswith("END:VCALENDAR\r\n"))

    def test_fold_keeps_multibyte_letters_whole(self):
        folded = hearings.fold("DESCRIPTION:" + "ș" * 100)
        for part in folded.split("\r\n"):
            self.assertLessEqual(len(part.encode("utf-8")), 75)
        self.assertEqual(folded.replace("\r\n ", ""), "DESCRIPTION:" + "ș" * 100)


if __name__ == "__main__":
    unittest.main()
