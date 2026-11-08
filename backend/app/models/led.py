"""LED skins in the shop, who owns which, and what each user has equipped.

Paid skins are ordinary shop rewards (kind "led_skin") linked to a skin key by RewardSkin,
so they go through the normal purchase flow (parent approval + card tap). Free skins are
owned by everyone. Parents can equip any skin (it's their device).
"""

import threading
from datetime import datetime

from sqlmodel import Field, Session, SQLModel, col, select

from app.models.clock import site_now
from app.core.led_skins import SKINS
from app.models.shop import PurchaseRequest, Reward, mark_presets
from app.models.user import User


class RewardSkin(SQLModel, table=True):
    reward_id: int = Field(primary_key=True, foreign_key="reward.id")
    skin: str = Field(index=True)


class LedEquip(SQLModel, table=True):
    """The skin a user last equipped. The board shows the most recent one."""

    user_id: int = Field(primary_key=True, foreign_key="user.id")
    skin: str
    updated_at: datetime = Field(default_factory=lambda: site_now())


# The shop page asks for its items and the LED previews at the same moment, and both run this. Without the
# lock, a new family got every skin (and example item) twice. One app process (see railway.json), so a
# process lock is enough.
_sync_lock = threading.Lock()


def ensure_skin_rewards(session: Session, parent_id: int) -> None:
    """Give a family's shop one item per paid skin, once. Removed ones stay removed. Also flags old preset rows
    and tidies the example items (mark_presets). Hides duplicate copies of a skin made by the old race."""
    with _sync_lock:
        _ensure_skin_rewards(session, parent_id)


def _hide_duplicate_skins(session: Session, parent_id: int) -> bool:
    """Keep one active shop item per skin: the one a child bought if any, else the oldest. Caller commits."""
    rows = session.exec(
        select(Reward, RewardSkin.skin)
        .join(RewardSkin, col(RewardSkin.reward_id) == col(Reward.id))
        .where(Reward.parent_id == parent_id, col(Reward.active).is_(True))
        .order_by(col(Reward.id))
    ).all()
    bought = set(
        session.exec(
            select(PurchaseRequest.reward_id).where(
                col(PurchaseRequest.reward_id).in_([r.id for r, _ in rows]), PurchaseRequest.status == "paid"
            )
        ).all()
    )
    keep: dict[str, Reward] = {}
    changed = False
    for reward, skin in rows:
        other = keep.get(skin)
        if other is None:
            keep[skin] = reward
            continue
        loser = other if (reward.id in bought and other.id not in bought) else reward
        if loser is other:
            keep[skin] = reward
        loser.active = False
        session.add(loser)
        changed = True
    return changed


def _ensure_skin_rewards(session: Session, parent_id: int) -> None:
    flagged = mark_presets(session, parent_id)
    flagged = _hide_duplicate_skins(session, parent_id) or flagged
    have = set(
        session.exec(
            select(RewardSkin.skin)
            .join(Reward, col(Reward.id) == col(RewardSkin.reward_id))
            .where(Reward.parent_id == parent_id)
        ).all()
    )
    added = False
    for skin in SKINS.values():
        if skin.price == 0 or skin.key in have:
            continue
        reward = Reward(
            parent_id=parent_id, title=skin.name, description=skin.description, price=skin.price, kind="led_skin", preset=True
        )
        session.add(reward)
        session.flush()
        assert reward.id is not None
        session.add(RewardSkin(reward_id=reward.id, skin=skin.key))
        added = True
    if added or flagged:
        session.commit()


def skin_for_reward(session: Session, reward_id: int) -> str | None:
    link = session.get(RewardSkin, reward_id)
    return link.skin if link else None


def owned_skins(session: Session, user: User) -> set[str]:
    if user.role == "parent":
        return set(SKINS)
    bought = session.exec(
        select(RewardSkin.skin)
        .join(PurchaseRequest, col(PurchaseRequest.reward_id) == col(RewardSkin.reward_id))
        .where(PurchaseRequest.child_id == user.id, PurchaseRequest.status == "paid")
    ).all()
    return {k for k, s in SKINS.items() if s.price == 0} | set(bought)


def latest_equip(session: Session) -> LedEquip | None:
    return session.exec(select(LedEquip).order_by(col(LedEquip.updated_at).desc())).first()


def set_equip(session: Session, user_id: int, skin: str) -> None:
    row = session.get(LedEquip, user_id) or LedEquip(user_id=user_id, skin=skin)
    row.skin = skin
    row.updated_at = site_now()
    session.add(row)
    session.commit()
