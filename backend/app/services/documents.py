"""Fase 6: penyusun dokumen SOP / user guide.

Sumber kebenaran: data yang sudah direview manusia (layar, tutorial, alur).
Dokumen tetap boleh disunting sebelum dipublikasikan.
"""

from __future__ import annotations

import html
from datetime import date
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import ConflictError, NotFoundError
from app.db.session import now_utc
from app.models.document import Document
from app.models.registry import Application, Project
from app.models.simulation import Simulation, SimulationTutorial
from app.models.user import User

COMPANY_NAME = "PT Nigmagrid Indo Nesia"

DOC_TYPES = {
    "sop": "Standard Operating Procedure",
    "user_guide": "Panduan Pengguna",
    "module": "Dokumentasi Modul",
    "role": "Panduan Per Peran",
    "workflow": "Dokumentasi Alur Kerja",
}


def _screens_of(db: Session, project_id: int) -> dict[int, Any]:
    from app.models.capture import Screen

    screens = db.scalars(select(Screen).where(Screen.project_id == project_id)).all()
    return {screen.id: screen for screen in screens}


def _data_uri(relative_path: str | None) -> str | None:
    """Baca screenshot dari storage dan jadikan data URI.

    Diperlukan supaya gambar tetap muncul di PDF dan di preview iframe:
    <img> di dalam PDF/iframe tidak bisa mengirim header Authorization.
    """
    if not relative_path:
        return None
    from app.core.config import settings

    path = (settings.storage_path / relative_path).resolve()
    root = settings.storage_path
    if not str(path).startswith(str(root)) or not path.exists():
        return None
    import base64
    import mimetypes

    mime = mimetypes.guess_type(path.name)[0] or "image/png"
    encoded = base64.b64encode(path.read_bytes()).decode("ascii")
    return f"data:{mime};base64,{encoded}"


def build_content(
    db: Session,
    project: Project,
    simulation: Simulation | None,
    tutorial: SimulationTutorial | None,
    doc_type: str,
    author: str,
) -> dict[str, Any]:
    """Susun isi dokumen dari layar + tutorial + workflow."""
    application = db.get(Application, project.application_id)
    screens = _screens_of(db, project.id)
    app_name = application.name if application else project.name

    steps: list[dict[str, Any]] = []
    if tutorial:
        for step in tutorial.steps:
            screen = screens.get(_screen_id_by_key(screens, step.get("screen")))
            steps.append(
                {
                    "no": step.get("no", len(steps) + 1),
                    "instruction": step.get("instruction", ""),
                    "expected": step.get("expected"),
                    "warning": None,
                    "screen_id": screen.id if screen else None,
                    "screen_title": screen.title if screen else None,
                    "screenshot": (
                        f"/api/v1/screens/{screen.id}/screenshot?masked=true" if screen else None
                    ),
                    "image": _data_uri(screen.screenshot_path if screen else None),
                }
            )

    workflow_section: dict[str, Any] | None = None
    if simulation:
        from app.services import workflow as workflow_service

        flow = workflow_service.get_workflow(db, simulation.id, create=False)
        workflow_section = {
            "name": flow.name,
            "states": flow.states,
            "transitions": flow.transitions,
        }

    prerequisites = [
        "Akun NigmaSim dengan izin akses ke aplikasi sumber.",
        "Browser (Chrome/Edge) versi terbaru.",
        "Data contoh (dummy) tersedia - tidak ada data pelanggan nyata.",
    ]

    return {
        "purpose": (
            f"Dokumen ini menjelaskan cara menggunakan simulasi {app_name} "
            "untuk keperluan demo, pelatihan, dan spesifikasi alur kerja. "
            "Seluruh data di dalam simulasi adalah data dummy."
        ),
        "scope": (
            f"Cakupan: {app_name}"
            + (f" - modul {tutorial.title}" if tutorial else "")
            + "."
        ),
        "role": "Staf dan Manajer (sesuaikan dengan alur persetujuan)",
        "prerequisites": prerequisites,
        "warnings": [
            "Jangan memasukkan data pelanggan sungguhan ke simulasi.",
            "Tampilan pada dokumen ini memakai data dummy yang sudah disamarkan.",
        ],
        "steps": steps,
        "workflow": workflow_section,
        "branding": {
            "company": COMPANY_NAME,
            "application": app_name,
            "logo": "/brand/nigmagrid-logo.png",
        },
        "revision": {
            "version": "1.0",
            "date": date.today().isoformat(),
            "author": author,
        },
    }


def _screen_id_by_key(screens: dict[int, Any], key: str | None) -> int | None:
    if not key:
        return None
    for screen_id, screen in screens.items():
        if screen.screen_key == key:
            return screen_id
    return None


def render_markdown(title: str, doc_type: str, content: dict[str, Any]) -> str:
    branding = content.get("branding", {})
    lines: list[str] = []
    lines.append(f"# {title}")
    lines.append("")
    lines.append(
        f"*{DOC_TYPES.get(doc_type, doc_type)} · {branding.get('company', COMPANY_NAME)}*"
    )
    lines.append("")
    lines.append("## Tujuan")
    lines.append(content.get("purpose", ""))
    lines.append("")
    lines.append("## Cakupan")
    lines.append(content.get("scope", ""))
    lines.append("")
    lines.append("## Prasyarat")
    for item in content.get("prerequisites", []):
        lines.append(f"- {item}")
    lines.append("")
    lines.append("## Peran")
    lines.append(content.get("role", ""))
    lines.append("")
    lines.append("## Langkah")
    steps = content.get("steps", [])
    if not steps:
        lines.append("_Belum ada langkah. Buat tutorial lebih dulu di Tutorial Builder._")
    for step in steps:
        lines.append(f"### {step['no']}. {step['instruction']}")
        if step.get("screen_title"):
            lines.append(f"*{step['screen_title']}*")
        if step.get("expected"):
            lines.append("")
            lines.append(f"**Hasil yang diharapkan:** {step['expected']}")
        if step.get("warning"):
            lines.append("")
            lines.append(f"> **Perhatian:** {step['warning']}")
        lines.append("")
    workflow = content.get("workflow")
    if workflow:
        lines.append("## Alur Persetujuan")
        lines.append("")
        for state in workflow.get("states", []):
            lines.append(f"- **{state.get('label')}** — peran: {state.get('role', '-')}")
        lines.append("")
        lines.append("| Dari | Aksi | Ke | Peran |")
        lines.append("|---|---|---|---|")
        for transition in workflow.get("transitions", []):
            lines.append(
                f"| {transition.get('from')} | {transition.get('label')} | "
                f"{transition.get('to')} | {transition.get('role', '-')} |"
            )
        lines.append("")
    lines.append("## Catatan Penting")
    for item in content.get("warnings", []):
        lines.append(f"- {item}")
    lines.append("")
    revision = content.get("revision", {})
    lines.append("---")
    lines.append(
        f"Revisi {revision.get('version', '1.0')} · {revision.get('date', '')} · "
        f"{revision.get('author', '')}"
    )
    return "\n".join(lines)


def render_html(title: str, doc_type: str, content: dict[str, Any]) -> str:
    branding = content.get("branding", {})
    esc = html.escape

    def steps_html() -> str:
        rows = []
        for step in content.get("steps", []):
            parts = [
                f'<section class="step"><h3>{esc(str(step["no"]))}. '
                f'{esc(step["instruction"])}</h3>'
            ]
            if step.get("screen_title"):
                parts.append(f'<p class="meta">{esc(step["screen_title"])}</p>')
            if step.get("screenshot"):
                alt = esc(step.get("screen_title") or "")
                source = step.get("image") or step["screenshot"]
                parts.append(f'<img src="{esc(source)}" alt="{alt}" class="shot" />')
            if step.get("expected"):
                parts.append(f'<p class="expected"><strong>Hasil yang diharapkan:</strong> {esc(step["expected"])}</p>')
            if step.get("warning"):
                parts.append(f'<p class="warning"><strong>Perhatian:</strong> {esc(step["warning"])}</p>')
            parts.append("</section>")
            rows.append("".join(parts))
        if not rows:
            return "<p><em>Belum ada langkah. Buat tutorial lebih dulu di Tutorial Builder.</em></p>"
        return "".join(rows)

    workflow = content.get("workflow")
    workflow_html = ""
    if workflow:
        states = "".join(
            f"<li><strong>{esc(s.get('label', ''))}</strong> — peran: {esc(s.get('role') or '-')}</li>"
            for s in workflow.get("states", [])
        )
        transitions = "".join(
            f"<tr><td>{esc(t.get('from', ''))}</td><td>{esc(t.get('label', ''))}</td>"
            f"<td>{esc(t.get('to', ''))}</td><td>{esc(t.get('role') or '-')}</td></tr>"
            for t in workflow.get("transitions", [])
        )
        workflow_html = (
            "<h2>Alur Persetujuan</h2>"
            f"<ul>{states}</ul>"
            "<table><thead><tr><th>Dari</th><th>Aksi</th><th>Ke</th><th>Peran</th></tr></thead>"
            f"<tbody>{transitions}</tbody></table>"
        )

    prerequisites = "".join(
        f"<li>{esc(item)}</li>" for item in content.get("prerequisites", [])
    )
    warnings = "".join(f"<li>{esc(item)}</li>" for item in content.get("warnings", []))
    revision = content.get("revision", {})

    return f"""<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8" />
<title>{esc(title)}</title>
<style>
  @page {{ size: A4; margin: 18mm 16mm; }}
  body {{ font-family: Inter, "Segoe UI", system-ui, sans-serif; color: #0f172a; font-size: 11pt; line-height: 1.6; }}
  header.brand {{ display: flex; align-items: center; gap: 12px; border-bottom: 2px solid #e2e8f0; padding-bottom: 12px; margin-bottom: 20px; }}
  header.brand img {{ width: 34px; height: 34px; }}
  header.brand .company {{ font-size: 13pt; font-weight: 600; }}
  header.brand .meta {{ font-size: 9pt; color: #64748b; }}
  h1 {{ font-size: 19pt; margin: 0 0 4px; }}
  h2 {{ font-size: 13pt; margin: 22px 0 8px; padding-bottom: 4px; border-bottom: 1px solid #e2e8f0; }}
  h3 {{ font-size: 11.5pt; margin: 0 0 4px; }}
  .lead {{ color: #475569; font-size: 10pt; margin: 0 0 6px; }}
  ul {{ margin: 6px 0; padding-left: 18px; }}
  li {{ margin: 2px 0; }}
  .step {{ break-inside: avoid; margin: 14px 0; padding: 12px; border: 1px solid #e2e8f0; border-radius: 8px; }}
  .step .meta {{ color: #64748b; font-size: 9pt; margin: 0 0 8px; }}
  .shot {{ width: 100%; border: 1px solid #cbd5e1; border-radius: 6px; margin: 8px 0; }}
  .expected {{ font-size: 10pt; color: #334155; margin: 4px 0 0; }}
  .warning {{ font-size: 10pt; color: #b45309; margin: 4px 0 0; }}
  table {{ width: 100%; border-collapse: collapse; font-size: 9.5pt; margin: 8px 0; }}
  th, td {{ border: 1px solid #e2e8f0; padding: 5px 8px; text-align: left; }}
  th {{ background: #f8fafc; font-weight: 600; }}
  footer {{ margin-top: 26px; padding-top: 10px; border-top: 1px solid #e2e8f0; font-size: 9pt; color: #64748b; }}
</style>
</head>
<body>
  <header class="brand">
    <img src="{esc(branding.get('logo', '/brand/nigmagrid-logo.png'))}" alt="" />
    <div>
      <div class="company">{esc(branding.get('company', COMPANY_NAME))}</div>
      <div class="meta">{esc(branding.get('application', ''))} · {esc(DOC_TYPES.get(doc_type, doc_type))}</div>
    </div>
  </header>

  <h1>{esc(title)}</h1>
  <p class="lead">{esc(DOC_TYPES.get(doc_type, doc_type))} · data simulasi (dummy)</p>

  <h2>Tujuan</h2>
  <p>{esc(content.get('purpose', ''))}</p>

  <h2>Cakupan</h2>
  <p>{esc(content.get('scope', ''))}</p>

  <h2>Prasyarat</h2>
  <ul>{prerequisites}</ul>

  <h2>Peran</h2>
  <p>{esc(content.get('role', ''))}</p>

  <h2>Langkah</h2>
  {steps_html()}

  {workflow_html}

  <h2>Catatan Penting</h2>
  <ul>{warnings}</ul>

  <footer>
    Revisi {esc(str(revision.get('version', '1.0')))} · {esc(str(revision.get('date', '')))} · {esc(str(revision.get('author', '')))}
  </footer>
</body>
</html>"""


def generate_document(
    db: Session,
    project: Project,
    *,
    title: str,
    doc_type: str,
    simulation: Simulation | None = None,
    tutorial: SimulationTutorial | None = None,
    author: User | None = None,
) -> Document:
    content = build_content(
        db,
        project,
        simulation,
        tutorial,
        doc_type,
        author.name if author else "Tim NigmaSim",
    )
    document = Document(
        project_id=project.id,
        simulation_id=simulation.id if simulation else None,
        title=title,
        doc_type=doc_type,
        description=content.get("scope"),
        content=content,
        markdown=render_markdown(title, doc_type, content),
        html=render_html(title, doc_type, content),
        status="draft",
        version="1.0",
        created_by=author.id if author else None,
    )
    db.add(document)
    db.flush()
    return document


def refresh_render(document: Document) -> Document:
    """Render ulang markdown & html setelah isi dokumen disunting."""
    document.markdown = render_markdown(document.title, document.doc_type, document.content)
    document.html = render_html(document.title, document.doc_type, document.content)
    return document
