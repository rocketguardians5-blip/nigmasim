"""Generator simulasi hidup untuk runtime React.

Alur:
    rekonstruksi approved -> definisi data (bukan TSX) -> apps/<slug>/

Yang ditulis generator HANYA data:
    - definition.ts  : menu, halaman, kolom tabel, field form, relasi dropdown
    - seed.ts        : data fiktif deterministik
    - ASSUMPTIONS.md : asumsi + layar yang dilewati
    - runtime.json   : metadata untuk dibaca ulang builder
    - index.tsx      : template tipis yang memakai renderer generik @sim/core

Generator TIDAK menyalin teks rekonstruksi ke dalam TSX. Semua teks tetap
berupa string data di definition.ts.
"""

from __future__ import annotations

import hashlib
import json
import os
import random
import re
import shutil
import unicodedata
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.config import settings
from app.core.errors import ConflictError, NotFoundError
from app.models.capture import Screen
from app.models.reconstruction import Reconstruction
from app.models.registry import Application, Project

SLUG_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
EMAIL_RE = re.compile(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+")

FIELD_TYPES = {"input", "field", "select", "dropdown", "textarea"}
ACTION_TYPES = {"button", "link"}
NAV_TYPES = {"nav-item"}

PREFIXES = (
    "field ",
    "tombol ",
    "pilihan ",
    "dropdown ",
    "menu ",
    "link ",
    "tab ",
    "checkbox ",
    "item endpoint ",
    "ikon ",
    "kartu ",
    "area ",
    "judul halaman ",
    "judul utama ",
    "judul ",
    "logo ",
    "navigasi ",
    "tabel ",
    "status ",
)

GENERIC_LABELS = {
    "container",
    "bagian",
    "card",
    "div",
    "span",
    "body",
    "main",
    "content",
}

STATUS_CODE_OPTIONS = ["200", "201", "400", "401", "403", "404", "409", "422", "500"]
METHOD_OPTIONS = ["GET", "POST", "PUT", "PATCH", "DELETE"]
ENVIRONMENT_OPTIONS = ["Production", "Staging", "Development"]
PROJECT_OPTIONS = ["SIMRS", "PIMS", "Mobile"]


# --------------------------------------------------------------------------- util


def _now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _normalize(text: str) -> str:
    value = unicodedata.normalize("NFKD", text or "")
    value = value.encode("ascii", "ignore").decode("ascii")
    return re.sub(r"\s+", " ", value).strip().lower()


def slugify(text: str) -> str:
    value = unicodedata.normalize("NFKD", text or "")
    value = value.encode("ascii", "ignore").decode("ascii")
    value = re.sub(r"[^a-zA-Z0-9]+", "-", value).strip("-").lower()
    return value


def _clean_label(label: str | None) -> str:
    value = re.sub(r"\s+", " ", (label or "").strip())
    changed = True
    while changed:
        changed = False
        lowered = value.lower()
        for prefix in PREFIXES:
            if lowered.startswith(prefix):
                value = value[len(prefix) :].strip()
                changed = True
                break
    return value.strip(" -:•")


def _key_from_label(label: str, fallback: str = "field") -> str:
    key = slugify(label).replace("-", "_")
    return key or fallback


def _short_title(title: str, limit: int = 42) -> str:
    first = (title or "").split(" - ")[0].strip()
    if len(first) > limit:
        return first[: limit - 1].rstrip() + "…"
    return first


def resolve_runtime_root() -> Path:
    """Lokasi folder simulation-runtime, tahan dijalankan dari backend/ atau root."""
    configured = Path(settings.simulation_runtime_root)
    candidates = [
        configured,
        Path.cwd() / configured,
        Path(__file__).resolve().parents[3] / "simulation-runtime",
    ]
    for candidate in candidates:
        try:
            resolved = candidate.resolve()
        except OSError:
            continue
        if (resolved / "registry.json").is_file():
            return resolved
    return candidates[-1].resolve()


def _safe_app_dir(runtime_root: Path, slug: str) -> Path:
    if not SLUG_RE.match(slug):
        raise ConflictError(
            "Slug simulasi tidak valid. Hanya huruf kecil, angka, dan tanda hubung.",
            details={"slug": slug},
        )
    apps_root = (runtime_root / "apps").resolve()
    target = (apps_root / slug).resolve()
    if target.parent != apps_root:
        raise ConflictError("Path simulasi harus berada langsung di bawah apps/.")
    return target


def _write_text(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + ".tmp")
    tmp.write_text(content, encoding="utf-8", newline="\n")
    os.replace(tmp, path)


def _write_json_atomic(path: Path, payload: Any) -> None:
    _write_text(path, json.dumps(payload, indent=2, ensure_ascii=False) + "\n")


def _read_registry(path: Path) -> dict[str, Any]:
    if not path.is_file():
        return {"apps": []}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ConflictError(f"registry.json tidak bisa dibaca: {exc}") from exc
    if not isinstance(data, dict) or not isinstance(data.get("apps"), list):
        raise ConflictError("registry.json tidak memiliki struktur { apps: [...] }.")
    return data


# ------------------------------------------------------------------ ekstraksi UI


def _component_tombstoned(component_id: int, tombstones: set[str]) -> bool:
    raw = str(component_id)
    return raw in tombstones or f"auto_{raw}" in tombstones or f"manual_{raw}" in tombstones


def _override_for(component_id: int, overrides: dict[str, Any]) -> dict[str, Any] | None:
    raw = str(component_id)
    for key in (raw, f"auto_{raw}", f"manual_{raw}"):
        value = overrides.get(key)
        if isinstance(value, dict):
            return value
    return None


def _group_for(element_type: str) -> str:
    lowered = (element_type or "").lower()
    if lowered in FIELD_TYPES:
        return "field"
    if lowered in ACTION_TYPES:
        return "action"
    if lowered in NAV_TYPES:
        return "nav"
    if lowered in {"heading", "logo", "card", "table"}:
        return lowered
    return "other"


def _collect_elements(draft: Reconstruction) -> tuple[list[dict[str, Any]], set[str]]:
    """Gabungkan komponen yang direview dengan section layout yang disetujui.

    Komponen yang di-tombstone tidak pernah dihidupkan lagi. Item layout yang
    labelnya sama dengan komponen yang di-tombstone juga dibuang.
    """
    layout = draft.layout if isinstance(draft.layout, dict) else {}
    tombstones = {str(item) for item in (layout.get("tombstones") or [])}
    overrides = layout.get("overrides") or {}
    if not isinstance(overrides, dict):
        overrides = {}

    tombstoned_labels: set[str] = set()
    elements: list[dict[str, Any]] = []
    seen: set[tuple[str, str]] = set()

    def add(element: dict[str, Any]) -> None:
        label = _clean_label(element.get("label"))
        if not label:
            return
        if _normalize(label) in GENERIC_LABELS:
            return
        if re.fullmatch(r"bagian \d+", _normalize(label)):
            return
        group = _group_for(element.get("type", ""))
        if group == "other":
            return
        marker = (group, _normalize(label))
        if marker in seen:
            return
        seen.add(marker)
        element["label"] = label
        elements.append(element)

    for component in draft.components or []:
        if (component.source or "").lower() == "detected":
            # Sumber DOM lama tidak dipakai; hanya hasil review AI/manual.
            continue
        if _component_tombstoned(component.id, tombstones):
            if component.label:
                tombstoned_labels.add(_normalize(component.label))
            continue
        override = _override_for(component.id, overrides)
        label = component.label or ""
        if override and isinstance(override.get("label"), str) and override["label"].strip():
            label = override["label"]
        props = dict(component.props or {})
        add(
            {
                "type": component.component_type,
                "label": label,
                "region": component.region or "main",
                "props": props,
                "source": component.source or "ai-vision",
                "component_id": component.id,
            }
        )

    # Section layout adalah hasil analisis yang ikut disetujui. Dipakai untuk
    # melengkapi label form/nav yang tidak muncul sebagai komponen terpisah.
    for section in layout.get("sections") or []:
        if not isinstance(section, dict):
            continue
        for item in section.get("items") or []:
            if not isinstance(item, dict):
                continue
            label = item.get("label") or ""
            if not label:
                continue
            if _normalize(label) in tombstoned_labels:
                continue
            add(
                {
                    "type": item.get("type") or "text",
                    "label": label,
                    "region": "main",
                    "props": {},
                    "source": "layout",
                    "component_id": None,
                }
            )

    return elements, tombstoned_labels


USABILITY_WARNING = (
    "Draf ini belum bisa dipakai Simulation Builder: belum ada "
    "komponen hasil AI Vision atau koreksi manual. Jalankan AI Vision."
)


def _usable_generator_elements(draft: Reconstruction) -> list[dict[str, Any]]:
    """Elemen yang benar-benar diterima generator dan berasal dari AI Vision/manual.

    Memakai _collect_elements() supaya filter label, tombstone, deduplikasi, dan
    aturan grup komponen selalu sama dengan yang dipakai saat generate simulasi.
    Item section layout tidak dihitung karena bukan komponen hasil review.
    """
    elements, _ = _collect_elements(draft)
    return [
        element
        for element in elements
        if (element.get("source") or "").lower() in ("ai-vision", "manual")
    ]


def check_reconstruction_usability(draft: Reconstruction) -> dict[str, Any]:
    """Publik: cek apakah rekonstruksi bisa dipakai generator simulasi.

    Mengembalikan:
    - usable_count: jumlah elemen ai-vision/manual yang lolos aturan _collect_elements()
    - valid_components: alias untuk usable_count (kompatibilitas)
    - section_items: jumlah item section di layout (info saja)
    - sections_count: jumlah section (info saja)
    - warning: pesan peringatan bila usable_count == 0
    """
    layout = draft.layout if isinstance(draft.layout, dict) else {}
    sections = layout.get("sections") or []
    section_items = sum(len(s.get("items") or []) for s in sections if isinstance(s, dict))

    usable_count = len(_usable_generator_elements(draft))

    warning = None
    if usable_count == 0:
        warning = USABILITY_WARNING

    return {
        "usable_count": usable_count,
        "valid_components": usable_count,
        "section_items": section_items,
        "sections_count": len(sections),
        "warning": warning,
    }


def _find_heading(elements: list[dict[str, Any]]) -> str | None:
    for element in elements:
        if _group_for(element["type"]) == "heading":
            return element["label"]
    return None


def _find_table(elements: list[dict[str, Any]]) -> dict[str, Any] | None:
    for element in elements:
        if _group_for(element["type"]) == "table":
            headers = (element.get("props") or {}).get("headers") or []
            if isinstance(headers, list) and headers:
                return element
    return None


def _find_submit(elements: list[dict[str, Any]], words: tuple[str, ...]) -> dict[str, Any] | None:
    for element in elements:
        if _group_for(element["type"]) != "action":
            continue
        lowered = _normalize(element["label"])
        if any(word in lowered for word in words):
            return element
    return None


def _field_type(label: str, element_type: str) -> str:
    lowered = _normalize(label)
    if "password" in lowered or "kata sandi" in lowered:
        return "password"
    if "email" in lowered or "surel" in lowered:
        return "email"
    if any(word in lowered for word in ("telepon", "phone", "whatsapp", "hp")):
        return "tel"
    if any(word in lowered for word in ("tanggal", "date", "waktu")):
        return "date"
    if any(word in lowered for word in ("deskripsi", "description", "catatan", "body", "json", "pesan")):
        return "textarea"
    if any(word in lowered for word in ("checkbox", "ingat saya", "remember")):
        return "checkbox"
    if (element_type or "").lower() in {"select", "dropdown"}:
        return "select"
    if any(word in lowered for word in ("jumlah", "nilai", "harga", "total", "angka", "number", "biaya")):
        return "number"
    return "text"


def _field_options(label: str, element_type: str) -> list[str] | None:
    lowered = _normalize(label)
    if "method" in lowered or "metode" in lowered:
        return METHOD_OPTIONS
    if "environment" in lowered or "lingkungan" in lowered:
        return ENVIRONMENT_OPTIONS
    if "project" in lowered or "proyek" in lowered:
        return PROJECT_OPTIONS
    if "status code" in lowered or "kode status" in lowered:
        return STATUS_CODE_OPTIONS
    if "status" in lowered:
        return ["Aktif", "Nonaktif"]
    if (element_type or "").lower() in {"select", "dropdown"}:
        return ["Pilihan 1", "Pilihan 2"]
    return None


def _build_field(element: dict[str, Any], used_keys: set[str]) -> dict[str, Any] | None:
    label = element["label"]
    base_key = _key_from_label(label)
    key = base_key
    counter = 2
    while key in used_keys:
        key = f"{base_key}_{counter}"
        counter += 1
    used_keys.add(key)

    field_type = _field_type(label, element["type"])
    options = _field_options(label, element["type"])
    if field_type == "select" and not options:
        options = ["Pilihan 1", "Pilihan 2"]

    field: dict[str, Any] = {
        "key": key,
        "label": label,
        "type": field_type,
        "required": field_type not in {"checkbox"},
    }
    if options:
        field["options"] = [{"value": option, "label": option} for option in options]
    return field


def _prefill_from_assumptions(
    assumptions: list[Any], fields: list[dict[str, Any]]
) -> dict[str, str] | None:
    email: str | None = None
    password: str | None = None
    for assumption in assumptions:
        text = assumption.description or ""
        found = EMAIL_RE.search(text)
        if found:
            email = found.group(0)
            tail = text[found.end() :]
            match = re.search(r"/\s*([A-Za-z0-9!@#$%^&*._-]{3,})", tail)
            if match:
                password = match.group(1).rstrip(".,;")
            break
    if not email:
        return None
    values: dict[str, str] = {}
    for field in fields:
        lowered = _normalize(field["label"])
        if "email" in lowered or "username" in lowered or "pengguna" in lowered:
            values[field["key"]] = email
        elif "password" in lowered or "sandi" in lowered:
            values[field["key"]] = password or "password"
    return values or None


def _action_from_element(element: dict[str, Any]) -> dict[str, Any]:
    label = element["label"]
    action: dict[str, Any] = {
        "label": label,
        "variant": "secondary",
        "toast": f"Aksi simulasi: {label}.",
    }
    lowered = _normalize(label)
    if any(word in lowered for word in ("hapus", "delete", "reset", "bersihkan")):
        action["variant"] = "danger"
    elif any(word in lowered for word in ("simpan", "kirim", "send", "masuk", "login", "tambah", "buat", "import")):
        action["variant"] = "primary"
    return action


def _dedupe_actions(actions: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: set[str] = set()
    result: list[dict[str, Any]] = []
    for action in actions:
        marker = _normalize(action["label"])
        if marker in seen:
            continue
        seen.add(marker)
        result.append(action)
    return result


def _build_table(
    table_element: dict[str, Any],
    elements: list[dict[str, Any]],
    page_key: str,
) -> tuple[dict[str, Any] | None, dict[str, Any] | None, str | None]:
    props = table_element.get("props") or {}
    headers = props.get("headers") or []
    if not isinstance(headers, list) or not headers:
        return None, None, "Tabel tidak punya header kolom yang bisa dipakai."

    fields: list[dict[str, Any]] = []
    columns: list[dict[str, Any]] = []
    used_keys: set[str] = set()
    field_keys: dict[str, str] = {}

    def add_field(key: str, label: str, field_type: str, options: list[str] | None = None) -> None:
        if key in used_keys:
            return
        used_keys.add(key)
        field: dict[str, Any] = {"key": key, "label": label, "type": field_type, "required": field_type != "checkbox"}
        if options:
            field["options"] = [{"value": option, "label": option} for option in options]
        fields.append(field)
        field_keys[label.lower()] = key

    for raw_header in headers:
        header = _clean_label(str(raw_header))
        if not header:
            continue
        lowered = _normalize(header)
        if lowered in {"aksi", "action", "actions", "opsi"}:
            columns.append({"key": "action", "label": header.upper(), "type": "action"})
            continue
        if "&" in header and "project" in lowered:
            # Contoh: "KODE & PROJECT" -> kolom gabungan, field terpisah.
            add_field("code", "Kode", "text")
            add_field("project", "Project", "select", PROJECT_OPTIONS)
            columns.append(
                {
                    "key": "kode_project",
                    "label": header.upper(),
                    "type": "text",
                    "template": "{code} / {project}",
                }
            )
            continue
        key = _key_from_label(header)
        field_type = _field_type(header, "input")
        if "status code" in lowered or "kode status" in lowered:
            field_type = "select"
        options = _field_options(header, "input") if field_type == "select" else None
        add_field(key, header, field_type, options)
        column_type = "text"
        if field_type == "select":
            column_type = "status"
        elif field_type == "number":
            column_type = "number"
        elif field_type == "date":
            column_type = "date"
        columns.append({"key": key, "label": header.upper(), "type": column_type})

    if not fields:
        return None, None, "Tabel tidak punya kolom data (hanya kolom aksi)."

    # Dropdown filter di sekitar tabel (mis. "Filter Project").
    filters: list[dict[str, Any]] = []
    for element in elements:
        if _group_for(element["type"]) != "field":
            continue
        lowered = _normalize(element["label"])
        if "filter" not in lowered:
            continue
        options = _field_options(element["label"], element["type"])
        if not options:
            continue
        field_key = field_keys.get("project") if "project" in lowered else None
        if not field_key:
            continue
        filters.append(
            {
                "key": field_key,
                "label": element["label"],
                "options": [{"value": option, "label": option} for option in options],
            }
        )

    create_element = _find_submit(elements, ("tambah", "baru", "add", "create"))
    create_label = create_element["label"] if create_element else "Tambah data"

    dataset_key = _key_from_label(table_element["label"] or page_key)
    dataset = {
        "key": dataset_key,
        "label": table_element["label"],
        "fields": fields,
        "columns": columns,
        "searchKeys": [field["key"] for field in fields if field["type"] != "checkbox"],
    }
    section = {
        "type": "table",
        "title": table_element["label"],
        "dataset": dataset_key,
        "createLabel": create_label,
        "filters": filters,
    }
    return dataset, section, None


def _build_page(
    draft: Reconstruction,
    screen: Screen,
    page_key: str,
    route: str,
) -> tuple[dict[str, Any] | None, list[dict[str, Any]], str | None]:
    elements, _ = _collect_elements(draft)
    if not elements:
        return None, [], "Rekonstruksi tidak punya komponen atau section yang bisa dipakai."

    title = _find_heading(elements) or screen.title or page_key
    lowered_title = _normalize(f"{title} {route} {screen.title}")
    is_auth = any(word in lowered_title for word in ("login", "masuk", "sign in", "signin"))
    table_element = _find_table(elements)
    field_elements = [element for element in elements if _group_for(element["type"]) == "field"]
    # Dropdown environment/profil di header bukan field form halaman.
    main_field_elements = [
        element
        for element in field_elements
        if (element.get("region") or "main") not in {"header", "sidebar"}
    ]
    action_elements = [
        element
        for element in elements
        if _group_for(element["type"]) == "action"
        and not any(word in _normalize(element["label"]) for word in ("collapse", "toggle sidebar"))
    ]

    sections: list[dict[str, Any]] = []
    datasets: list[dict[str, Any]] = []

    if is_auth:
        used_keys: set[str] = set()
        fields: list[dict[str, Any]] = []
        for element in field_elements:
            field = _build_field(element, used_keys)
            if field:
                fields.append(field)
        if not fields:
            return None, [], "Layar login tidak punya field yang bisa dibaca dari rekonstruksi."

        submit = _find_submit(elements, ("masuk", "login", "sign in", "signin", "submit"))
        submit_label = submit["label"] if submit else "Masuk"
        form: dict[str, Any] = {
            "type": "form",
            "title": title,
            "description": "Form ini hanya simulasi. Tidak ada autentikasi nyata.",
            "fields": fields,
            "submitLabel": submit_label,
            "successToast": "Login disimulasikan. Mengarahkan ke halaman aplikasi.",
        }
        prefill = _prefill_from_assumptions(list(draft.assumptions or []), fields)
        if prefill:
            form["prefill"] = {"label": "Isi Otomatis (Demo)", "values": prefill}
        sections.append(form)

        actions = []
        for element in action_elements:
            if submit and element["component_id"] == submit.get("component_id") and element["label"] == submit["label"]:
                continue
            if any(word in _normalize(element["label"]) for word in ("auto-fill", "isi otomatis", "autofill")):
                continue
            actions.append(_action_from_element(element))
        actions = _dedupe_actions(actions)
        if actions:
            sections.append({"type": "actions", "title": "Aksi lain", "items": actions})

        return (
            {
                "key": page_key,
                "title": title,
                "route": route,
                "subtitle": screen.route_label or screen.source_url or "",
                "kind": "auth",
                "sections": sections,
            },
            datasets,
            None,
        )

    if table_element:
        dataset, table_section, error = _build_table(table_element, elements, page_key)
        if error:
            return None, [], error
        if dataset and table_section:
            datasets.append(dataset)
            sections.append(table_section)

        create_element = _find_submit(elements, ("tambah", "baru", "add", "create"))
        actions = []
        for element in action_elements:
            if create_element and element["label"] == create_element["label"]:
                continue
            actions.append(_action_from_element(element))
        actions = _dedupe_actions(actions)
        if actions:
            sections.append({"type": "actions", "title": "Aksi halaman", "items": actions})

        return (
            {
                "key": page_key,
                "title": title,
                "route": route,
                "subtitle": screen.route_label or screen.source_url or "",
                "kind": "table",
                "sections": sections,
            },
            datasets,
            None,
        )

    submit = None
    if main_field_elements:
        used_keys = set()
        fields = []
        for element in main_field_elements:
            field = _build_field(element, used_keys)
            if field:
                fields.append(field)
        submit = _find_submit(elements, ("send", "kirim", "simpan", "submit", "jalankan", "cari"))
        submit_label = submit["label"] if submit else "Simpan"
        form = {
            "type": "form",
            "title": "Form simulasi",
            "fields": fields,
            "submitLabel": submit_label,
            "successToast": f"{submit_label} disimulasikan. Tidak ada API asli yang dipanggil.",
        }
        sections.append(form)

    actions = []
    for element in action_elements:
        if submit and element["label"] == submit["label"]:
            continue
        actions.append(_action_from_element(element))
    actions = _dedupe_actions(actions)
    if actions:
        sections.append({"type": "actions", "title": "Aksi halaman", "items": actions})

    # Kartu dan link non-aksi dirender sebagai daftar, tanpa data karangan.
    action_labels = {_normalize(action["label"]) for action in actions}
    list_items: list[dict[str, Any]] = []
    seen_items: set[str] = set()
    for element in elements:
        group = _group_for(element["type"])
        marker = _normalize(element["label"])
        if group == "card":
            if marker in seen_items:
                continue
            seen_items.add(marker)
            list_items.append({"label": element["label"], "meta": "Kartu dari rekonstruksi"})
        elif group == "action":
            if marker in action_labels or marker in seen_items:
                continue
            lowered = marker
            if any(word in lowered for word in ("link", "playground", "buka", "inspect", "lupa")):
                seen_items.add(marker)
                list_items.append({"label": element["label"], "meta": "Tautan dari rekonstruksi"})
    if list_items:
        sections.append({"type": "list", "title": "Tautan & kartu", "items": list_items})

    # Area response viewer: tampilkan keterangan, bukan respons palsu.
    for element in elements:
        if _group_for(element["type"]) == "card" and "response" in _normalize(element["label"]):
            sections.append(
                {
                    "type": "code",
                    "title": element["label"],
                    "body": "// Area response dari rekonstruksi.\n// Simulasi tidak memanggil API asli.",
                }
            )
            break

    if not sections:
        return None, [], "Tidak ada komponen/section yang bisa dipakai."

    return (
        {
            "key": page_key,
            "title": title,
            "route": route,
            "subtitle": screen.route_label or screen.source_url or "",
            "kind": "dashboard" if not main_field_elements else "custom",
            "sections": sections,
        },
        datasets,
        None,
    )


# -------------------------------------------------------------------- seed data


def _seed_rng(slug: str, dataset_key: str, index: int) -> random.Random:
    digest = hashlib.sha256(f"{slug}:{dataset_key}:{index}".encode("utf-8")).hexdigest()
    return random.Random(int(digest[:16], 16))


def _seed_value(field: dict[str, Any], index: int, rng: random.Random) -> Any:
    label = _normalize(field["label"])
    key = field["key"]
    field_type = field.get("type", "text")

    if field_type == "checkbox":
        return rng.choice([True, False])
    if field_type == "select":
        options = [option["value"] for option in field.get("options") or []]
        if options:
            return rng.choice(options)
    if "email" in label or "surel" in label:
        return f"user{index}@contoh.local"
    if "password" in label or "sandi" in label:
        return "password"
    if "status code" in label or "kode status" in label:
        return rng.choice(STATUS_CODE_OPTIONS)
    if "kode" in label or "code" in label:
        return f"ERR-{rng.choice(STATUS_CODE_OPTIONS)}"
    if "project" in label or "proyek" in label:
        return rng.choice(PROJECT_OPTIONS)
    if "tanggal" in label or "date" in label:
        return f"2026-{rng.randint(1, 12):02d}-{rng.randint(1, 28):02d}"
    if any(word in label for word in ("harga", "biaya", "total", "nilai")):
        return rng.randint(25, 900) * 1_000
    if any(word in label for word in ("jumlah", "angka", "number")):
        return rng.randint(1, 99)
    if "deskripsi" in label or "description" in label:
        return f"Deskripsi fiktif untuk data simulasi nomor {index}."
    if "title" in label or "nama" in label:
        return f"Contoh {field['label']} {index}"
    if "url" in label or "endpoint" in label:
        return f"https://api.contoh.local/v1/contoh/{index}"
    return f"{field['label']} contoh {index}"


def _build_seed(slug: str, datasets: list[dict[str, Any]], row_count: int = 8) -> dict[str, Any]:
    seed: dict[str, Any] = {}
    for dataset in datasets:
        rows: list[dict[str, Any]] = []
        for index in range(1, row_count + 1):
            rng = _seed_rng(slug, dataset["key"], index)
            row: dict[str, Any] = {"id": f"{dataset['key']}-{index:03d}"}
            for field in dataset["fields"]:
                row[field["key"]] = _seed_value(field, index, rng)
            rows.append(row)
        seed[dataset["key"]] = rows
    return seed


# ------------------------------------------------------------------ perakitan app


def _collect_screen_groups(
    db: Session, project_id: int
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Kelompokkan layar per screen_key; pilih versi capture yang disetujui."""
    screens = list(
        db.scalars(select(Screen).where(Screen.project_id == project_id).order_by(Screen.id))
    )
    if not screens:
        return [], [{"screen_key": None, "screen_title": None, "reason": "Project belum punya layar."}]

    drafts = list(
        db.scalars(
            select(Reconstruction)
            .where(Reconstruction.project_id == project_id)
            .options(
                selectinload(Reconstruction.components),
                selectinload(Reconstruction.assumptions),
            )
        )
    )
    by_screen: dict[int, list[Reconstruction]] = {}
    for draft in drafts:
        by_screen.setdefault(draft.screen_id, []).append(draft)

    groups: dict[str, list[Screen]] = {}
    for screen in screens:
        groups.setdefault(screen.screen_key, []).append(screen)

    selected: list[dict[str, Any]] = []
    errors: list[dict[str, Any]] = []
    for screen_key, versions in groups.items():
        versions.sort(key=lambda item: (item.capture_version, item.id), reverse=True)
        approved: list[tuple[Screen, Reconstruction]] = []
        for screen in versions:
            for draft in by_screen.get(screen.id, []):
                if draft.status == "approved":
                    approved.append((screen, draft))
        if approved:
            approved.sort(key=lambda pair: (pair[0].capture_version, pair[1].updated_at), reverse=True)
            screen, draft = approved[0]
            selected.append({"screen": screen, "draft": draft, "versions": versions})
            continue

        latest = versions[0]
        draft_status = None
        for screen in versions:
            for draft in by_screen.get(screen.id, []):
                draft_status = draft.status
                break
            if draft_status:
                break
        if draft_status:
            reason = f"Rekonstruksi belum disetujui (status {draft_status})."
        else:
            reason = "Belum ada rekonstruksi untuk layar ini."
        errors.append(
            {
                "screen_key": screen_key,
                "screen_title": latest.title,
                "reason": reason,
            }
        )
    return selected, errors


def _skipped_versions(
    selected: list[dict[str, Any]], db: Session
) -> list[dict[str, Any]]:
    skipped: list[dict[str, Any]] = []
    for item in selected:
        chosen_screen: Screen = item["screen"]
        chosen_draft: Reconstruction = item["draft"]
        for screen in item["versions"]:
            if screen.id == chosen_screen.id:
                continue
            drafts = list(
                db.scalars(
                    select(Reconstruction)
                    .where(Reconstruction.screen_id == screen.id)
                    .options(selectinload(Reconstruction.components))
                )
            )
            status = drafts[0].status if drafts else "belum ada rekonstruksi"
            skipped.append(
                {
                    "screen_key": screen.screen_key,
                    "screen_title": screen.title,
                    "screen_id": screen.id,
                    "capture_version": screen.capture_version,
                    "reason": (
                        f"Versi capture v{screen.capture_version} dilewati (status {status}); "
                        f"memakai v{chosen_screen.capture_version} yang sudah disetujui."
                    ),
                }
            )
    return skipped


def _build_nav(pages: list[dict[str, Any]]) -> list[dict[str, Any]]:
    app_pages = [page for page in pages if page.get("kind") != "auth"]
    if not app_pages:
        return []

    nav: list[dict[str, Any]] = []
    used: set[str] = set()
    for page in app_pages:
        keywords = {_normalize(page["title"]), _normalize(page["route"]), _normalize(page["key"])}
        label = _short_title(page["title"])
        for raw in (page.get("navLabels") or []):
            normalized = _normalize(raw)
            if any(keyword and (keyword in normalized or normalized in keyword) for keyword in keywords):
                label = raw
                break
            if "dashboard" in normalized and "dashboard" in _normalize(page["title"]):
                label = raw
                break
            if "playground" in normalized and "playground" in _normalize(page["title"]):
                label = raw
                break
            if "error" in normalized and "error" in _normalize(page["title"]):
                label = raw
                break
        if page["key"] in used:
            continue
        used.add(page["key"])
        nav.append({"page": page["key"], "label": label})
    return nav


def _apply_action_targets(pages: list[dict[str, Any]]) -> None:
    first_app_page = next((p for p in pages if p.get("kind") != "auth"), None)

    for page in pages:
        for section in page.get("sections") or []:
            if section.get("type") == "form" and page.get("kind") == "auth" and first_app_page:
                section["navigateTo"] = first_app_page["route"]
            elif section.get("type") == "actions":
                for action in section.get("items") or []:
                    label = _normalize(action.get("label", ""))
                    for target in pages:
                        if target["key"] == page["key"]:
                            continue
                        title = _normalize(target["title"])
                        if "playground" in label and "playground" in title:
                            action["navigateTo"] = target["route"]
                        elif "error" in label and "error" in title:
                            action["navigateTo"] = target["route"]
                        elif "dashboard" in label and "dashboard" in title:
                            action["navigateTo"] = target["route"]


def _render_assumptions_markdown(
    *,
    slug: str,
    name: str,
    generated_at: str,
    assumptions_by_page: list[tuple[str, str, list[Any]]],
    errors: list[dict[str, Any]],
    skipped: list[dict[str, Any]],
) -> str:
    lines = [
        f"# Asumsi Simulasi — {name}",
        "",
        "Dokumen ini dihasilkan otomatis oleh NigmaSim Simulation Generator.",
        "Simulasi dibangun HANYA dari rekonstruksi yang sudah disetujui manusia.",
        "",
        f"- Slug: `{slug}`",
        f"- Dibuat: {generated_at}",
        f"- Layar dibuat: {len(assumptions_by_page)}",
        f"- Layar gagal: {len(errors)}",
        f"- Versi layar dilewati: {len(skipped)}",
        "",
        "## Asumsi per layar",
        "",
    ]
    for page_title, route, assumptions in assumptions_by_page:
        lines.append(f"### {page_title} (`{route}`)")
        lines.append("")
        if not assumptions:
            lines.append("- Tidak ada asumsi khusus dari rekonstruksi.")
        else:
            for assumption in assumptions:
                confidence = getattr(assumption, "confidence", "medium")
                topic = getattr(assumption, "topic", "Umum")
                description = getattr(assumption, "description", "")
                resolved = "sudah ditinjau" if getattr(assumption, "resolved", False) else "belum ditinjau"
                lines.append(f"- **[{confidence}] {topic}** ({resolved}): {description}")
        lines.append("")

    lines.extend(
        [
            "## Asumsi umum",
            "",
            "- Seluruh data pada simulasi ini fiktif dan dihasilkan deterministik dari slug + nama dataset.",
            "- Simulasi tidak memanggil API asli dan tidak menyimpan kredensial aplikasi sumber.",
            "- Tombol yang tidak punya aturan bisnis eksplisit hanya menampilkan notifikasi simulasi.",
            "- Tabel, kolom, dan field diambil dari rekonstruksi yang disetujui; field yang tidak terlihat tidak ditambahkan.",
            "- Data tabel disimpan di IndexedDB browser dan bisa dikembalikan ke seed lewat tombol reset runtime.",
            "",
            "## Layar yang gagal dibuat",
            "",
        ]
    )
    if not errors:
        lines.append("- Tidak ada.")
    else:
        for error in errors:
            title = error.get("screen_title") or error.get("screen_key") or "(tanpa judul)"
            lines.append(f"- **{title}**: {error.get('reason')}")
    lines.append("")

    if skipped:
        lines.extend(["## Versi layar yang dilewati", ""])
        for item in skipped:
            lines.append(
                f"- **{item.get('screen_title')}** (screen id {item.get('screen_id')}, "
                f"capture v{item.get('capture_version')}): {item.get('reason')}"
            )
        lines.append("")

    return "\n".join(lines)


def _build_definition(
    *,
    slug: str,
    name: str,
    description: str,
    pages: list[dict[str, Any]],
    datasets: list[dict[str, Any]],
) -> dict[str, Any]:
    clean_pages: list[dict[str, Any]] = []
    for page in pages:
        clean = {key: value for key, value in page.items() if key != "navLabels"}
        clean_pages.append(clean)
    return {
        "name": name,
        "description": description,
        "brand": name,
        "nav": _build_nav(pages),
        "pages": clean_pages,
        "datasets": datasets,
    }


def _ts_data_file(header: str, type_name: str, export_name: str, payload: Any) -> str:
    return (
        f"/**\n * {header}\n * Dihasilkan otomatis. Jangan edit manual.\n */\n"
        f"import type {{ {type_name} }} from '@sim/core'\n\n"
        f"export const {export_name}: {type_name} = "
        f"{json.dumps(payload, indent=2, ensure_ascii=False)}\n"
    )


def _index_tsx(slug: str) -> str:
    return (
        "import { SimApp } from '@sim/core'\n"
        "import { definition } from './definition'\n"
        "import { seed } from './seed'\n\n"
        "export default function GeneratedSimulation() {\n"
        f"  return <SimApp definition={{definition}} seed={{seed}} slug=\"{slug}\" />\n"
        "}\n"
    )


def _registry_entry(slug: str, name: str, description: str) -> dict[str, Any]:
    return {
        "slug": slug,
        "name": name,
        "icon": "grid",
        "description": description,
        "path": f"/?app={slug}",
        "accent": "#4268ff",
    }


def _backup_existing(target: Path, runtime_root: Path, slug: str) -> Path:
    backups_root = runtime_root / ".backups"
    backups_root.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    backup = backups_root / f"{slug}-{stamp}"
    counter = 2
    while backup.exists():
        backup = backups_root / f"{slug}-{stamp}-{counter}"
        counter += 1
    shutil.copytree(target, backup)
    return backup


# ------------------------------------------------------------------------ publik


def generate_simulation(
    db: Session,
    project_id: int,
    *,
    overwrite: bool = False,
) -> dict[str, Any]:
    project = db.get(Project, project_id)
    if project is None:
        raise NotFoundError("Project tidak ditemukan")
    application = db.get(Application, project.application_id)
    if application is None:
        raise NotFoundError("Aplikasi untuk project ini tidak ditemukan")

    base_slug = slugify(f"{project.name} {application.name}") or f"sim-{project_id}"
    if not SLUG_RE.match(base_slug):
        raise ConflictError("Slug simulasi tidak valid.", details={"slug": base_slug})

    runtime_root = resolve_runtime_root()
    target = _safe_app_dir(runtime_root, base_slug)
    if target.exists() and not overwrite:
        raise ConflictError(
            f"Simulasi '{base_slug}' sudah ada. Pilih 'Timpa' untuk menggantinya "
            "(backup otomatis dibuat sebelum menimpa).",
            details={"slug": base_slug, "exists": True},
        )

    selected, errors = _collect_screen_groups(db, project_id)
    if not selected:
        raise ConflictError(
            "Tidak ada layar yang bisa digenerate. Semua layar gagal atau belum punya "
            "rekonstruksi yang disetujui.",
            details={"errors": errors},
        )

    pages: list[dict[str, Any]] = []
    datasets: list[dict[str, Any]] = []
    assumptions_by_page: list[tuple[str, str, list[Any]]] = []
    used_page_keys: set[str] = set()
    used_routes: set[str] = set()

    for item in selected:
        screen: Screen = item["screen"]
        draft: Reconstruction = item["draft"]
        route = (screen.route_label or "").strip()
        if not route.startswith("/"):
            route = "/" + (slugify(route or screen.screen_key) or "halaman")
        page_key = slugify(route.strip("/")) or slugify(screen.screen_key) or "halaman"
        if page_key in used_page_keys:
            suffix = 2
            while f"{page_key}-{suffix}" in used_page_keys:
                suffix += 1
            page_key = f"{page_key}-{suffix}"
        if route in used_routes:
            route = f"{route.rstrip('/')}-{page_key}"
        used_page_keys.add(page_key)
        used_routes.add(route)

        page, page_datasets, error = _build_page(draft, screen, page_key, route)
        if error or page is None:
            errors.append(
                {
                    "screen_key": screen.screen_key,
                    "screen_title": screen.title,
                    "reason": error or "Layar tidak bisa digenerate.",
                }
            )
            continue

        # Label nav dikumpulkan dulu; dipakai setelah semua halaman diketahui.
        elements, _ = _collect_elements(draft)
        nav_labels = [
            element["label"]
            for element in elements
            if _group_for(element["type"]) == "nav"
        ]
        page["navLabels"] = nav_labels
        pages.append(page)
        datasets.extend(page_datasets)
        assumptions_by_page.append((page["title"], page["route"], list(draft.assumptions or [])))

    if not pages:
        raise ConflictError(
            "Tidak ada layar yang berhasil digenerate dari rekonstruksi yang disetujui.",
            details={"errors": errors},
        )

    _apply_action_targets(pages)
    skipped = _skipped_versions(selected, db)

    name = project.name
    description = (
        f"Simulasi hidup {application.name} — dibangun dari {len(pages)} layar "
        "rekonstruksi yang disetujui."
    )
    definition = _build_definition(
        slug=base_slug,
        name=name,
        description=description,
        pages=pages,
        datasets=datasets,
    )
    seed = _build_seed(base_slug, datasets)
    generated_at = _now_iso()
    assumptions_md = _render_assumptions_markdown(
        slug=base_slug,
        name=name,
        generated_at=generated_at,
        assumptions_by_page=assumptions_by_page,
        errors=errors,
        skipped=skipped,
    )

    runtime_meta = {
        "slug": base_slug,
        "name": name,
        "description": description,
        "project_id": project_id,
        "application_id": application.id,
        "application_name": application.name,
        "generated_at": generated_at,
        "runtime_path": f"/?app={base_slug}",
        "screens": [
            {"key": page["key"], "title": page["title"], "route": page["route"], "kind": page["kind"]}
            for page in pages
        ],
        "errors": errors,
        "skipped": skipped,
        "assumptions": [
            {
                "screen_title": page_title,
                "route": route,
                "items": [
                    {
                        "topic": getattr(item, "topic", "Umum"),
                        "description": getattr(item, "description", ""),
                        "confidence": getattr(item, "confidence", "medium"),
                        "resolved": bool(getattr(item, "resolved", False)),
                    }
                    for item in assumptions
                ],
            }
            for page_title, route, assumptions in assumptions_by_page
        ],
    }

    backup: Path | None = None
    if target.exists():
        backup = _backup_existing(target, runtime_root, base_slug)
        shutil.rmtree(target)
    target.mkdir(parents=True, exist_ok=True)

    _write_text(
        target / "definition.ts",
        _ts_data_file(
            "Definisi data simulasi (menu, halaman, tabel, form).",
            "SimAppDefinition",
            "definition",
            definition,
        ),
    )
    _write_text(
        target / "seed.ts",
        _ts_data_file(
            "Data seed fiktif dan deterministik.",
            "SimSeedData",
            "seed",
            seed,
        ),
    )
    _write_text(target / "index.tsx", _index_tsx(base_slug))
    _write_text(target / "ASSUMPTIONS.md", assumptions_md)
    _write_json_atomic(target / "runtime.json", runtime_meta)

    registry_path = runtime_root / "registry.json"
    registry = _read_registry(registry_path)
    entry = _registry_entry(base_slug, name, description)
    replaced = False
    for index, existing in enumerate(registry["apps"]):
        if isinstance(existing, dict) and existing.get("slug") == base_slug:
            registry["apps"][index] = entry
            replaced = True
            break
    if not replaced:
        registry["apps"].append(entry)
    _write_json_atomic(registry_path, registry)

    return {
        "slug": base_slug,
        "name": name,
        "assumptions": runtime_meta["assumptions"],
        "screens": runtime_meta["screens"],
        "errors": errors,
        "skipped": skipped,
        "runtime_path": runtime_meta["runtime_path"],
        "runtime_dir": str(target),
        "backup_dir": str(backup) if backup else None,
        "generated_at": generated_at,
    }


def read_runtime_meta(db: Session, project_id: int) -> dict[str, Any] | None:
    """Baca metadata build terakhir untuk project ini dari folder runtime."""
    project = db.get(Project, project_id)
    if project is None:
        raise NotFoundError("Project tidak ditemukan")
    application = db.get(Application, project.application_id)
    if application is None:
        return None

    runtime_root = resolve_runtime_root()
    apps_root = runtime_root / "apps"
    if not apps_root.is_dir():
        return None

    candidates: list[dict[str, Any]] = []
    for meta_path in apps_root.glob("*/runtime.json"):
        try:
            meta = json.loads(meta_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        if not isinstance(meta, dict):
            continue
        if meta.get("project_id") != project_id:
            continue
        candidates.append(meta)
    if not candidates:
        return None
    candidates.sort(key=lambda item: item.get("generated_at") or "", reverse=True)
    meta = candidates[0]
    meta["runtime_path"] = meta.get("runtime_path") or f"/?app={meta.get('slug')}"
    return meta
