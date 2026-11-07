"""Feature 2: a 16x16 grid mirrored onto the Stellar Unicorn LED display."""

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from app.core.unicorn import SIZE, UnicornError, unicorn

router = APIRouter(prefix="/feature-2", tags=["feature-2"])


class PixelIn(BaseModel):
    x: int = Field(ge=0, lt=SIZE)
    y: int = Field(ge=0, lt=SIZE)
    color: str | None = Field(default=None, pattern=r"^#[0-9a-fA-F]{6}$")  # null = off


def _hex(c: tuple[int, int, int] | None) -> str | None:
    return None if c is None else "#{:02x}{:02x}{:02x}".format(*c)


def _grid() -> dict[str, object]:
    return {
        **unicorn.status(),
        "size": SIZE,
        "pixels": [[_hex(c) for c in row] for row in unicorn.pixels],
    }


@router.get("")
def get_feature_2() -> dict[str, object]:
    return {"feature": "feature-2", "status": "unicorn " + ("connected" if unicorn.status()["connected"] else "not found")}


@router.get("/grid")
def get_grid() -> dict[str, object]:
    return _grid()


@router.post("/grid/pixel")
def set_pixel(body: PixelIn) -> dict[str, object]:
    color = None if body.color is None else tuple(int(body.color[i : i + 2], 16) for i in (1, 3, 5))
    try:
        unicorn.set_pixel(body.x, body.y, color)  # type: ignore[arg-type]
    except UnicornError as e:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(e)) from e
    return _grid()


@router.post("/grid/clear")
def clear_grid() -> dict[str, object]:
    try:
        unicorn.clear()
    except UnicornError as e:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(e)) from e
    return _grid()
