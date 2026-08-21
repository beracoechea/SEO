import asyncio
import gzip
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from threading import Thread

import httpx

from app.crawler import AsyncUrllibTransport


def _serve():
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_args) -> None:
            return

        def do_GET(self) -> None:  # noqa: N802
            if self.path == "/go":
                self.send_response(302)
                self.send_header("Location", "/land")
                self.end_headers()
                return
            self.send_response(200)
            self.send_header("Content-Type", "text/html")
            if self.path == "/gz":
                payload = gzip.compress(b"<html><title>gzipped</title></html>")
                self.send_header("Content-Encoding", "gzip")
                self.end_headers()
                self.wfile.write(payload)
                return
            self.end_headers()
            self.wfile.write(b"<html><title>ok</title></html>")

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    return server


def test_urllib_transport_keeps_redirects():
    server = _serve()
    host, port = server.server_address

    async def run() -> None:
        async with httpx.AsyncClient(
            transport=AsyncUrllibTransport(),
            follow_redirects=False,
            timeout=5.0,
        ) as client:
            bounced = await client.get(f"http://127.0.0.1:{port}/go")
            landed = await client.get(f"http://127.0.0.1:{port}/land")
            assert bounced.status_code == 302
            assert bounced.headers.get("location") == "/land"
            assert landed.status_code == 200
            assert "ok" in landed.text
            zipped = await client.get(f"http://127.0.0.1:{port}/gz")
            assert zipped.status_code == 200
            assert "gzipped" in zipped.text

    try:
        asyncio.run(run())
    finally:
        server.shutdown()
