"""The numbers behind a parent's view of one child: what they spent, what they earned, what credit cost them
and their recent transactions. Plain queries; nothing here writes."""

from dataclasses import dataclass
from datetime import datetime

from sqlmodel import Session, col, func, select

from app.models.credit import CreditEntry, aware
from app.models.shop import LedgerEntry, PurchaseRequest

SPEND_LABELS = {
    "in_game": "In-game items",
    "weekly": "Weekly treats",
    "milestone": "Milestones",
    "led_skin": "LED skins",
}
EARN_LABELS = {
    "allowance": "Weekly allowance",
    "chore": "Chores and jobs",
    "bonus": "Bonuses from you",
    "cash_back": "Card cash back",
}
TRANSACTION_LIMIT = 25


@dataclass
class Row:
    key: str
    label: str
    count: int
    total: int


@dataclass
class Transaction:
    id: int  # negative for entries on the card, so ids never clash with the child's own ledger
    amount: int  # negative = money out (or owed on the card)
    kind: str
    description: str
    created_at: datetime


def spending_breakdown(session: Session, child_id: int) -> list[Row]:
    """Everything the child has bought, by kind of item, biggest first. Counts both card and own-money purchases."""
    rows = session.exec(
        select(PurchaseRequest.kind, func.count(), func.sum(PurchaseRequest.price))
        .where(PurchaseRequest.child_id == child_id, PurchaseRequest.status == "paid")
        .group_by(PurchaseRequest.kind)
    ).all()
    out = [Row(kind, SPEND_LABELS.get(kind, kind), int(count), int(total or 0)) for kind, count, total in rows]
    # Milestones redeemed on the Milestones page are spent straight from the balance, not through the shop.
    count, total = session.exec(
        select(func.count(), func.sum(LedgerEntry.amount)).where(LedgerEntry.child_id == child_id, LedgerEntry.kind == "milestone")
    ).one()
    if count:
        row = next((r for r in out if r.key == "milestone"), None)
        if row is None:
            out.append(Row("milestone", SPEND_LABELS["milestone"], int(count), -int(total or 0)))
        else:
            row.count += int(count)
            row.total += -int(total or 0)
    return sorted(out, key=lambda r: -r.total)


def earned_breakdown(session: Session, child_id: int) -> list[Row]:
    """Money that came into the child's own balance, by source, biggest first."""
    rows = session.exec(
        select(LedgerEntry.kind, func.count(), func.sum(LedgerEntry.amount))
        .where(LedgerEntry.child_id == child_id, LedgerEntry.amount > 0)
        .group_by(LedgerEntry.kind)
    ).all()
    out = [Row(kind, EARN_LABELS.get(kind, kind), int(count), int(total or 0)) for kind, count, total in rows]
    return sorted(out, key=lambda r: -r.total)


def credit_costs(session: Session, child_id: int) -> tuple[int, int]:
    """(interest charged so far, late fees charged so far): what borrowing has cost them."""

    def total(kind: str) -> int:
        value = session.exec(
            select(func.sum(CreditEntry.amount)).where(CreditEntry.child_id == child_id, CreditEntry.kind == kind)
        ).one()
        return int(value or 0)

    return total("interest"), total("late_fee")


def recent_transactions(session: Session, child_id: int, limit: int = TRANSACTION_LIMIT) -> list[Transaction]:
    """The child's own-money ledger and what was charged on their card, newest first."""
    ledger = session.exec(
        select(LedgerEntry).where(LedgerEntry.child_id == child_id).order_by(col(LedgerEntry.created_at).desc()).limit(limit)
    ).all()
    card = session.exec(
        select(CreditEntry)
        .where(CreditEntry.child_id == child_id, col(CreditEntry.kind).in_(["purchase", "interest", "late_fee"]))
        .order_by(col(CreditEntry.created_at).desc())
        .limit(limit)
    ).all()
    labels = {"purchase": "card purchase", "interest": "card interest", "late_fee": "card late fee"}
    merged = [Transaction(e.id or 0, e.amount, e.kind, e.description, e.created_at) for e in ledger] + [
        Transaction(-(c.id or 0), -c.amount, labels[c.kind], c.description, c.created_at) for c in card
    ]
    merged.sort(key=lambda t: aware(t.created_at), reverse=True)
    return merged[:limit]
