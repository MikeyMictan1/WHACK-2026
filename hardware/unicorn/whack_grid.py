"""Runs on the Pico 2 W Stellar Unicorn (16x16). The backend drives it over USB serial.

The backend interrupts whatever is running (Ctrl-C), then types:
    import whack_grid; whack_grid.run()
and sends one command per line:
    P x y r g b    set one pixel (0-255 colour)
    C              clear the display
    B n            brightness, 0-100
Copy it to the board with:  uvx mpremote connect COM3 cp hardware/unicorn/whack_grid.py :whack_grid.py
"""

import sys

from picographics import DISPLAY_STELLAR_UNICORN, PicoGraphics
from stellar import StellarUnicorn


def run():
    su = StellarUnicorn()
    gfx = PicoGraphics(DISPLAY_STELLAR_UNICORN)
    su.set_brightness(0.5)
    black = gfx.create_pen(0, 0, 0)
    gfx.set_pen(black)
    gfx.clear()
    su.update(gfx)
    print("WHACK_GRID_READY")

    while True:
        line = sys.stdin.readline()
        if not line:
            continue
        parts = line.split()
        if not parts:
            continue
        try:
            cmd = parts[0]
            if cmd == "P":
                x, y, r, g, b = (int(v) for v in parts[1:6])
                gfx.set_pen(gfx.create_pen(r, g, b))
                gfx.pixel(x, y)
            elif cmd == "C":
                gfx.set_pen(black)
                gfx.clear()
            elif cmd == "B":
                su.set_brightness(max(0, min(100, int(parts[1]))) / 100)
            su.update(gfx)
        except Exception:
            pass  # ignore a garbled line rather than crash the loop
