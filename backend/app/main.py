from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.controllers import (
    auth_controller,
    children_controller,
    feature1_controller,
    feature2_controller,
    ai_controller,
    health_controller,
    help_controller,
    negotiation_controller,
    nfc_controller,
    plans_controller,
    vault_controller,
)
from app.core.config import settings
from app.core.database import init_db


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    init_db()
    nfc_controller.hub.start()
    yield
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
    children_controller,
    feature1_controller,
    feature2_controller,
    ai_controller,
    help_controller,
    plans_controller,
    negotiation_controller,
    nfc_controller,
    vault_controller,
):
    api.include_router(controller.router)

app.include_router(api)
