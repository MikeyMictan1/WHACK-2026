from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import APIRouter, FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from app.controllers import (
    admin_controller,
    auth_controller,
    breakdown_controller,
    children_controller,
    chores_controller,
    credit_controller,
    ai_controller,
    clock_controller,
    decor_controller,
    health_controller,
    help_controller,
    led_controller,
    negotiation_controller,
    nfc_controller,
    plans_controller,
    push_controller,
    shop_controller,
    story_controller,
    vault_controller,
)
from app.core.config import settings
from app.core.database import init_db


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    init_db()
    nfc_controller.hub.start()
    led_controller.display.start()
    yield
    led_controller.display.stop()
    nfc_controller.hub.stop()


app = FastAPI(title=settings.app_name, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

api = APIRouter(prefix="/api")
for controller in (
    health_controller,
    auth_controller,
    admin_controller,
    children_controller,
    breakdown_controller,
    chores_controller,
    credit_controller,
    ai_controller,
    clock_controller,
    decor_controller,
    help_controller,
    led_controller,
    plans_controller,
    negotiation_controller,
    nfc_controller,
    push_controller,
    shop_controller,
    story_controller,
    vault_controller,
):
    api.include_router(controller.router)

app.include_router(api)


# ---- built frontend (deployment) ---------------------------------------------
# In production one server serves both the API and the React build, so the browser sees a single
# origin and the auth cookie needs no cross-site setup. Locally Vite serves the frontend instead;
# this only kicks in when FRONTEND_DIST points at a build that exists.
_dist = Path(settings.frontend_dist).resolve() if settings.frontend_dist else None
if _dist is not None and (_dist / "index.html").is_file():

    @app.get("/{path:path}", include_in_schema=False)
    def frontend(path: str) -> FileResponse:
        if path == "api" or path.startswith("api/"):
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Not found")
        file = (_dist / path).resolve()
        if path and file.is_file() and file.is_relative_to(_dist):
            return FileResponse(file)
        return FileResponse(_dist / "index.html")  # React Router handles every other path
