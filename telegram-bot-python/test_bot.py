"""Offline tests: a fake Satelit API and a fake Bot API on 127.0.0.1, no network."""
import json
import os
import shutil
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import fake_telegram

META = {"credits": 1, "updated_at": "2026-11-19T16:36:34+02:00", "sources": [], "attribution": None}
FIXTURES = {
    "/rates": {"data": [
        {"code": "USD", "name": "Dolar SUA", "value": 18.3744, "nominal": 1, "date": "2026-11-19",
         "change_7d_pct": 1.5, "change_30d_pct": 2.5},
        {"code": "EUR", "name": "Euro", "value": 20.1411, "nominal": 1, "date": "2026-11-19",
         "change_7d_pct": -0.1, "change_30d_pct": 0.2}],
        "meta": dict(META, attribution="Sursa: Banca Națională a Moldovei, bnm.md, CC BY 4.0")},
    "/fuel": {"data": {"date": "2026-11-19", "cap": {"a95": 28.08, "diesel": 33.46},
                       "networks": [{"key": "tlx", "name": "TLX"}],
                       "cheapest": {"a95": "tlx", "diesel": "tlx", "lpg": "tlx"},
                       "range": {"a95": {"min": 27.9, "max": 28.8}, "diesel": {"min": 33.25, "max": 34.14}}},
              "meta": META},
    "/prices/search": {"data": [{"id": 217, "name": "Lapte JLC 2.5% 1 l", "min_price": 16.99, "stores": 4}],
                       "meta": META},
    "/prices/items/217": {"data": {"id": 217, "name": "Lapte JLC 2.5% 1 l", "offers": [
        {"store": {"key": "megaalina", "name": "MegaAlina"}, "price": 16.99, "in_stock": True},
        {"store": {"key": "linella", "name": "Linella"}, "price": 17.99, "in_stock": True}]}, "meta": META},
    "/news": {"data": [{"id": "n_1", "title": "Guvernul a aprobat bugetul pe 2027 <b>",
                        "sources": [{"name": "TV8", "url": "https://tv8.md/x"}]}], "meta": META},
    "/movies/search": {"data": {"results": [{"id": "m603", "title": "Matrix", "year": 1999,
                                             "rating": {"value": 8.3}, "genres": ["SF"], "overview": "Neo."}]},
                       "meta": META},
    "/movies/cinemas/today": {"data": {"day": "2026-11-19", "cinemas": [
        {"cinema": {"name": "Cineplex Balti", "city": "Bălți"},
         "films": [{"title": "Dune", "sessions": [{"time": "10:40"}, {"time": "16:00"}]}]}]}, "meta": META},
}


def fake_satelit():
    hits = []

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            path = self.path.split("?")[0].removeprefix("/v1")
            hits.append(self.path)
            ok = self.headers.get("Authorization") == "Bearer sat_live_test" and path in FIXTURES
            body = json.dumps(FIXTURES[path] if ok else {"error": {"code": "not_found", "message": "x"}}).encode()
            self.send_response(200 if ok else 404)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, *a):
            pass

    srv = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    srv.hits = hits
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv


class BotTest(unittest.TestCase):
    def setUp(self):
        self.api = fake_satelit()
        self.cache = tempfile.mkdtemp()
        os.environ.update(SATELIT_API_KEY="sat_live_test", TELEGRAM_BOT_TOKEN="1:T",
                          SATELIT_API_URL=f"http://127.0.0.1:{self.api.server_port}/v1",
                          SATELIT_CACHE_DIR=self.cache)
        import importlib
        import bot
        self.bot = importlib.reload(bot)  # pick up the URLs above

    def tearDown(self):
        self.api.shutdown()
        shutil.rmtree(self.cache)

    def test_rates_with_attribution(self):
        out = self.bot.handle("/curs")
        self.assertIn("1 EUR = <b>20.1411</b> MDL", out)
        self.assertLess(out.index("EUR"), out.index("USD"))
        self.assertIn("Sursa: Banca Națională a Moldovei", out)

    def test_fuel(self):
        self.assertIn("Benzină 95: 27.9–28.8 lei, cel mai ieftin: TLX", self.bot.handle("/benzina"))

    def test_price_names_the_shop(self):
        out = self.bot.handle("/pret lapte")
        self.assertIn("16.99 lei la MegaAlina", out)

    def test_news_is_escaped(self):
        self.assertIn("2027 &lt;b&gt;", self.bot.handle("/stiri"))

    def test_movies_and_cinema(self):
        self.assertIn("<b>Matrix</b> (1999) ★ 8.3", self.bot.handle("/film matrix"))
        self.assertIn("• Dune: 10:40, 16:00", self.bot.handle("/cinema Bălți@my_bot"))

    def test_cache_saves_calls(self):
        self.bot.handle("/film matrix")
        self.bot.handle("/film matrix")
        self.assertEqual(len([h for h in self.api.hits if "movies" in h]), 1)

    def test_api_down_gives_a_short_answer(self):
        os.environ["SATELIT_API_KEY"] = "wrong"
        self.assertIn("nu sunt disponibile", self.bot.handle("/curs"))

    def test_unknown_command_shows_help(self):
        self.assertIn("/curs", self.bot.handle("/start"))
        self.assertIsNone(self.bot.handle("salut"))

    def test_polling_loop_replies_through_bot_api(self):
        tg = fake_telegram.make_server(0, ["/curs", "hello", "/benzina"])
        threading.Thread(target=tg.serve_forever, daemon=True).start()
        self.bot.TELEGRAM_URL = f"http://127.0.0.1:{tg.server_port}"
        self.bot.run(polls=1)
        tg.shutdown()
        self.assertEqual(len(tg.sent), 2)
        self.assertEqual(tg.sent[0]["chat_id"], 42)
        self.assertEqual(tg.sent[0]["parse_mode"], "HTML")


if __name__ == "__main__":
    unittest.main()
