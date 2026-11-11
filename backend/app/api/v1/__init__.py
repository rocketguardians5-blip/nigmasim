"""Agregator router API v1."""

from fastapi import APIRouter

from app.api.v1 import applications, auth, health, projects, users

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(auth.router)
api_router.include_router(users.router)
api_router.include_router(applications.router)
api_router.include_router(projects.router)
