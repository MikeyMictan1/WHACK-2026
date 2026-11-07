"""Little LED reactions for the plan negotiation. Always best effort: no board, no problem.

The 16x16 grid shows a bar that fills from the bottom as the child wins a lower rate
(red when nothing has moved, lime at the best possible rate). Confirming a switch fills the grid lime.

These are shown as a temporary overlay (core/led_overlay.py): the LED Home display loop draws them
on the board and on the web page for a few seconds, then goes back to the equipped skin.
"""

from app.core import led_overlay
from app.core.led_skins import SIZE, Color, Frame

DIM = 0.35  # the LEDs are bright; keep it comfortable on a desk
SHOW_SECONDS = 5.0


def _color(progress: float) -> Color:
    """Red at 0, lime at 1."""
    p = max(0.0, min(1.0, progress))
    r, g, b = (255 + (212 - 255) * p, 60 + (255 - 60) * p, 40 + (58 - 40) * p)
    return int(r * DIM), int(g * DIM), int(b * DIM)


def _bar(rows_lit: int, color: Color) -> Frame:
    return [color if y >= SIZE - rows_lit else (0, 0, 0) for y in range(SIZE) for _ in range(SIZE)]


def show_progress(progress: float) -> None:
    """progress 0..1: how much of the available discount the child has won so far."""
    rows = max(1, round(progress * SIZE))
    led_overlay.show(_bar(rows, _color(progress)), SHOW_SECONDS)


def show_switched() -> None:
    led_overlay.show(_bar(SIZE, _color(1.0)), SHOW_SECONDS)
