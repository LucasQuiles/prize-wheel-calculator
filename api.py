import argparse
import json
import logging
import os
import re
import socket
import sys
import time
from typing import Optional, Tuple
from urllib.parse import urlparse

import requests
import websocket
from websocket import WebSocketConnectionClosedException

# ───────────────────────── Playwright setup ──────────────────────────
try:
    from playwright.sync_api import (
        sync_playwright,
        TimeoutError as PWTimeout,
        WebSocket as PWWebSocket,
    )

    PLAYWRIGHT_AVAILABLE = True
except ImportError:
    PLAYWRIGHT_AVAILABLE = False

###############################################################################
# USAGE QUICK‑START                                                           #
# ---------------------------------------------------------------------------#
# 1) Ensure Chrome is logged into Whatnot via Google OAuth.                   #
# 2) Point the script at that profile:                                        #
#      python api.py --profile "~/Library/Application Support/Google/Chrome/Default"  #
# 3) A GUI browser launches with your cookies; the script auto‑captures       #
#    the authenticated WebSocket & token.                                     #
# 4) After the first run you may add --headless for silent operation.         #
###############################################################################
# FLAGS                                                                       #
#   --profile   PATH  Explicit Chrome/Chromium user‑data dir                  #
#   --headless        Run invisible Chromium (after cookies saved)           #
#   --verbose         Debug logging                                          #
###############################################################################

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger("whatnot-listener")

session = requests.Session()
session.headers.update(
    {
        "User-Agent": "Mozilla/5.0 (compatible; WhatnotStreamListener/3.0)",
        "Accept": "application/json",
    }
)
ORIGIN = "https://www.whatnot.com"

# ───────────────────────── Helper functions ──────────────────────────

def browser_fetch(url: str, *, headless: bool, profile_dir: Optional[str]) -> Tuple[str, Optional[str], Optional[str]]:
    """Render page in Chrome(+stealth), capture HTML, token, first WS.
    Returns (html, token, ws_url).
    """
    if not PLAYWRIGHT_AVAILABLE:
        raise RuntimeError("Playwright missing – run `pip install playwright` & `playwright install`. ")

    launch_args = [
        "--disable-blink-features=AutomationControlled",
        "--disable-features=IsolateOrigins,SitePerProcess",
    ]
    extra = {"headless": headless, "args": launch_args, "channel": "chrome"}

    with sync_playwright() as p:
        if profile_dir:
            context = p.chromium.launch_persistent_context(profile_dir, **extra)
            page = context.pages[0] if context.pages else context.new_page()
        else:
            browser = p.chromium.launch(**extra)
            context = browser.new_context()
            page = context.new_page()

        # Remove navigator.webdriver
        context.add_init_script(
            "Object.defineProperty(navigator, 'webdriver', {get: () => undefined})"
        )

        ws_url: Optional[str] = None

        def _ws_listener(ws: PWWebSocket):
            nonlocal ws_url
            if not ws_url:
                ws_url = ws.url
                log.info("[Browser] WebSocket detected → %s", ws_url)

        context.on("websocket", _ws_listener)

        log.info("[Browser] %s mode – loading %s", "Headless" if headless else "GUI", url)
        try:
            page.goto(url, timeout=90_000)
        except PWTimeout:
            log.warning("Navigation timeout – continuing with partial load …")

        # If GUI mode & WS not yet detected, allow manual login
        if not headless and not ws_url:
            input("\n[Browser] Complete Google/Whatnot login in the window, then press <Enter>… ")
            try:
                ws_obj = context.wait_for_event("websocket", timeout=30_000)
                ws_url = ws_obj.url
            except Exception:
                pass

        html = page.content()

        # Token discovery
        token = page.evaluate(
            "() => window.__WHT__?.token || localStorage.getItem('token') || null"
        )
        if not token:
            for ck in context.cookies():
                if ck["name"].startswith("__Secure-access-token"):
                    token = ck["value"]
                    break

        context.close()
        return html, token, ws_url


def resolve_host(url: str) -> bool:
    try:
        socket.getaddrinfo(urlparse(url).hostname, 443)
        return True
    except socket.gaierror:
        return False


def chat_stream(ws_url: str, token: Optional[str]):
    if token and "token=" not in ws_url:
        ws_url += ("&" if "?" in ws_url else "?") + f"token={token}"
    if not resolve_host(ws_url):
        raise RuntimeError(f"DNS fail → {ws_url}")

    headers = [f"User-Agent: {session.headers['User-Agent']}", f"Origin: {ORIGIN}"]
    backoff = 1
    while True:
        try:
            ws = websocket.create_connection(ws_url, header=headers, timeout=20)
            log.info("WS connected → %s", ws_url)
            backoff = 1
            while True:
                yield json.loads(ws.recv())
        except (WebSocketConnectionClosedException, Exception) as e:
            log.warning("WS drop (%s) – reconnect in %ss", e, backoff)
            time.sleep(backoff)
            backoff = min(backoff * 2, 30)
        finally:
            try:
                ws.close()
            except Exception:
                pass

# ─────────────────────────── Main entry ────────────────────────────

def main():
    ap = argparse.ArgumentParser("Whatnot live listener – uses Chrome profile")
    ap.add_argument("url", nargs="?", help="Whatnot live URL (prompt if omitted)")
    ap.add_argument("--profile", help="Path to Chrome user‑data dir (reuses cookies)")
    ap.add_argument("--headless", action="store_true", help="Run headless after profile is primed")
    ap.add_argument("--token", help="Manual Bearer token (override)")
    ap.add_argument("--verbose", action="store_true")
    args = ap.parse_args()

    if not args.url:
        args.url = input("Paste Whatnot live URL: ").strip()
    if args.verbose:
        log.setLevel(logging.DEBUG)

    profile_dir = args.profile or os.getenv("PLAYWRIGHT_USER_DIR")
    if profile_dir:
        os.environ["PLAYWRIGHT_USER_DIR"] = profile_dir
        log.info("Using Chrome profile: %s", profile_dir)

    # 1) Render page with real browser
    html, token_br, ws_detected = browser_fetch(
        args.url, headless=args.headless, profile_dir=profile_dir
    )

    token = args.token or os.getenv("WNT_TOKEN") or token_br
    if token:
        session.headers["Authorization"] = f"Bearer {token}"

    ws_url = ws_detected or re.search(
        r"wss://[^'\"<>]+/(?:live|auction)/socket/websocket[^'\"<>]+", html
    ).group(0)

    log.info("WebSocket endpoint ⇒ %s", ws_url)
    log.info("Streaming events – Ctrl+C to exit…")

    try:
        for evt in chat_stream(ws_url, token):
            kind = evt.get("type")
            if kind == "bid":
                log.info("[BID] %s bid $%s on %s", evt['user'].get('name'), evt.get('amount'), evt.get('itemId'))
            elif kind == "message":
                log.debug("[CHAT] %s: %s", evt['user'].get('name'), evt.get('text'))
            else:
                log.debug("[EVENT] %s", evt)
    except KeyboardInterrupt:
        log.info("Interrupted by user – goodbye")


if __name__ == "__main__":
    main()
