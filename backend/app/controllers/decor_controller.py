"""The child's home extras: decor placement and the spending chart.

  GET /api/decor           owned cosmetics and where each one is placed
  PUT /api/decor           save the layout (left and right panels)
  GET /api/decor/spending  what the child has bought so far, by kind (for the Home chart)
"""

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

from app.controllers.deps import CurrentChild
from app.core.database import SessionDep
from app.models.breakdown import spending_breakdown
from app.models.decor import SIDES, SLOTS_PER_SIDE, DecorItem, DecorLayoutItem, decor_items, save_layout

router = APIRouter(prefix="/decor", tags=["decor"])


class DecorOut(BaseModel):
    items: list[DecorItem]
    sides: list[str]
    slots_per_side: int


class LayoutIn(BaseModel):
    placements: list[DecorLayoutItem]


class SpendRow(BaseModel):
    key: str
    label: str
    count: int
    total: int


class SpendingOut(BaseModel):
    rows: list[SpendRow]
    total: int


def _out(session: SessionDep, child_id: int) -> DecorOut:
    return DecorOut(items=decor_items(session, child_id), sides=list(SIDES), slots_per_side=SLOTS_PER_SIDE)


@router.get("")
def get_decor(child: CurrentChild, session: SessionDep) -> DecorOut:
    assert child.id is not None
    return _out(session, child.id)


@router.put("")
def put_decor(body: LayoutIn, child: CurrentChild, session: SessionDep) -> DecorOut:
    assert child.id is not None
    error = save_layout(session, child.id, body.placements)
    if error:
        session.rollback()
        raise HTTPException(status.HTTP_400_BAD_REQUEST, error)
    session.commit()
    return _out(session, child.id)


@router.get("/spending")
def my_spending(child: CurrentChild, session: SessionDep) -> SpendingOut:
    assert child.id is not None
    rows = spending_breakdown(session, child.id)
    return SpendingOut(
        rows=[SpendRow(key=r.key, label=r.label, count=r.count, total=r.total) for r in rows],
        total=sum(r.total for r in rows),
    )
