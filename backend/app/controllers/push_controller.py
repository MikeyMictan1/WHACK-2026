"""Phone notifications: the browser subscribes here; see models/push.py for sending."""

from fastapi import APIRouter, status

from app.controllers.deps import CurrentUser
from app.core.database import SessionDep
from app.models.push import SubscriptionIn, UnsubscribeIn, delete_subscription, get_keys, has_subscription, notify, save_subscription

router = APIRouter(prefix="/push", tags=["push"])


@router.get("/key")
def public_key(session: SessionDep) -> dict[str, str]:
    """The server's public VAPID key, passed to pushManager.subscribe()."""
    return {"key": get_keys(session).public_key}


@router.get("/status")
def push_status(user: CurrentUser, session: SessionDep) -> dict[str, bool]:
    assert user.id is not None
    return {"subscribed": has_subscription(session, user.id)}


@router.post("/subscribe", status_code=status.HTTP_204_NO_CONTENT)
def subscribe(data: SubscriptionIn, user: CurrentUser, session: SessionDep) -> None:
    assert user.id is not None
    save_subscription(session, user.id, data)


@router.post("/unsubscribe", status_code=status.HTTP_204_NO_CONTENT)
def unsubscribe(data: UnsubscribeIn, _: CurrentUser, session: SessionDep) -> None:
    delete_subscription(session, data.endpoint)


@router.post("/test", status_code=status.HTTP_204_NO_CONTENT)
def test(user: CurrentUser) -> None:
    notify(user.id, "Notifications are on", "This is what Teenacredit alerts look like.", "/dashboard")
