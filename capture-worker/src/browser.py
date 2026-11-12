"""Manajemen sesi browser Playwright.

Aturan yang tidak boleh dilanggar:
- Browser selalu HEADED saat development: operator harus melihat dan login manual.
- Tidak ada kode yang mengisi form login.
- Navigasi dibatasi ke host yang diotorisasi untuk sesi tersebut.
- Nilai input yang diketik pengguna TIDAK PERNAH dicatat (bisa berupa kredensial).
"""

from __future__ import annotations

import hashlib
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from playwright.sync_api import Browser, BrowserContext, Page, sync_playwright

from config import settings


class CaptureError(RuntimeError):
    """Kesalahan yang aman ditampilkan ke operator."""


@dataclass
class RecordedEvent:
    action: str
    label: str | None
    tag: str | None
    page_url: str | None
    at: float

    def as_dict(self) -> dict[str, Any]:
        return {
            "action": self.action,
            "label": self.label,
            "tag": self.tag,
            "page_url": self.page_url,
            "at": self.at,
        }


@dataclass
class Session:
    id: str
    status: str = "active"
    started_at: float = field(default_factory=time.time)
    url: str | None = None
    allowed_hosts: list[str] = field(default_factory=list)
    events: list[RecordedEvent] = field(default_factory=list)
    last_capture: dict[str, Any] | None = None

    def as_dict(self) -> dict[str, Any]:
        return {
            "session_id": self.id,
            "status": self.status,
            "started_at": self.started_at,
            "current_url": self.url,
            "allowed_hosts": self.allowed_hosts,
            "event_count": len(self.events),
            "last_capture": self.last_capture,
        }


# Skrip yang dipasang di setiap halaman untuk merekam interaksi.
# Sengaja TIDAK merekam nilai input - hanya identitas field.
INIT_SCRIPT = """
(() => {
  window.__nigmasim = window.__nigmasim || { events: [] };
  const labelOf = (el) => {
    const aria = el.getAttribute('aria-label');
    if (aria) return aria;
    const text = (el.innerText || el.value || '').trim();
    if (text && text.length < 60) return text;
    const ph = el.getAttribute('placeholder');
    return ph ? ph : null;
  };
  document.addEventListener('click', (e) => {
    const el = e.target && e.target.closest ? e.target.closest('a,button,[role=button],input,select,textarea,[onclick]') : null;
    if (!el) return;
    window.__nigmasim.events.push({
      action: 'click',
      label: labelOf(el),
      tag: el.tagName.toLowerCase(),
      at: Date.now(),
    });
  }, true);
  document.addEventListener('input', (e) => {
    const el = e.target;
    if (!el || !el.tagName) return;
    // Nilai TIDAK direkam demi keamanan.
    window.__nigmasim.events.push({
      action: 'input',
      label: labelOf(el),
      tag: el.tagName.toLowerCase(),
      at: Date.now(),
    });
  }, true);
  document.addEventListener('change', (e) => {
    const el = e.target;
    if (!el || !el.tagName) return;
    window.__nigmasim.events.push({
      action: 'select',
      label: labelOf(el),
      tag: el.tagName.toLowerCase(),
      at: Date.now(),
    });
  }, true);
})();
"""

# Skrip untuk mengambil metadata elemen interaktif. Tidak mengembalikan HTML.
# Hanya label & tag semantik — TIDAK pernah innerHTML/outerHTML.
EXTRACT_ELEMENTS = """
(limit) => {
  const pick = (el) => {
    const aria = el.getAttribute('aria-label');
    const text = (el.innerText || '').trim().split('\\n')[0] || null;
    const placeholder = el.getAttribute('placeholder');
    const label = aria || (text && text.length < 60 ? text : null) || placeholder || null;
    const rect = el.getBoundingClientRect();
    return {
      type: el.tagName.toLowerCase() === 'input' ? (el.getAttribute('type') || 'text') : el.tagName.toLowerCase(),
      label: label,
      hint: aria ? `[aria-label="${aria}"]` : (text ? `text:${text.slice(0, 24)}` : null),
      box: { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) },
    };
  };
  const nodes = Array.from(document.querySelectorAll(
    'a, button, input, select, textarea, [role=button], [role=tab], nav a, nav button'
  ));
  const seen = new Set();
  const out = [];
  for (const el of nodes) {
    const r = pick(el);
    const key = `${r.type}|${r.hint}|${r.label}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
    if (out.length >= limit) break;
  }
  return out;
}
"""

# Struktur semantik halaman - dipakai mesin rekonstruksi (Phase 3).
# Hanya BENTUK & TEKS yang sudah terlihat. Tidak ada HTML, tidak ada nilai input.
EXTRACT_STRUCTURE = """
() => {
  const rectOf = (el) => {
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
  };
  const textOf = (el) => {
    const t = (el.innerText || '').trim().split('\\n')[0] || '';
    return t.length < 80 ? t : t.slice(0, 80);
  };

  const tables = Array.from(document.querySelectorAll('table')).map((el) => {
    const rows = el.querySelectorAll('tr');
    const headerCells = rows[0] ? rows[0].querySelectorAll('th, td').length : 0;
    const columns = headerCells || (rows[0] ? rows[0].querySelectorAll('td').length : 0);
    return {
      type: 'table',
      label: textOf(el) || 'Tabel',
      headers: Array.from((rows[0] || el).querySelectorAll('th, td')).map((c) => textOf(c)).filter(Boolean).slice(0, 12),
      row_count: Math.max(0, rows.length - 1),
      column_count: columns,
      box: rectOf(el),
    };
  });

  const headings = Array.from(document.querySelectorAll('h1, h2, h3')).map((el) => ({
    type: 'heading',
    label: textOf(el),
    level: Number(el.tagName.slice(1)),
    box: rectOf(el),
  })).filter((h) => h.label);

  const forms = Array.from(document.querySelectorAll('form')).map((el) => ({
    type: 'form',
    label: textOf(el) || 'Form',
    field_count: el.querySelectorAll('input, select, textarea').length,
    box: rectOf(el),
  }));

  const navs = Array.from(document.querySelectorAll('nav')).map((el) => ({
    type: 'nav',
    label: textOf(el) || 'Navigasi',
    item_count: el.querySelectorAll('a, button').length,
    box: rectOf(el),
  }));

  const cards = Array.from(document.querySelectorAll(
    '[class*="card"], [class*="panel"], article, section'
  )).filter((el) => {
    const r = el.getBoundingClientRect();
    return r.width > 120 && r.height > 60 && r.width < 1400 && r.height < 700;
  }).slice(0, 40).map((el) => ({
    type: 'card',
    label: textOf(el) || null,
    box: rectOf(el),
  }));

  const images = Array.from(document.querySelectorAll('img')).filter((el) => {
    const r = el.getBoundingClientRect();
    return r.width >= 80 && r.height >= 60;
  }).slice(0, 20).map((el) => ({
    type: 'image',
    label: el.getAttribute('alt') || null,
    box: rectOf(el),
  }));

  return { tables, headings, forms, navs, cards, images };
}
"""


class BrowserManager:
    """Mengelola satu sesi browser pada satu waktu."""

    def __init__(self) -> None:
        self._playwright: Any = None
        self._browser: Browser | None = None
        self._context: BrowserContext | None = None
        self._page: Page | None = None
        self.session: Session | None = None

    # ---------- siklus hidup ----------

    def start(
        self,
        url: str,
        viewport_width: int | None = None,
        viewport_height: int | None = None,
        allowed_hosts: list[str] | None = None,
    ) -> Session:
        if self.session and self.session.status in {"active", "paused"}:
            raise CaptureError("Sesi capture sudah berjalan. Hentikan dulu sebelum memulai yang baru.")

        hosts = [h.strip().lower() for h in (allowed_hosts or []) if h.strip()]
        if not hosts:
            raise CaptureError(
                "Tidak ada host yang diotorisasi. Isi allowlist aplikasi sumber lebih dulu."
            )

        parsed = urlparse(url)
        if parsed.scheme not in {"http", "https"}:
            raise CaptureError("URL harus http atau https.")
        host = (parsed.hostname or "").lower()
        if host not in hosts:
            raise CaptureError(
                f"Host '{host}' tidak ada di allowlist sesi ini. Izin hanya untuk: {', '.join(hosts)}"
            )

        self._playwright = sync_playwright().start()
        self._browser = self._playwright.chromium.launch(headless=settings.headless)
        self._context = self._browser.new_context(
            viewport={
                "width": viewport_width or settings.default_viewport_width,
                "height": viewport_height or settings.default_viewport_height,
            },
            # Jangan pernah memuat state login milik siapa pun.
            storage_state=None,
        )
        self._context.add_init_script(INIT_SCRIPT)

        page = self._context.new_page()
        self._guard_navigation(page, hosts)
        self._page = page

        self.session = Session(id=f"cap_{int(time.time() * 1000)}", allowed_hosts=hosts)
        page.goto(url, wait_until="domcontentloaded")
        self.session.url = page.url
        return self.session

    def _guard_navigation(self, page: Page, hosts: list[str]) -> None:
        """Blokir navigasi ke host di luar allowlist (frame utama saja)."""

        def handler(route, request) -> None:  # type: ignore[no-untyped-def]
            if request.is_navigation_request() and request.frame == page.main_frame:
                host = (urlparse(request.url).hostname or "").lower()
                if host and host not in hosts:
                    raise CaptureError(
                        f"Navigasi ke '{host}' diblokir. Sesi ini hanya boleh membuka: "
                        f"{', '.join(hosts)}"
                    )
            route.continue_()

        page.route("**/*", handler)

    def pause(self) -> Session:
        self._require_session()
        assert self.session is not None
        self.session.status = "paused"
        return self.session

    def resume(self) -> Session:
        self._require_session()
        assert self.session is not None
        self.session.status = "active"
        return self.session

    def stop(self) -> Session:
        self._require_session()
        assert self.session is not None
        for closer in (self._context, self._browser):
            try:
                if closer:
                    closer.close()
            except Exception:  # noqa: BLE001 - tutup browser tidak boleh menggagalkan stop
                pass
        try:
            if self._playwright:
                self._playwright.stop()
        except Exception:  # noqa: BLE001
            pass
        self._playwright = None
        self._browser = None
        self._context = None
        self._page = None
        self.session.status = "stopped"
        return self.session

    def _require_session(self) -> None:
        if self.session is None or self._page is None:
            raise CaptureError("Belum ada sesi capture yang aktif.")

    # ---------- pengambilan data ----------

    def capture(self, label: str, full_page: bool = False, relative_dir: str = "captures") -> dict[str, Any]:
        self._require_session()
        assert self.session is not None and self._page is not None
        if self.session.status == "paused":
            raise CaptureError("Sesi sedang di-pause. Lanjutkan dulu sebelum mengambil screenshot.")

        page = self._page
        page.bring_to_front()

        elements = page.evaluate(EXTRACT_ELEMENTS, settings.max_elements_per_page)
        structure = page.evaluate(EXTRACT_STRUCTURE)
        page_events = page.evaluate("() => (window.__nigmasim && window.__nigmasim.events) || []")
        page.evaluate("() => { if (window.__nigmasim) window.__nigmasim.events = []; }")

        for ev in page_events:
            self.session.events.append(
                RecordedEvent(
                    action=ev.get("action", "unknown"),
                    label=ev.get("label"),
                    tag=ev.get("tag"),
                    page_url=page.url,
                    at=ev.get("at", time.time() * 1000) / 1000,
                )
            )

        png = page.screenshot(full_page=full_page, type="png")
        digest = hashlib.sha256(png).hexdigest()

        target_dir = _safe_join(settings.storage_path, relative_dir)
        target_dir.mkdir(parents=True, exist_ok=True)
        safe_label = "".join(c if c.isalnum() or c in "-_" else "_" for c in label)[:60] or "screen"
        file_path = target_dir / f"{safe_label}-{digest[:8]}.png"
        file_path.write_bytes(png)

        meta = {
            "url": page.url,
            "title": page.title(),
            "viewport": {
                "width": settings.default_viewport_width,
                "height": settings.default_viewport_height,
            },
            "full_page": full_page,
            "captured_at": time.time(),
            "sha256": digest,
            "file_path": str(file_path),
            "file_name": file_path.name,
            "elements": elements,
            "structure": structure,
            "interactions": [e.as_dict() for e in self.session.events],
        }
        self.session.last_capture = {
            "file_name": file_path.name,
            "url": meta["url"],
            "title": meta["title"],
            "captured_at": meta["captured_at"],
        }
        return meta

    def state(self) -> dict[str, Any]:
        if self.session is None:
            return {"status": "idle", "session_id": None}
        data = self.session.as_dict()
        if self._page is not None and self.session.status != "stopped":
            try:
                data["current_url"] = self._page.url
                data["current_title"] = self._page.title()
            except Exception:  # noqa: BLE001
                pass
        return data


def _safe_join(root: Path, relative: str) -> Path:
    """Gabungkan path relatif dan pastikan tetap di dalam root."""
    root = root.resolve()
    candidate = (root / relative).resolve()
    if not str(candidate).startswith(str(root)):
        raise CaptureError("Path penyimpanan di luar storage root.")
    return candidate


manager = BrowserManager()
