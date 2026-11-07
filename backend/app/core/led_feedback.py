"""Little LED reactions for the plan negotiation. Always best effort: no board, no problem.

The 16x16 grid shows a bar that fills from the bottom as the child wins a lower rate
(red when nothing has moved, lime at the best possible rate). Confirming a switch fills the grid lime.
"""

import time

from app.core.unicorn import SIZE, Color, UnicornError, unicorn

DIM = 0.35  # the LEDs are bright; keep it comfortable on a desk
_RETRY_AFTER = 30.0  # seconds to leave the board alone after it failed
_off_until = 0.0


def _color(progress: float) -> Color:
    """Red at 0, lime at 1."""
    p = max(0.0, min(1.0, progress))
    r, g, b = (255 + (212 - 255) * p, 60 + (255 - 60) * p, 40 + (58 - 40) * p)
    return int(r * DIM), int(g * DIM), int(b * DIM)


def _paint(rows_lit: int, color: Color) -> None:
    for y in range(SIZE):
        want = color if y >= SIZE - rows_lit else None
        for x in range(SIZE):
            if unicorn.pixels[y][x] != want:
                unicorn.set_pixel(x, y, want)


def _guarded(fn) -> None:  # noqa: ANN001
    global _off_until
    if time.monotonic() < _off_until:
        return
    try:
        fn()
    except UnicornError:
        _off_until = time.monotonic() + _RETRY_AFTER
    except Exception:
        _off_until = time.monotonic() + _RETRY_AFTER


def show_progress(progress: float) -> None:
    """progress 0..1: how much of the available discount the child has won so far."""
    rows = max(1, round(progress * SIZE))
    _guarded(lambda: _paint(rows, _color(progress)))


def show_switched() -> None:
    _guarded(lambda: _paint(SIZE, _color(1.0)))
