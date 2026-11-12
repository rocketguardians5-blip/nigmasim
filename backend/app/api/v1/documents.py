"""Endpoint Fase 6 - Documentation Generator (SOP / user guide)."""

from __future__ import annotations

import base64
from typing import Any

from fastapi import APIRouter, Depends, Request
from fastapi.responses import HTMLResponse, PlainTextResponse, Response
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import require_permission
from app.core.errors import ConflictError, NotFoundError
from app.db.session import get_db
from app.models.document import Document
from app.models.registry import Project
from app.models.simulation import Simulation, SimulationTutorial
from app.models.user import User
from app.services import audit, documents as document_service

router = APIRouter(prefix="/documents", tags=["documents"])


class GenerateRequest(BaseModel):
    project_id: int
    title: str = Field(min_length=1, max_length=200)
    doc_type: str = Field(default="sop", pattern="^(sop|user_guide|module|role|workflow)$")
    simulation_id: int | None = None
    tutorial_id: int | None = None


class ContentUpdate(BaseModel):
    content: dict[str, Any]
    title: str | None = Field(default=None, min_length=1, max_length=200)


class PublishRequest(BaseModel):
    status: str = Field(default="published", pattern="^(draft|published)$")
    version: str | None = Field(default=None, max_length=20)


def _ip(request: Request) -> str | None:
    return request.client.host if request.client else None


@router.get("/project/{project_id}")
def list_documents(
    project_id: int,
    _: User = Depends(require_permission("documents:read")),
    db: Session = Depends(get_db),
) -> list[dict[str, Any]]:
    documents = db.scalars(
        select(Document)
        .where(Document.project_id == project_id)
        .order_by(Document.updated_at.desc())
    ).all()
    return [
        {
            "id": item.id,
            "title": item.title,
            "doc_type": item.doc_type,
            "status": item.status,
            "version": item.version,
            "step_count": len((item.content or {}).get("steps", [])),
            "updated_at": item.updated_at.isoformat(),
        }
        for item in documents
    ]


@router.post("/generate", status_code=201)
def generate_document(
    payload: GenerateRequest,
    request: Request,
    actor: User = Depends(require_permission("documents:write")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    project = db.get(Project, payload.project_id)
    if project is None:
        raise NotFoundError("Project tidak ditemukan")

    simulation = (
        db.get(Simulation, payload.simulation_id) if payload.simulation_id else None
    )
    tutorial = (
        db.get(SimulationTutorial, payload.tutorial_id) if payload.tutorial_id else None
    )
    if payload.tutorial_id and tutorial is None:
        raise NotFoundError("Tutorial tidak ditemukan")

    document = document_service.generate_document(
        db,
        project,
        title=payload.title,
        doc_type=payload.doc_type,
        simulation=simulation,
        tutorial=tutorial,
        author=actor,
    )
    audit.record(
        db,
        actor_id=actor.id,
        action="document.generate",
        entity_type="document",
        entity_id=document.id,
        meta={"doc_type": payload.doc_type, "steps": len(document.content.get("steps", []))},
        ip_address=_ip(request),
    )
    db.commit()
    db.refresh(document)
    return _document_payload(document)


def _document_payload(document: Document) -> dict[str, Any]:
    return {
        "id": document.id,
        "project_id": document.project_id,
        "simulation_id": document.simulation_id,
        "title": document.title,
        "doc_type": document.doc_type,
        "description": document.description,
        "content": document.content,
        "markdown": document.markdown,
        "html": document.html,
        "status": document.status,
        "version": document.version,
        "created_at": document.created_at.isoformat(),
        "updated_at": document.updated_at.isoformat(),
    }


@router.get("/{document_id}")
def get_document(
    document_id: int,
    _: User = Depends(require_permission("documents:read")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    document = db.get(Document, document_id)
    if document is None:
        raise NotFoundError("Dokumen tidak ditemukan")
    return _document_payload(document)


@router.patch("/{document_id}")
def update_document(
    document_id: int,
    payload: ContentUpdate,
    request: Request,
    actor: User = Depends(require_permission("documents:write")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    document = db.get(Document, document_id)
    if document is None:
        raise NotFoundError("Dokumen tidak ditemukan")

    document.content = payload.content
    if payload.title:
        document.title = payload.title
    document_service.refresh_render(document)
    document.status = "draft"

    audit.record(
        db,
        actor_id=actor.id,
        action="document.update",
        entity_type="document",
        entity_id=document.id,
        ip_address=_ip(request),
    )
    db.commit()
    db.refresh(document)
    return _document_payload(document)


@router.post("/{document_id}/publish")
def publish_document(
    document_id: int,
    payload: PublishRequest,
    request: Request,
    actor: User = Depends(require_permission("documents:review")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    document = db.get(Document, document_id)
    if document is None:
        raise NotFoundError("Dokumen tidak ditemukan")

    if payload.status == "published" and not (document.content or {}).get("steps"):
        raise ConflictError(
            "Dokumen belum punya langkah. Buat tutorial dulu atau isi langkahnya manual."
        )

    document.status = payload.status
    if payload.version:
        document.version = payload.version
    audit.record(
        db,
        actor_id=actor.id,
        action="document.publish",
        entity_type="document",
        entity_id=document.id,
        meta={"status": payload.status},
        ip_address=_ip(request),
    )
    db.commit()
    db.refresh(document)
    return _document_payload(document)


@router.get("/{document_id}/download")
def download_document(
    document_id: int,
    format: str = "html",
    _: User = Depends(require_permission("documents:read")),
    db: Session = Depends(get_db),
) -> Response:
    """Unduh dokumen. PDF dirender oleh Chromium (Capture Worker)."""
    document = db.get(Document, document_id)
    if document is None:
        raise NotFoundError("Dokumen tidak ditemukan")

    if format == "md":
        return PlainTextResponse(
            document.markdown or "",
            media_type="text/markdown; charset=utf-8",
            headers={
                "Content-Disposition": f'attachment; filename="dokumen-{document.id}.md"'
            },
        )
    if format == "pdf":
        from app.workers import capture_client

        try:
            pdf_base64 = capture_client.render_pdf(document.html or "", f"dokumen-{document.id}")
        except Exception as exc:  # noqa: BLE001
            raise ConflictError(
                "Gagal membuat PDF. Pastikan Capture Worker berjalan (port 8010). " + str(exc)
            ) from exc
        pdf_bytes = base64.b64decode(pdf_base64)
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={
                "Content-Disposition": f'attachment; filename="dokumen-{document.id}.pdf"'
            },
        )
    return HTMLResponse(
        document.html or "",
        headers={"Content-Disposition": f'inline; filename="dokumen-{document.id}.html"'},
    )
