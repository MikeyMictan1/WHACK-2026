"""A short-lived frame that takes over the LED (e.g. negotiation progress), after which the
equipped skin comes back. The LED Home display loop shows it on screen and on the board.
"""

import threading
import time

from app.core.led_skins import Frame

_lock = threading.Lock()
_frame: Frame | None = None
_until = 0.0


def show(frame: Frame, seconds: float = 4.0) -> None:
    global _frame, _until
    with _lock:
        _frame, _until = frame, time.monotonic() + seconds


def current() -> Frame | None:
    with _lock:
        return _frame if time.monotonic() < _until else None
