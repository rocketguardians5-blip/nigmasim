"""Agregator router API v1."""

from fastapi import APIRouter

from app.api.v1 import (
    applications,
    auth,
    capture,
    health,
    projects,
    reconstruction,
    simulation,
    users,
    workflow,
)

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(auth.router)
api_router.include_router(users.router)
api_router.include_router(applications.router)
api_router.include_router(projects.router)
api_router.include_router(capture.router)
api_router.include_router(reconstruction.router)
api_router.include_router(simulation.router)
api_router.include_router(workflow.router)
