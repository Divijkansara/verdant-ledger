#!/usr/bin/env python3
"""Serve the Verdant Ledger web application on http://localhost:5500

    python serve.py

Opening index.html directly from the file system works too — the whole
application runs from a double-click. Serving it matters only for the LIVE
backend connection: a file:// page has a null origin, which the API's CORS
policy refuses, so the console falls back to its local engine.
"""

import http.server
import os
import webbrowser

PORT = 5500
ROOT = os.path.dirname(os.path.abspath(__file__))


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, fmt, *args):
        print(f"  {self.address_string()} — {fmt % args}")


if __name__ == "__main__":
    # Threaded: browsers open several keep-alive connections at once, and a
    # single-threaded server lets one idle connection stall every other request.
    http.server.ThreadingHTTPServer.allow_reuse_address = True
    with http.server.ThreadingHTTPServer(("", PORT), Handler) as httpd:
        url = f"http://localhost:{PORT}/"
        print(f"Verdant Ledger → {url}")
        print("Ctrl-C to stop.\n")
        try:
            webbrowser.open(url)
        except Exception:
            pass
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nStopped.")
