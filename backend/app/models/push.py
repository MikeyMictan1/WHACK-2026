"""Phone notifications (Web Push): who subscribed, the server's VAPID keys, and sending.

A browser that allows notifications gives us a subscription (an endpoint URL at Google/Apple/
Mozilla plus two keys). To notify someone we encrypt a small JSON payload for each of their
subscriptions and post it to the endpoint; the service worker (frontend/public/sw.js) shows it.

The VAPID key pair identifies this server to the push services. It's generated on first use and
kept in the database, so a deploy needs no extra settings (and existing subscriptions keep working
as long as the database does).
"""

import base64
import json
import logging
import threading
from datetime import UTC, datetime

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec
from sqlmodel import Field, Session, SQLModel, select

log = logging.getLogger(__name__)


# ---- Tables ----------------------------------------------------------------


class PushSubscription(SQLModel, table=True):
    __tablename__ = "push_subscription"  # type: ignore[assignment]

    endpoint: str = Field(primary_key=True, max_length=1000)
    user_id: int = Field(foreign_key="user.id", index=True)
    p256dh: str = Field(max_length=200)
    auth: str = Field(max_length=100)
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class PushKeys(SQLModel, table=True):
    __tablename__ = "push_keys"  # type: ignore[assignment]

    id: int = Field(default=1, primary_key=True)
    private_pem: str
    public_key: str  # base64url, uncompressed P-256 point: what browsers want as applicationServerKey


# ---- Schemas ---------------------------------------------------------------


class SubscriptionKeys(SQLModel):
    p256dh: str = Field(max_length=200)
    auth: str = Field(max_length=100)


class SubscriptionIn(SQLModel):
    """What the browser's PushSubscription.toJSON() gives."""

    endpoint: str = Field(max_length=1000)
    keys: SubscriptionKeys


class UnsubscribeIn(SQLModel):
    endpoint: str = Field(max_length=1000)


# ---- Data access -----------------------------------------------------------


def get_keys(session: Session) -> PushKeys:
    keys = session.get(PushKeys, 1)
    if keys is None:
        private = ec.generate_private_key(ec.SECP256R1())
        pem = private.private_bytes(
            serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()
        ).decode()
        raw = private.public_key().public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)
        keys = PushKeys(private_pem=pem, public_key=base64.urlsafe_b64encode(raw).rstrip(b"=").decode())
        session.add(keys)
        session.commit()
        session.refresh(keys)
    return keys


def save_subscription(session: Session, user_id: int, sub: SubscriptionIn) -> None:
    row = session.get(PushSubscription, sub.endpoint)
    if row is None:
        row = PushSubscription(endpoint=sub.endpoint, user_id=user_id, p256dh=sub.keys.p256dh, auth=sub.keys.auth)
    else:  # same browser, maybe a different account now
        row.user_id, row.p256dh, row.auth = user_id, sub.keys.p256dh, sub.keys.auth
    session.add(row)
    session.commit()


def delete_subscription(session: Session, endpoint: str) -> None:
    if row := session.get(PushSubscription, endpoint):
        session.delete(row)
        session.commit()


def has_subscription(session: Session, user_id: int) -> bool:
    return session.exec(select(PushSubscription).where(PushSubscription.user_id == user_id)).first() is not None


# ---- Sending ---------------------------------------------------------------


def _send_now(user_id: int, payload: str, subject: str) -> None:
    from py_vapid import Vapid01
    from pywebpush import WebPushException, webpush

    from app.core.database import engine

    with Session(engine) as session:
        vapid = Vapid01.from_pem(get_keys(session).private_pem.encode())
        subs = list(session.exec(select(PushSubscription).where(PushSubscription.user_id == user_id)))
        for sub in subs:
            try:
                webpush(
                    subscription_info={"endpoint": sub.endpoint, "keys": {"p256dh": sub.p256dh, "auth": sub.auth}},
                    data=payload,
                    vapid_private_key=vapid,
                    vapid_claims={"sub": subject},
                    ttl=3600,
                    timeout=10,
                )
            except WebPushException as e:
                code = e.response.status_code if e.response is not None else None
                if code in (404, 410):  # the browser unsubscribed or the subscription expired
                    session.delete(sub)
                    session.commit()
                else:
                    log.warning("push to user %s failed: %s", user_id, e)
            except Exception as e:  # network trouble: a missed notification, never a failed request
                log.warning("push to user %s failed: %s", user_id, e)


def notify(user_id: int | None, title: str, body: str, url: str = "/dashboard") -> None:
    """Send a notification to every device this user turned notifications on for.
    Runs in the background and never raises, so callers can fire and forget."""
    if user_id is None:
        return
    from app.core.config import settings

    payload = json.dumps({"title": title, "body": body, "url": url})
    threading.Thread(target=_send_now, args=(user_id, payload, settings.push_subject), daemon=True).start()
