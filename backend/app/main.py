from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.controllers import (
    admin_controller,
    auth_controller,
    children_controller,
    chores_controller,
    ai_controller,
    clock_controller,
    health_controller,
    help_controller,
    led_controller,
    negotiation_controller,
    nfc_controller,
    plans_controller,
    shop_controller,
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
    chores_controller,
    ai_controller,
    clock_controller,
    help_controller,
    led_controller,
    plans_controller,
    negotiation_controller,
    nfc_controller,
    shop_controller,
    vault_controller,
):
    api.include_router(controller.router)

app.include_router(api)
