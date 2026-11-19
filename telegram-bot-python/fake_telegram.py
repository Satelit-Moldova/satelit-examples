"""A tiny stand-in for the Telegram Bot API, for testing the bot without Telegram.

It hands the bot the messages you pass, once, and prints every reply the bot sends.

    python fake_telegram.py 18351 "/curs" "/pret lapte"
    TELEGRAM_API_URL=http://127.0.0.1:18351 TELEGRAM_BOT_TOKEN=test python bot.py
"""
import json
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


def make_server(port, texts):
    queue = [{"update_id": i + 1, "message": {"message_id": i + 1, "chat": {"id": 42, "type": "private"},
                                              "text": t}} for i, t in enumerate(texts)]
    sent = []

    class Handler(BaseHTTPRequestHandler):
        def do_POST(self):
            body = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))) or b"{}")
            method = self.path.rsplit("/", 1)[-1]
            if method == "getUpdates":
                result = [u for u in queue if u["update_id"] >= body.get("offset", 0)]
            elif method == "sendMessage":
                sent.append(body)
                result = {"message_id": 1000 + len(sent), "chat": {"id": body["chat_id"]}, "text": body["text"]}
            else:
                result = True
            out = json.dumps({"ok": True, "result": result}).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(out)))
            self.end_headers()
            self.wfile.write(out)

        def log_message(self, *a):
            pass

    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    server.sent = sent
    return server


if __name__ == "__main__":
    srv = make_server(int(sys.argv[1]), sys.argv[2:])
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    print(f"fake Bot API on http://127.0.0.1:{srv.server_port}", flush=True)
    seen = 0
    try:
        while True:
            threading.Event().wait(0.5)
            for m in srv.sent[seen:]:
                print("----- sendMessage\n" + m["text"], flush=True)
            seen = len(srv.sent)
    except KeyboardInterrupt:
        pass
