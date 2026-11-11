"""Entry point backend NigmaSim."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

from app.api.v1 import api_router
from app.core.config import settings
from app.core.errors import register_exception_handlers
from app.db.session import SessionLocal
from app.services.seed import seed

logging.basicConfig(
    level=logging.DEBUG if settings.app_debug else logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger("nigmasim")


@asynccontextmanager
async def lifespan(_: FastAPI):
    if settings.is_development:
        if not settings.is_secret_configured:
            logger.warning(
                "SECRET_KEY masih default. Aman untuk development, "
                "TIDAK BOLEH dipakai di production."
            )
        with SessionLocal() as db:
            seed(db)
    yield


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):  # type: ignore[no-untyped-def]
        response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "no-referrer")
        response.headers.setdefault(
            "Permissions-Policy", "geolocation=(), microphone=(), camera=()"
        )
        return response


app = FastAPI(
    title="NigmaSim API",
    version="0.1.0",
    description=(
        "API platform simulasi aplikasi. Tidak ada endpoint yang menyimpan atau "
        "mengembalikan kredensial aplikasi sumber."
    ),
    docs_url="/docs" if settings.is_development else None,
    redoc_url=None,
    lifespan=lifespan,
)

app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

register_exception_handlers(app)
app.include_router(api_router, prefix=settings.api_prefix)
