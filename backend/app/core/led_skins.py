"""LED skins: things the 16x16 Unicorn can show (clock, weather, balance, animations...).

Each skin is a function render(t, ctx, state) -> frame, where a frame is 256 (r, g, b)
tuples in row-major order (index = y * 16 + x). The same frame is drawn on the web page
and sent to the board, so they always match.

Add a skin: write a render function and add it to SKINS. Price 0 = free for everyone;
paid skins show up in each family's shop as "LED skins".
"""

import math
import random
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

SIZE = 16
Color = tuple[int, int, int]
Frame = list[Color]

BLACK: Color = (0, 0, 0)
WHITE: Color = (235, 240, 245)
DIM: Color = (60, 70, 85)
LIME: Color = (212, 255, 58)  # the site's "signal" colour
YELLOW: Color = (255, 200, 40)
RED: Color = (255, 40, 60)
BLUE: Color = (40, 120, 255)
GREY: Color = (130, 140, 155)


@dataclass
class Ctx:
    """What a skin may show. Filled in for whoever equipped it."""

    now: datetime
    balance: int | None = None  # pence; None for parents
    goal_title: str | None = None
    goal_progress: float = 0.0  # 0..1 towards the next milestone
    weather: tuple[float, int] | None = None  # (temperature C, WMO weather code)


@dataclass
class Skin:
    key: str
    name: str
    description: str
    price: int  # pence, 0 = free
    fps: float
    render: Callable[[float, Ctx, dict[str, Any]], Frame] = field(repr=False)


# ---- drawing helpers --------------------------------------------------------

DIGITS = {
    "0": ("111", "101", "101", "101", "111"),
    "1": ("010", "110", "010", "010", "111"),
    "2": ("111", "001", "111", "100", "111"),
    "3": ("111", "001", "111", "001", "111"),
    "4": ("101", "101", "111", "001", "001"),
    "5": ("111", "100", "111", "001", "111"),
    "6": ("111", "100", "111", "101", "111"),
    "7": ("111", "001", "001", "001", "001"),
    "8": ("111", "101", "111", "101", "111"),
    "9": ("111", "101", "111", "001", "111"),
    "-": ("000", "000", "111", "000", "000"),
    " ": ("000", "000", "000", "000", "000"),
}


def blank() -> Frame:
    return [BLACK] * (SIZE * SIZE)


def put(f: Frame, x: int, y: int, c: Color) -> None:
    if 0 <= x < SIZE and 0 <= y < SIZE:
        f[y * SIZE + x] = c


def scale(c: Color, k: float) -> Color:
    k = max(0.0, min(1.0, k))
    return (int(c[0] * k), int(c[1] * k), int(c[2] * k))


def text(f: Frame, s: str, y: int, c: Color, x: int | None = None) -> None:
    """3x5 digits with 1px gaps, centred unless x is given."""
    width = len(s) * 4 - 1
    x0 = (SIZE - width) // 2 if x is None else x
    for i, ch in enumerate(s):
        for row, bits in enumerate(DIGITS.get(ch, DIGITS[" "])):
            for col, bit in enumerate(bits):
                if bit == "1":
                    put(f, x0 + i * 4 + col, y + row, c)


def hsv(h: float, s: float = 1.0, v: float = 1.0) -> Color:
    i = int(h * 6) % 6
    fpart = h * 6 - int(h * 6)
    p, q, t = v * (1 - s), v * (1 - fpart * s), v * (1 - (1 - fpart) * s)
    r, g, b = [(v, t, p), (q, v, p), (p, v, t), (p, q, v), (t, p, v), (v, p, q)][i]
    return (int(r * 255), int(g * 255), int(b * 255))


# ---- free skins -------------------------------------------------------------

def clock(t: float, ctx: Ctx, state: dict[str, Any]) -> Frame:
    f = blank()
    text(f, f"{ctx.now.hour:02d}", 2, WHITE)
    text(f, f"{ctx.now.minute:02d}", 9, LIME)
    # seconds run along the bottom row
    for x in range(int(ctx.now.second / 60 * SIZE) + 1):
        put(f, x, 15, DIM)
    return f


def balance(t: float, ctx: Ctx, state: dict[str, Any]) -> Frame:
    f = blank()
    if ctx.balance is None:
        text(f, "--", 5, DIM)
        return f
    pounds, pence = divmod(max(0, ctx.balance), 100)
    text(f, str(min(pounds, 999)), 2, LIME)
    text(f, f"{pence:02d}", 9, GREY)
    put(f, 3, 13, GREY)  # decimal point before the pence
    return f


def goal(t: float, ctx: Ctx, state: dict[str, Any]) -> Frame:
    """A jar filling up towards the next milestone (e.g. the PS5)."""
    f = blank()
    for y in range(1, 15):
        put(f, 3, y, DIM)
        put(f, 12, y, DIM)
    for x in range(3, 13):
        put(f, x, 14, DIM)
    rows = round(ctx.goal_progress * 13)
    for i in range(rows):
        y = 13 - i
        shimmer = 0.75 + 0.25 * math.sin(t * 3 + y)
        for x in range(4, 12):
            put(f, x, y, scale(LIME, shimmer))
    return f


def mascot(t: float, ctx: Ctx, state: dict[str, Any]) -> Frame:
    f = blank()
    bob = round(math.sin(t * 2))  # gentle bounce
    for y in range(SIZE):
        for x in range(SIZE):
            if (x - 7.5) ** 2 + (y - 8.5 - bob) ** 2 <= 42:
                put(f, x, y, LIME)
    blink = (t % 4) < 0.15
    for ex in (5, 10):
        put(f, ex, 6 + bob, BLACK)
        if not blink:
            put(f, ex, 7 + bob, BLACK)
    happy = ctx.balance is None or ctx.balance > 0
    mouth = [(5, 10), (6, 11), (7, 11), (8, 11), (9, 11), (10, 10)] if happy else [(5, 11), (6, 10), (7, 10), (8, 10), (9, 10), (10, 11)]
    for x, y in mouth:
        put(f, x, y + bob, BLACK)
    return f


# ---- paid skins -------------------------------------------------------------

def weather(t: float, ctx: Ctx, state: dict[str, Any]) -> Frame:
    f = blank()
    if ctx.weather is None:
        text(f, "--", 2, DIM)
        return f
    temp, code = ctx.weather
    s = str(round(temp))
    text(f, s, 1, WHITE)
    put(f, (SIZE + len(s) * 4 - 1) // 2 + 1, 1, WHITE)  # degree dot

    def cloud(c: Color) -> None:
        for x, y in [(5, 9), (6, 8), (7, 8), (8, 8), (9, 9), (10, 9), (4, 10), (11, 10)]:
            put(f, x, y, c)
        for x in range(4, 12):
            put(f, x, 10, c)
            put(f, x, 11, c)

    if code in (0, 1):  # clear
        for y in range(8, 16):
            for x in range(4, 12):
                if (x - 7.5) ** 2 + (y - 11.5) ** 2 <= 9:
                    put(f, x, y, YELLOW)
    elif code in (2, 3, 45, 48):  # cloudy / fog
        cloud(GREY)
    elif code >= 95:  # thunder
        cloud(GREY)
        if (t % 1.5) < 0.3:
            for x, y in [(8, 12), (7, 13), (8, 14), (7, 15)]:
                put(f, x, y, YELLOW)
    else:  # rain or snow
        cloud(GREY)
        snow = code in range(71, 78) or code in (85, 86)
        for i, x in enumerate((5, 7, 9, 11)):
            y = 12 + int(t * 4 + i * 1.7) % 4
            put(f, x, y, WHITE if snow else BLUE)
    return f


def date(t: float, ctx: Ctx, state: dict[str, Any]) -> Frame:
    f = blank()
    text(f, f"{ctx.now.day:02d}", 2, WHITE)
    text(f, f"{ctx.now.month:02d}", 8, GREY)
    for d in range(7):  # Mon..Sun along the bottom, today in lime
        put(f, 1 + d * 2, 15, LIME if d == ctx.now.weekday() else DIM)
    return f


def rainbow(t: float, ctx: Ctx, state: dict[str, Any]) -> Frame:
    return [hsv(((x + y) / 32 + t * 0.25) % 1) for y in range(SIZE) for x in range(SIZE)]


def fire(t: float, ctx: Ctx, state: dict[str, Any]) -> Frame:
    heat = state.setdefault("heat", [0.0] * (SIZE * (SIZE + 1)))
    for x in range(SIZE):  # fresh heat at the hidden bottom row
        heat[SIZE * SIZE + x] = random.uniform(0.6, 1.0)
    for y in range(SIZE):  # each cell cools and rises
        for x in range(SIZE):
            below = heat[(y + 1) * SIZE + x]
            left = heat[(y + 1) * SIZE + max(0, x - 1)]
            right = heat[(y + 1) * SIZE + min(SIZE - 1, x + 1)]
            heat[y * SIZE + x] = max(0.0, (below * 2 + left + right) / 4 - random.uniform(0.02, 0.07))
    out = []
    for i in range(SIZE * SIZE):
        h = heat[i]
        out.append((min(255, int(h * 400)), min(255, int(max(0.0, h - 0.35) * 380)), min(255, int(max(0.0, h - 0.8) * 600))))
    return out


def matrix(t: float, ctx: Ctx, state: dict[str, Any]) -> Frame:
    drops = state.setdefault("drops", [random.uniform(-16, 0) for _ in range(SIZE)])
    f = blank()
    for x in range(SIZE):
        drops[x] += random.uniform(0.3, 0.7)
        if drops[x] > SIZE + 6:
            drops[x] = random.uniform(-8, 0)
        head = int(drops[x])
        for k in range(6):
            put(f, x, head - k, (180, 255, 180) if k == 0 else scale((40, 220, 70), 1 - k / 6))
    return f


def starfield(t: float, ctx: Ctx, state: dict[str, Any]) -> Frame:
    f = blank()
    for y in range(SIZE):
        for x in range(SIZE):
            h = (x * 73856093 ^ y * 19349663) & 0xFFFF
            if h % 7 == 0:
                twinkle = (math.sin(t * (1 + h % 5) + h) + 1) / 2
                put(f, x, y, scale((200, 210, 255), 0.15 + 0.85 * twinkle))
    return f


HEART = (
    "0110001100",
    "1111011110",
    "1111111111",
    "1111111111",
    "0111111110",
    "0011111100",
    "0001111000",
    "0000110000",
)


def heartbeat(t: float, ctx: Ctx, state: dict[str, Any]) -> Frame:
    f = blank()
    phase = t % 1.2  # double beat: thump-thump, pause
    k = 0.35 + 0.65 * max(math.exp(-((phase - 0.1) ** 2) / 0.004), math.exp(-((phase - 0.35) ** 2) / 0.004))
    for row, bits in enumerate(HEART):
        for col, bit in enumerate(bits):
            if bit == "1":
                put(f, 3 + col, 4 + row, scale(RED, k))
    return f


SKINS: dict[str, Skin] = {
    s.key: s
    for s in [
        Skin("clock", "Clock", "The time, with the seconds running along the bottom", 0, 2, clock),
        Skin("balance", "Balance", "How much money you have right now", 0, 1, balance),
        Skin("goal", "Savings jar", "Fills up as you save for your next milestone", 0, 6, goal),
        Skin("mascot", "Mascot", "Your Whack buddy. Smiles when you have money", 0, 6, mascot),
        Skin("weather", "Weather", "Temperature and sky right now", 150, 4, weather),
        Skin("date", "Date", "Day and month, today lit up along the bottom", 50, 1, date),
        Skin("heartbeat", "Heartbeat", "A pulsing heart", 100, 12, heartbeat),
        Skin("starfield", "Starfield", "A sky full of twinkling stars", 200, 8, starfield),
        Skin("rainbow", "Rainbow wave", "Colours flowing across the screen", 200, 12, rainbow),
        Skin("fire", "Fireplace", "A crackling fire", 250, 12, fire),
        Skin("matrix", "Code rain", "Falling green code", 300, 12, matrix),
    ]
}
DEFAULT_SKIN = "clock"


def render(key: str, t: float, ctx: Ctx, state: dict[str, Any]) -> Frame:
    skin = SKINS.get(key) or SKINS[DEFAULT_SKIN]
    return skin.render(t, ctx, state)


def to_hex(frame: Frame) -> str:
    return "".join(f"{r:02x}{g:02x}{b:02x}" for r, g, b in frame)
