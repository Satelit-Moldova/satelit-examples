"""Offline tests: a fake Satelit API on 127.0.0.1."""
import contextlib
import io
import json
import os
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import company

CARD = {"idno": "1002600048836", "display": "MOLDTELECOM", "legal_form": "SA", "name": "Societatea pe Acţiuni MOLDTELECOM",
        "active": True, "registered": "1999-01-05", "register_date": "2026-11-16", "address": "bd. Ştefan cel Mare, 10",
        "activity": {"division": {"name": "Poștă și telecomunicații"}}, "people": {"directors": ["X [Administrator]"]},
        "statements": [{"year": 2025, "revenue": 1679938170.0, "profit": 137528280.0, "employees": 2091}],
        "contracts": {"count": 2225, "mdl": 23406972.6, "buyers": [{"name": "Serviciul Vamal", "n": 3, "mdl": 3606000.0}]},
        "courts": {"cases": 5, "as_plaintiff": 4, "as_defendant": 1, "next": None},
        "site": {"website": "http://www.moldtelecom.md"}, "page": "https://satelit.md/ro/legislatie/companii/x"}
META = {"attribution": "Sursa: Agenția Servicii Publice", "sources": []}
ROUTES = {
    "/v1/companies/1002600048836": {"data": CARD, "meta": META},
    "/v1/companies/1002600048836/contracts?page=1": {"data": [
        {"at": "2026-11-19T16:00:06+02:00", "amount": 70.0, "title": "Servicii telefonie fixa", "buyer": "Gimnaziul"}],
        "meta": META},
    "/v1/companies?q=moldtelecom&per=10": {"data": [CARD, dict(CARD, idno="2600048836836", city="—")],
                                           "meta": dict(META, page={"total": 2})},
    "/v1/companies?q=moldtelecom+sa&per=10": {"data": [CARD], "meta": META},
}


class Api(BaseHTTPRequestHandler):
    def do_GET(self):
        body = ROUTES.get(self.path)
        self.send_response(200 if body else 404)
        self.end_headers()
        self.wfile.write(json.dumps(body or {"error": {"code": "not_found", "message": "Nu am găsit."}}).encode())

    def log_message(self, *a):
        pass


def run(*argv):
    out = io.StringIO()
    with contextlib.redirect_stdout(out):
        try:
            company.main(list(argv))
        except SystemExit as e:
            return out.getvalue() + str(e.code)
    return out.getvalue()


class CompanyTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.api = ThreadingHTTPServer(("127.0.0.1", 0), Api)
        threading.Thread(target=cls.api.serve_forever, daemon=True).start()
        company.API = f"http://127.0.0.1:{cls.api.server_port}/v1"
        os.environ["SATELIT_API_KEY"] = "sat_live_test"

    @classmethod
    def tearDownClass(cls):
        cls.api.shutdown()

    def test_card_by_idno(self):
        out = run("1002600048836")
        self.assertIn("MOLDTELECOM (SA)  IDNO 1002600048836", out)
        self.assertIn("revenue 1 679 938 170 MDL", out)
        self.assertIn("Court cases   : 5 (4 as plaintiff, 1 as defendant)", out)
        self.assertIn("Sursa: Agenția Servicii Publice", out)

    def test_name_with_many_matches_lists_them(self):
        out = run("moldtelecom")
        self.assertIn("2 companies match", out)
        self.assertIn("2600048836836", out)

    def test_name_with_one_match_opens_the_card(self):
        self.assertIn("Public contracts won: 2225", run("moldtelecom sa"))

    def test_contracts(self):
        self.assertIn("Servicii telefonie fixa", run("1002600048836", "--contracts"))

    def test_not_found(self):
        self.assertIn("404 not_found", run("1234567890123"))


if __name__ == "__main__":
    unittest.main()
