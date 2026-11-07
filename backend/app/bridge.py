"""Laptop bridge: lets the deployed site use the NFC reader and LED board plugged into this laptop.

Run from the repo root (Git Bash or PowerShell), with the reader and/or board plugged in:

    npm run bridge                                   # uses BRIDGE_URL and BRIDGE_TOKEN from backend/.env
    npm run bridge -- --url https://<site> --token <token>

It connects to <site>/api/nfc/bridge over a WebSocket and keeps reconnecting if the connection
drops. Card taps go up; card reads/writes ("Log out with NFC", logging in with a saved card) and
LED frames come down. See core/bridge_link.py for the messages. Stop the local backend while
bridging, so only one program talks to the reader.
"""

import argparse
import asyncio
import json
import threading
from urllib.parse import quote

from websockets.asyncio.client import ClientConnection, connect
from websockets.exceptions import ConnectionClosed, InvalidStatus

from app.core.config import settings
from app.core.nfc_card import NfcError, Tag, card_lock, close_tag, open_tag
from app.core.nfc_hub import NfcHub
from app.core.unicorn import UnicornError, unicorn

BOARD_STATUS_SECONDS = 3
CARD_SESSION_SECONDS = 20  # a card left open longer than this (server gone quiet) is closed


def log(text: str) -> None:
    print(f"[bridge] {text}", flush=True)


class CardSession:
    """The card the server is reading or writing. Holds card_lock from open to close, so the
    reader poller doesn't touch the card in between."""

    def __init__(self) -> None:
        self.tag: Tag | None = None
        self._timer: threading.Timer | None = None
        self._guard = threading.Lock()

    def _watchdog(self) -> None:
        if self._timer:
            self._timer.cancel()
        self._timer = threading.Timer(CARD_SESSION_SECONDS, self.close)
        self._timer.daemon = True
        self._timer.start()

    def open(self) -> dict:
        self.close()  # a previous session the server never closed
        if not card_lock.acquire(timeout=10):
            raise NfcError("The reader is busy. Try again.")
        try:
            tag = open_tag()
        except Exception:
            card_lock.release()
            raise
        with self._guard:
            self.tag = tag
        self._watchdog()
        # "card_type", not "type": the reply's own "type" field is "reply"
        return {"uid": tag.uid.hex().upper(), "card_type": tag.type, "capacity": tag.capacity}

    def _tag(self) -> Tag:
        if self.tag is None:
            raise NfcError("No card is open. Tap again.")
        self._watchdog()
        return self.tag

    def read(self, length: int) -> dict:
        return {"data": self._tag().read(length).hex()}

    def write(self, data: str) -> dict:
        self._tag().write(bytes.fromhex(data))
        return {}

    def close(self) -> dict:
        with self._guard:
            tag, self.tag = self.tag, None
            if self._timer:
                self._timer.cancel()
                self._timer = None
        if tag is not None:
            close_tag(tag)
            card_lock.release()
        return {}


def _do_call(card: CardSession, msg: dict) -> dict:
    op = msg.get("op")
    try:
        if op == "open":
            result = card.open()
        elif op == "read":
            result = card.read(int(msg["length"]))
        elif op == "write":
            result = card.write(str(msg["data"]))
        elif op == "close":
            result = card.close()
        else:
            raise NfcError(f"Unknown operation: {op}")
        return {**result, "type": "reply", "id": msg.get("id"), "ok": True}
    except NfcError as e:
        return {"type": "reply", "id": msg.get("id"), "ok": False, "error": str(e)}
    except Exception as e:
        return {"type": "reply", "id": msg.get("id"), "ok": False, "error": f"Reader error on the laptop: {e}"}


async def _send(ws: ClientConnection, msg: dict) -> None:
    await ws.send(json.dumps(msg))


async def _forward_taps(ws: ClientConnection, hub: NfcHub) -> None:
    queue = hub.subscribe()
    try:
        await _send(ws, {"type": "reader", "name": hub.local_reader})
        while True:
            event = await queue.get()
            if event["type"] == "reader":
                log(f"reader: {event['name'] or 'unplugged'}")
                await _send(ws, {"type": "reader", "name": event["name"]})
            elif event["type"] == "card":
                log(f"card tapped: {event['uid']}")
                await _send(ws, event)
            elif event["type"] == "card_removed":
                await _send(ws, event)
    finally:
        hub.unsubscribe(queue)


async def _report_board(ws: ClientConnection) -> None:
    last = None
    while True:
        try:
            s = await asyncio.to_thread(unicorn.status)
            status = {"connected": bool(s["connected"]), "port": s["port"], "fast": unicorn.fast}
        except Exception:
            status = {"connected": False, "port": None, "fast": False}
        if status != last:
            log(f"LED board: {status['port'] if status['connected'] else 'not found'}")
            last = status
        await _send(ws, {"type": "board", **status})
        await asyncio.sleep(BOARD_STATUS_SECONDS)


async def _receive(ws: ClientConnection, card: CardSession) -> None:
    frame_busy = False

    def show(frame: list[tuple[int, int, int]]) -> None:
        nonlocal frame_busy
        try:
            unicorn.show_frame(frame)
        except (UnicornError, Exception):
            pass  # board unplugged mid-frame: the status loop reports it
        finally:
            frame_busy = False

    async for raw in ws:
        msg = json.loads(raw)
        if msg.get("type") == "call":
            reply = await asyncio.to_thread(_do_call, card, msg)
            await _send(ws, reply)
        elif msg.get("type") == "frame" and not frame_busy:
            hexs = str(msg.get("hex", ""))
            frame = [(int(hexs[i : i + 2], 16), int(hexs[i + 2 : i + 4], 16), int(hexs[i + 4 : i + 6], 16)) for i in range(0, len(hexs), 6)]
            if len(frame) == 256:
                frame_busy = True
                asyncio.get_running_loop().run_in_executor(None, show, frame)


def _ws_url(url: str, token: str) -> str:
    base = url.rstrip("/")
    if base.startswith("https://"):
        base = "wss://" + base[len("https://") :]
    elif base.startswith("http://"):
        base = "ws://" + base[len("http://") :]
    return f"{base}/api/nfc/bridge?token={quote(token)}"


async def run(url: str, token: str) -> None:
    hub = NfcHub()
    hub.start()  # polls the reader plugged into this laptop
    card = CardSession()
    delay = 1
    log(f"connecting to {url} ...")
    while True:
        try:
            async with connect(_ws_url(url, token), ping_interval=20, max_size=2**20, open_timeout=15) as ws:
                log("connected. Taps on this reader now reach the site. Ctrl+C to stop.")
                delay = 1
                tasks = [
                    asyncio.create_task(_forward_taps(ws, hub)),
                    asyncio.create_task(_report_board(ws)),
                    asyncio.create_task(_receive(ws, card)),
                ]
                done, pending = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
                for t in pending:
                    t.cancel()
                for t in done:
                    if t.exception():
                        raise t.exception()  # type: ignore[misc]
                log("disconnected.")
        except InvalidStatus as e:
            code = e.response.status_code
            if code in (401, 403):
                log("the site refused the token. BRIDGE_TOKEN must match the site's BRIDGE_TOKEN variable.")
            else:
                log(f"the site answered HTTP {code}. Is the URL right and the site up?")
        except (ConnectionClosed, OSError, TimeoutError) as e:
            log(f"connection lost ({type(e).__name__}).")
        card.close()
        log(f"retrying in {delay} s ...")
        await asyncio.sleep(delay)
        delay = min(delay * 2, 30)


def main() -> None:
    parser = argparse.ArgumentParser(description="Connect this laptop's NFC reader and LED board to the deployed site.")
    parser.add_argument("--url", default=settings.bridge_url, help="the site, e.g. https://whack.up.railway.app (default: BRIDGE_URL)")
    parser.add_argument("--token", default=settings.bridge_token, help="the site's BRIDGE_TOKEN (default: BRIDGE_TOKEN)")
    args = parser.parse_args()
    if not args.url or not args.token:
        parser.error("set BRIDGE_URL and BRIDGE_TOKEN in backend/.env, or pass --url and --token")
    try:
        asyncio.run(run(args.url, args.token))
    except KeyboardInterrupt:
        log("stopped.")


if __name__ == "__main__":
    main()
