"""A local debug SMTP server: accepts every message and saves it as an .eml file. Nothing leaves the machine.

    python dev_smtp.py 18355 out/        then: SMTP_HOST=127.0.0.1 SMTP_PORT=18355 SMTP_SECURITY=none python digest.py
"""
import os
import socketserver
import sys
import threading
import time


class Handler(socketserver.StreamRequestHandler):
    def reply(self, line):
        self.wfile.write((line + "\r\n").encode())

    def handle(self):
        self.reply("220 dev-smtp ready")
        data = None
        while True:
            raw = self.rfile.readline()
            if not raw:
                return
            line = raw.decode("utf-8", "replace").rstrip("\r\n")
            if data is not None:
                if line == ".":
                    self.server.save(b"\r\n".join(data))
                    data = None
                    self.reply("250 queued")
                else:
                    data.append(raw.rstrip(b"\r\n")[1:] if raw.startswith(b"..") else raw.rstrip(b"\r\n"))
                continue
            cmd = line[:4].upper()
            if cmd in ("EHLO", "HELO"):
                self.reply("250-dev-smtp")
                self.reply("250 8BITMIME")
            elif cmd == "DATA":
                data = []
                self.reply("354 end with <CRLF>.<CRLF>")
            elif cmd == "QUIT":
                self.reply("221 bye")
                return
            else:
                self.reply("250 ok")


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True

    def __init__(self, port, folder):
        super().__init__(("127.0.0.1", port), Handler)
        self.folder = folder
        self.messages = []
        os.makedirs(folder, exist_ok=True)

    def save(self, raw):
        path = os.path.join(self.folder, f"mail-{time.strftime('%Y%m%d-%H%M%S')}-{len(self.messages) + 1}.eml")
        with open(path, "wb") as f:
            f.write(raw)
        self.messages.append(raw)
        print(f"saved {path} ({len(raw)} bytes)", flush=True)


def start(port=0, folder="out"):
    srv = Server(port, folder)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv


if __name__ == "__main__":
    srv = Server(int(sys.argv[1]) if len(sys.argv) > 1 else 18355, sys.argv[2] if len(sys.argv) > 2 else "out")
    print(f"dev SMTP on 127.0.0.1:{srv.server_address[1]}, saving to {srv.folder}", flush=True)
    srv.serve_forever()
