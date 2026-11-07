from fastapi import APIRouter, HTTPException, Response, status

from app.controllers.deps import CurrentUser
from app.core.config import settings
from app.core.database import SessionDep
from app.core.security import create_access_token, hash_password, verify_password
from app.models.user import User, UserCreate, UserLogin, UserPublic, create_user, get_user_by_username

router = APIRouter(prefix="/auth", tags=["auth"])


def _set_auth_cookie(response: Response, user: User) -> None:
    response.set_cookie(
        key=settings.cookie_name,
        value=create_access_token(str(user.id)),
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        max_age=settings.access_token_expire_minutes * 60,
        path="/",
    )


@router.post("/register", response_model=UserPublic, status_code=status.HTTP_201_CREATED)
def register(data: UserCreate, session: SessionDep, response: Response) -> User:
    if get_user_by_username(session, data.username):
        raise HTTPException(status.HTTP_409_CONFLICT, "That username is taken")

    user = create_user(
        session,
        username=data.username,
        hashed_password=hash_password(data.password),
        role="parent",
        display_name=(data.display_name or "").strip() or None,
    )
    _set_auth_cookie(response, user)
    return user


@router.post("/login", response_model=UserPublic)
def login(data: UserLogin, session: SessionDep, response: Response) -> User:
    user = get_user_by_username(session, data.username)
    if user is None or not verify_password(data.password, user.hashed_password):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Incorrect username or password")

    _set_auth_cookie(response, user)
    return user


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(response: Response) -> None:
    # Normal logout: the user's data stays on our system.
    response.delete_cookie(settings.cookie_name, path="/")


@router.get("/me", response_model=UserPublic)
def me(user: CurrentUser) -> User:
    return user
