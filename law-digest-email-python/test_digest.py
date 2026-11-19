"""Offline tests: a fake Satelit API and the debug SMTP server, both on 127.0.0.1."""
import email
import json
import os
import tempfile
import threading
import unittest
from email import policy
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import dev_smtp
import digest

DIGEST = {"data": {"date": "2026-11-19", "title": "Noutăți legislative: 19 noiembrie 2026", "intro": "2 acte.",
                   "items": [
                       {"type_label": "Ordin", "number": "477-O", "issuer_name": "Serviciul Vamal", "important": False,
                        "subject": "Norme <vamale>", "title": "x", "mo_ref": "MO 575-576/19.11.2026 art. 967a",
                        "url": "https://monitorul.gov.md/ro/monitor/3379"},
                       {"type_label": "Lege", "number": "266", "issuer_name": "Parlamentul", "important": True,
                        "subject": "Aderarea la International IDEA", "title": "y", "mo_ref": "MO 575-576/19.11.2026 art. 623",
                        "url": "https://monitorul.gov.md/ro/monitor/3379"}]},
          "meta": {"credits": 2, "attribution": None,
                   "sources": [{"name": "Monitorul Oficial", "url": "https://monitorul.gov.md", "license": "x"}]}}


class Api(BaseHTTPRequestHandler):
    def do_GET(self):
        found = self.path == "/v1/law/digests/2026-11-19"
        self.send_response(200 if found else 404)
        self.end_headers()
        self.wfile.write(json.dumps(DIGEST if found else {"error": {"code": "not_found", "message": "x"}}).encode())

    def log_message(self, *a):
        pass


class DigestTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.api = ThreadingHTTPServer(("127.0.0.1", 0), Api)
        threading.Thread(target=cls.api.serve_forever, daemon=True).start()
        digest.API = f"http://127.0.0.1:{cls.api.server_port}/v1"
        os.environ["SATELIT_API_KEY"] = "sat_live_test"

    @classmethod
    def tearDownClass(cls):
        cls.api.shutdown()

    def test_render_escapes_and_puts_important_first(self):
        page = digest.render(DIGEST["data"], DIGEST["meta"])
        self.assertIn("Norme &lt;vamale&gt;", page)
        self.assertLess(page.index("International IDEA"), page.index("Norme"))
        self.assertIn('href="https://satelit.md"', page)
        self.assertIn("Monitorul Oficial", page)

    def test_sends_html_and_text_through_smtp(self):
        folder = tempfile.mkdtemp()
        smtp = dev_smtp.start(0, folder)
        os.environ.update(SMTP_HOST="127.0.0.1", SMTP_PORT=str(smtp.server_address[1]), SMTP_SECURITY="none",
                          MAIL_TO="team@example.org", MAIL_FROM="digest@example.org")
        digest.main(["--date", "2026-11-19"])
        smtp.shutdown()
        self.assertEqual(len(smtp.messages), 1)
        msg = email.message_from_bytes(smtp.messages[0], policy=policy.default)
        self.assertEqual(msg["Subject"], "Noutăți legislative: 19 noiembrie 2026")
        self.assertIn("Lege 266", msg.get_body(("plain",)).get_content())
        self.assertIn("<table", msg.get_body(("html",)).get_content())

    def test_empty_day_is_skipped(self):
        out = os.path.join(tempfile.mkdtemp(), "d.html")
        digest.main(["--date", "2026-11-15", "--skip-empty", "--out", out])
        self.assertFalse(os.path.exists(out))


if __name__ == "__main__":
    unittest.main()
