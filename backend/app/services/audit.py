"""Audit log — append only. Tidak ada endpoint untuk menghapus."""

from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from app.models.capture import AuditLog


def record(
    db: Session,
    *,
    actor_id: int | None,
    action: str,
    entity_type: str,
    entity_id: int | None = None,
    meta: dict[str, Any] | None = None,
    ip_address: str | None = None,
) -> AuditLog:
    log = AuditLog(
        actor_id=actor_id,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        meta=meta,
        ip_address=ip_address,
    )
    db.add(log)
    return log
