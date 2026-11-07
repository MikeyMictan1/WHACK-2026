from typing import Annotated

from fastapi import Depends, HTTPException, Request, status

from app.core.config import settings
from app.core.database import SessionDep
from app.core.security import decode_access_token
from app.models.user import User, get_user_by_id


def get_current_user(request: Request, session: SessionDep) -> User:
    unauthorized = HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated")

    token = request.cookies.get(settings.cookie_name)
    if not token:
        raise unauthorized

    subject = decode_access_token(token)
    if subject is None or not subject.isdigit():
        raise unauthorized

    user = get_user_by_id(session, int(subject))
    if user is None:
        raise unauthorized
    return user


def get_current_user_or_none(request: Request, session: SessionDep) -> User | None:
    try:
        return get_current_user(request, session)
    except HTTPException:
        return None


CurrentUser = Annotated[User, Depends(get_current_user)]


def get_current_parent(user: CurrentUser) -> User:
    if user.role != "parent":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only parent accounts can do this")
    return user


CurrentParent = Annotated[User, Depends(get_current_parent)]
