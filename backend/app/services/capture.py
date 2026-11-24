"""Logika modul capture.

Yang disimpan hanya screenshot (PNG) dan metadata terstruktur.
Tidak ada HTML/JavaScript aplikasi sumber yang disimpan atau dieksekusi.
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.errors import ConflictError, NotFoundError
from app.db.session import now_utc
from app.models.capture import CaptureSession, Interaction, Screen, ScreenElement
from app.models.registry import Application, Project
from app.models.user import User


def allowed_hosts_for(application: Application) -> list[str]:
    """Host yang boleh dibuka worker: hanya aplikasi yang sudah diotorisasi."""
    hosts: list[str] = []
    for url in (application.source_url, application.login_url):
        if not url:
            continue
        host = (urlparse(url).hostname or "").lower()
        if host and host not in hosts:
            hosts.append(host)
    return hosts


def record_imported_capture(
    db: Session,
    session: CaptureSession,
    project: Project,
    payload: dict[str, Any],
) -> Screen:
    """Simpan hasil capture yang diambil worker lokal di perangkat operator.

    Alur: browser operator memanggil worker di perangkatnya sendiri, lalu
    mengunggah hasilnya ke backend. Dengan begitu jendela browser muncul di
    perangkat yang dipakai operator - bukan di mesin server.
    """
    import base64
    import hashlib

    raw = payload.get("png_base64") or ""
    if not raw:
        raise ConflictError("Data gambar tidak terkirim (png_base64 kosong).")

    try:
        png = base64.b64decode(raw, validate=False)
    except Exception as exc:  # noqa: BLE001
        raise ConflictError("Data gambar tidak valid.") from exc

    digest = hashlib.sha256(png).hexdigest()
    label = slugify(str(payload.get("title") or "screen")) or "screen"
    relative_dir = f"captures/project-{project.id}/session-{session.id}"
    target = settings.storage_path / relative_dir
    target.mkdir(parents=True, exist_ok=True)
    file_path = target / f"{label}-{digest[:8]}.png"
    file_path.write_bytes(png)

    meta = {
        "file_path": str(file_path),
        "url": payload.get("url"),
        "title": payload.get("page_title") or payload.get("title"),
        "full_page": bool(payload.get("full_page")),
        "elements": payload.get("elements") or [],
        "structure": payload.get("structure") or {},
        "interactions": payload.get("interactions") or [],
    }
    return record_capture(db, session, project, meta, title=payload.get("title"))


def create_session(
    db: Session,
    project: Project,
    operator: User,
    *,
    notes: str | None = None,
    viewport_width: int | None = None,
    viewport_height: int | None = None,
    device: str = "desktop",
) -> CaptureSession:
    application = db.get(Application, project.application_id)
    if application is None:
        raise NotFoundError("Aplikasi tidak ditemukan")
    if not application.is_authorized:
        raise ConflictError(
            "Aplikasi belum memiliki otorisasi capture (status harus approved)."
        )

    # Untuk tablet/phone, ukuran layar dipakai worker (preset perangkat).
    is_desktop = device == "desktop"

    session = CaptureSession(
        project_id=project.id,
        operator_id=operator.id,
        status="active",
        viewport_width=viewport_width or (settings.capture_default_viewport_width if is_desktop else 0),
        viewport_height=viewport_height or (settings.capture_default_viewport_height if is_desktop else 0),
        device=device,
        browser_mode="headed",
        started_at=now_utc(),
        notes=notes,
    )
    db.add(session)
    db.flush()
    return session


def slugify(value: str) -> str:
    slug = re.sub(r"[^a-zA-Z0-9-_]+", "-", value.strip().lower()).strip("-")
    return slug[:60] or "screen"


def _relative_path(absolute: str) -> str:
    """Simpan path RELATIF terhadap storage root (aman, portabel)."""
    root = settings.storage_path
    try:
        return str(Path(absolute).resolve().relative_to(root)).replace("\\", "/")
    except ValueError:
        # Di luar storage root: simpan basename saja, file tidak akan terbaca.
        return Path(absolute).name


def _redact_sensitive_text(text: str) -> str:
    """Redaksi email, nomor telepon, bearer token, API key, dan query string."""
    if not text or not isinstance(text, str):
        return text
    # Bearer token
    text = re.sub(
        r"(?i)\bBearer\s+[0-9A-Za-z._~+/=-]{8,}",
        "Bearer [DISEMASKAN]",
        text,
    )
    # JWT tokens
    text = re.sub(
        r"\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b",
        "[TOKEN DISEMASKAN]",
        text,
    )
    # API key (AIza, sk-)
    text = re.sub(r"\bAIza[0-9A-Za-z-_]{30,45}\b", "[API KEY DISEMASKAN]", text)
    text = re.sub(r"\bsk-[0-9A-Za-z_-]{16,}\b", "[API KEY DISEMASKAN]", text)
    # Email
    text = re.sub(
        r"\b[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+\b",
        "[EMAIL DISEMASKAN]",
        text,
    )
    # Nomor telepon panjang (minimal 8 digit berurutan/berpola)
    text = re.sub(
        r"\b(?:\+?\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,9}\b",
        "[TELEPON DISEMASKAN]",
        text,
    )
    return text


def _box_overlaps(b1: dict[str, Any], b2: dict[str, Any]) -> bool:
    try:
        x1, y1, w1, h1 = float(b1.get("x", 0)), float(b1.get("y", 0)), float(b1.get("w", 0)), float(b1.get("h", 0))
        x2, y2, w2, h2 = float(b2.get("x", 0)), float(b2.get("y", 0)), float(b2.get("w", 0)), float(b2.get("h", 0))
        return x1 < x2 + w2 and x1 + w1 > x2 and y1 < y2 + h2 and y1 + h1 > y2
    except Exception:
        return False


def _sanitize_visual_tree(
    visual: dict[str, Any], mask_boxes: list[dict[str, Any]] | None = None
) -> dict[str, Any]:
    if not isinstance(visual, dict):
        return visual
    nodes = visual.get("nodes")
    if not isinstance(nodes, list):
        return visual

    sanitized_nodes = []
    masks = [m for m in (mask_boxes or []) if isinstance(m, dict)]

    for raw_node in nodes:
        if not isinstance(raw_node, dict):
            continue
        node = dict(raw_node)
        box = node.get("box") or {}

        # Cek jika tumpang tindih dengan area mask yang ditandai operator
        is_masked = False
        if masks and isinstance(box, dict):
            for mask in masks:
                if _box_overlaps(box, mask):
                    is_masked = True
                    break

        if is_masked:
            node["text"] = None
            node["placeholder"] = None
            node["icon"] = None
        else:
            if node.get("text"):
                node["text"] = _redact_sensitive_text(str(node["text"]))
            if node.get("placeholder"):
                node["placeholder"] = _redact_sensitive_text(str(node["placeholder"]))
            if isinstance(node.get("icon"), dict) and "img" in node["icon"] and isinstance(node["icon"]["img"], dict):
                src = str(node["icon"]["img"].get("src") or "")
                if "?" in src:
                    node["icon"]["img"]["src"] = src.split("?")[0]

        sanitized_nodes.append(node)

    visual["nodes"] = sanitized_nodes
    return visual


def absolute_path(relative: str) -> Path:
    root = settings.storage_path
    candidate = (root / relative).resolve()
    if not str(candidate).startswith(str(root)):
        raise NotFoundError("File tidak ditemukan")
    return candidate


def record_capture(
    db: Session,
    session: CaptureSession,
    project: Project,
    meta: dict[str, Any],
    *,
    title: str | None = None,
) -> Screen:
    """Simpan hasil capture: screen + elemen + interaksi.

    Kalau halaman yang sama dicapture ulang, hasilnya menjadi **versi baru**
    (capture_version naik) dengan screen_key yang sama — bukan screen terpisah.
    Kalau judulnya sama tapi URL-nya berbeda, itu layar berbeda → key diberi akhiran.
    """
    relative = _relative_path(str(meta.get("file_path", "")))
    source_url = meta.get("url")
    page_title = title or str(meta.get("title") or "Layar tanpa judul")[:200]

    base_key = slugify(page_title)
    key = base_key
    version = 1

    existing = db.scalars(
        select(Screen).where(Screen.project_id == project.id, Screen.screen_key == base_key)
    ).all()
    same_url = [s for s in existing if (s.source_url or "") == (source_url or "")]

    if same_url:
        # Halaman sama -> versi baru
        version = max(s.capture_version for s in same_url) + 1
    elif existing:
        # Judul sama tapi URL berbeda -> layar berbeda
        counter = 2
        while db.scalar(
            select(Screen).where(
                Screen.project_id == project.id,
                Screen.screen_key == f"{base_key}-{counter}",
                Screen.capture_version == 1,
            )
        ):
            counter += 1
        key = f"{base_key}-{counter}"

    raw_structure = meta.get("structure")
    if isinstance(raw_structure, dict) and "visual" in raw_structure:
        raw_structure = dict(raw_structure)
        mask_boxes = meta.get("mask_boxes") or meta.get("masks")
        raw_structure["visual"] = _sanitize_visual_tree(raw_structure["visual"], mask_boxes)

    screen = Screen(
        project_id=project.id,
        capture_session_id=session.id,
        screen_key=key,
        title=page_title,
        route_label=urlparse(source_url).path if source_url else None,
        source_url=source_url,
        screenshot_path=relative,
        full_page=bool(meta.get("full_page")),
        capture_version=version,
        category=None,
        # Struktur semantik (tabel, heading, form, card) untuk mesin rekonstruksi.
        structure=raw_structure,
        tags=[],
        review_status="pending",
        captured_at=now_utc(),
    )
    db.add(screen)
    db.flush()

    # Elemen interaktif yang terdeteksi (label + tipe saja, tanpa HTML).
    for raw in meta.get("elements", []) or []:
        db.add(
            ScreenElement(
                screen_id=screen.id,
                element_type=str(raw.get("type") or "unknown")[:40],
                label=(str(raw["label"])[:200] if raw.get("label") else None),
                selector_or_hint=(str(raw["hint"])[:500] if raw.get("hint") else None),
                bounding_box=raw.get("box"),
                percent_box=raw.get("percent_box"),
                source=str(raw.get("source") or "dom")[:20],
                tag=str(raw.get("tag") or "")[:40] or None,
                href=str(raw.get("href") or "")[:500] or None,
                target=str(raw.get("target") or "")[:20] or None,
                role=str(raw.get("role") or "")[:40] or None,
                input_type=str(raw.get("input_type") or "")[:20] or None,
                parent_element_id=str(raw.get("parent_id") or "")[:80] or None,
                state=str(raw.get("state") or "")[:20] or None,
                confidence=float(raw.get("confidence") or 1.0),
                mask=False,
            )
        )

    # Interaksi yang direkam worker.
    for index, raw in enumerate(meta.get("interactions", []) or [], start=1):
        db.add(
            Interaction(
                screen_id=screen.id,
                sequence_no=index,
                action=str(raw.get("action") or "unknown")[:40],
                expected_result=None,
                notes=raw.get("label"),
            )
        )

    db.flush()
    return screen


def unique_screen_key(db: Session, project_id: int, desired: str) -> str:
    key = slugify(desired)
    counter = 1
    while db.scalar(select(Screen).where(Screen.project_id == project_id, Screen.screen_key == key)):
        counter += 1
        key = f"{slugify(desired)}-{counter}"
    return key
