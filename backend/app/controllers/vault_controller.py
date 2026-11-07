from typing import Any

from fastapi import APIRouter, HTTPException, status

from app.controllers.deps import CurrentUser
from app.core.database import SessionDep
from app.core.nfc_card import NfcError
from app.models import vault

router = APIRouter(prefix="/vault", tags=["vault"])


@router.get("")
def get_vault(user: CurrentUser, session: SessionDep) -> dict[str, Any]:
    """The user's data and where it lives ("system" or "card")."""
    assert user.id is not None
    location, data = vault.get_vault(session, user.id)
    session.commit()
    return {"location": location, "data": data}


@router.put("")
def put_vault(user: CurrentUser, session: SessionDep, data: dict[str, Any]) -> dict[str, Any]:
    """Replace the user's data (stored on our system)."""
    assert user.id is not None
    try:
        vault.set_vault(session, user.id, data)
    except NfcError as e:
        raise HTTPException(status.HTTP_409_CONFLICT, str(e)) from e
    return {"location": "system", "data": data}
