"""USB-serial bridge to a Pico 2 W Stellar Unicorn (16x16 LEDs).

The board runs hardware/unicorn/whack_grid.py. On connect we press Ctrl-C (stopping its
demo launcher, or an older copy of our script), start whack_grid, then redraw the
pixels we remember so the board always matches the web grid.
"""

import threading
import time

SIZE = 16
PICO_VID = 0x2E8A  # Raspberry Pi
BAUD = 115200

Color = tuple[int, int, int]


class UnicornError(Exception):
    pass


class Unicorn:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._serial = None
        self.port: str | None = None
        self.pixels: list[list[Color | None]] = [[None] * SIZE for _ in range(SIZE)]
        # True when the board runs the newer whack_grid.py that accepts whole frames ("F").
        self.fast = False

    # ---- connection ----------------------------------------------------
    @staticmethod
    def _find_port() -> str | None:
        from serial.tools import list_ports

        for p in list_ports.comports():
            if p.vid == PICO_VID:
                return p.device
        return None

    def _connect(self) -> None:
        import serial

        port = self._find_port()
        if port is None:
            raise UnicornError("Unicorn display not plugged in.")
        try:
            ser = serial.Serial(port, BAUD, timeout=1, write_timeout=1)
        except serial.SerialException as e:
            raise UnicornError(f"Couldn't open {port}. Is another program (Thonny, mpremote) using it?") from e

        ser.write(b"\r\x03\x03")  # stop whatever is running, back to the REPL
        time.sleep(0.3)
        ser.reset_input_buffer()
        ser.write(b"import whack_grid; whack_grid.run()\r")
        deadline = time.monotonic() + 3
        buf = b""
        while time.monotonic() < deadline and b"WHACK_GRID_READY" not in buf:
            buf += ser.read(ser.in_waiting or 1)
        # The newer script prints "WHACK_GRID_READY 2"; give the rest of the line a moment.
        end = time.monotonic() + 0.3
        while b"WHACK_GRID_READY" in buf and b"\n" not in buf.split(b"WHACK_GRID_READY", 1)[1] and time.monotonic() < end:
            buf += ser.read(ser.in_waiting or 1)
        if b"WHACK_GRID_READY" not in buf:
            ser.close()
            if b"ImportError" in buf or b"no module named" in buf:
                raise UnicornError("whack_grid.py isn't on the Pico. Copy it over with mpremote (see its docstring).")
            raise UnicornError("The Unicorn didn't respond.")

        self._serial, self.port = ser, port
        self.fast = b"WHACK_GRID_READY 2" in buf
        for y, row in enumerate(self.pixels):
            for x, c in enumerate(row):
                if c:
                    self._send(f"P {x} {y} {c[0]} {c[1]} {c[2]}")

    def _send(self, line: str) -> None:
        assert self._serial is not None
        self._serial.write(line.encode() + b"\n")

    def _command(self, line: str) -> None:
        """Send a line, reconnecting once if the board was unplugged or reset."""
        with self._lock:
            for attempt in range(2):
                try:
                    if self._serial is None:
                        self._connect()
                    self._send(line)
                    return
                except UnicornError:
                    raise
                except Exception:
                    self._close()
                    if attempt:
                        raise UnicornError("Lost the Unicorn display. Check the USB cable.") from None

    def _close(self) -> None:
        if self._serial is not None:
            try:
                self._serial.close()
            except Exception:
                pass
        self._serial, self.port = None, None

    # ---- public ----------------------------------------------------------
    def status(self) -> dict[str, object]:
        return {"connected": self._serial is not None or self._find_port() is not None, "port": self.port or self._find_port()}

    def set_pixel(self, x: int, y: int, color: Color | None) -> None:
        self.pixels[y][x] = color
        r, g, b = color or (0, 0, 0)
        self._command(f"P {x} {y} {r} {g} {b}")

    def show_frame(self, frame: list[Color]) -> None:
        """Show a whole 16x16 frame (row-major). Whole-frame command on new boards,
        changed pixels only on boards with the old whack_grid.py."""
        with self._lock:
            for attempt in range(2):
                try:
                    if self._serial is None:
                        self._connect()
                    if self.fast:
                        self._send("F " + "".join(f"{r:02x}{g:02x}{b:02x}" for r, g, b in frame))
                    for i, c in enumerate(frame):
                        y, x = divmod(i, SIZE)
                        if self.pixels[y][x] != c:
                            if not self.fast:
                                self._send(f"P {x} {y} {c[0]} {c[1]} {c[2]}")
                            self.pixels[y][x] = c
                    return
                except UnicornError:
                    raise
                except Exception:
                    self._close()
                    if attempt:
                        raise UnicornError("Lost the Unicorn display. Check the USB cable.") from None

    def clear(self) -> None:
        self.pixels = [[None] * SIZE for _ in range(SIZE)]
        self._command("C")


unicorn = Unicorn()
