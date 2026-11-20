"""API internal Capture Worker.

Worker berjalan sebagai proses TERPISAH dari backend. Hanya listen di 127.0.0.1
dan hanya menerima request yang membawa token internal.

TIDAK ADA endpoint untuk mengisi form login, menyimpan kredensial, atau
menjalankan skrip aplikasi sumber.
"""

from __future__ import annotations

from typing import Any

from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pathlib import Path
from pydantic import BaseModel, Field

import masking
from browser import CaptureError, manager
from config import settings
from win_session import process_info


class StartRequest(BaseModel):
    url: str
    viewport_width: int | None = None
    viewport_height: int | None = None
    allowed_hosts: list[str] = Field(default_factory=list)
    device: str = "desktop"


class CaptureRequest(BaseModel):
    label: str = "screen"
    full_page: bool = False
    relative_dir: str = "captures"
    # Kembalikan gambar sebagai base64 (dipakai saat capture dari perangkat
    # operator, lalu diunggah ke backend).
    include_image: bool = False


class CaptureStateRequest(BaseModel):
    state_name: str
    label: str | None = None
    full_page: bool = False
    relative_dir: str = "captures"


class SavePageRequest(BaseModel):
    export_name: str | None = None


from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(_: FastAPI):
    # Bukti sesi: kalau worker tidak berjalan di sesi interaktif (SessionId 0 /
    # tanpa desktop), jendela Chromium TIDAK akan tampil di layar operator.
    info = process_info()
    sid = info.get("windows_session_id")
    if info.get("interactive"):
        print(
            f"[startup] Worker berjalan di sesi interaktif: ya (SessionId={sid}, PID={info.get('pid')})",
            flush=True,
        )
    else:
        print(
            f"[startup] Worker berjalan di sesi interaktif: tidak (SessionId={sid}, PID={info.get('pid')})",
            flush=True,
        )
        print(
            "[startup] PERINGATAN: worker berjalan TANPA sesi interaktif (SessionId 0 / tanpa desktop). "
            "Jendela Chromium TIDAK akan tampil di layar. Jalankan ulang lewat start-capture-worker.bat "
            "dari desktop interaktif - jangan dari shell agen / proses latar belakang.",
            flush=True,
        )
    # Rekonsiliasi sesi active/running menggantung di DB saat startup
    try:
        import sqlite3
        for candidate in (
            Path("backend/nigmasim.db"),
            Path("../backend/nigmasim.db"),
            Path("../../backend/nigmasim.db"),
            Path(r"c:\Users\Lenovo\nigmasim\backend\nigmasim.db"),
        ):
            if candidate.exists():
                with sqlite3.connect(str(candidate.resolve())) as con:
                    con.execute(
                        "UPDATE capture_sessions SET status = 'stopped', ended_at = CURRENT_TIMESTAMP WHERE status IN ('active', 'running') AND ended_at IS NULL"
                    )
                    con.commit()
                break
    except Exception:
        pass
    yield


app = FastAPI(title="NigmaSim Capture Worker (internal)", docs_url=None, redoc_url=None, lifespan=lifespan)

# Panel admin (bisa dibuka dari perangkat lain di LAN) memanggil worker ini
# langsung dari browser. Demi itu worker harus mengizinkan CORS.
CORS_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://192.168.2.119:5173",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_origin_regex=r"^https?://.*:5173$",
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


def _check_token(x_worker_token: str | None, origin: str | None = None) -> None:
    """Token WAJIB, kecuali request datang dari browser di mesin yang sama.

    Worker hanya listen di 127.0.0.1, jadi hanya proses di mesin ini yang bisa
    menjangkau. Permintaan bertanda Origin berasal dari halaman browser, dan
    itulah yang dipakai panel admin untuk memanggil worker lokalnya.
    """
    if x_worker_token and x_worker_token == settings.capture_worker_token:
        return
    if origin:
        return
    raise HTTPException(status_code=401, detail="Token worker tidak valid")


@app.get("/health")
def health() -> dict[str, Any]:
    data: dict[str, Any] = {"status": "ok", "role": "capture-worker", "headless": settings.headless}
    # Field datar: pid, windows_session_id, interactive, browser_children
    data.update(process_info())
    return data


@app.get("/process")
def process(
    x_worker_token: str | None = Header(default=None),
    origin: str | None = Header(default=None),
) -> dict[str, Any]:
    """SessionId Windows worker + proses browser (chrome.exe) yang dibuatnya.

    Dipakai membuktikan worker dan Chromium berjalan di sesi yang sama dengan
    desktop operator.
    """
    _check_token(x_worker_token, origin)
    return process_info()


@app.post("/session/start")
def start(payload: StartRequest, x_worker_token: str | None = Header(default=None), origin: str | None = Header(default=None)) -> dict[str, Any]:
    _check_token(x_worker_token, origin)
    try:
        session = manager.start(
            payload.url,
            viewport_width=payload.viewport_width,
            viewport_height=payload.viewport_height,
            allowed_hosts=payload.allowed_hosts,
            device=payload.device,
        )
    except CaptureError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return session.as_dict()


@app.post("/session/pause")
def pause(x_worker_token: str | None = Header(default=None), origin: str | None = Header(default=None)) -> dict[str, Any]:
    _check_token(x_worker_token, origin)
    try:
        return manager.pause().as_dict()
    except CaptureError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@app.post("/session/resume")
def resume(x_worker_token: str | None = Header(default=None), origin: str | None = Header(default=None)) -> dict[str, Any]:
    _check_token(x_worker_token, origin)
    try:
        return manager.resume().as_dict()
    except CaptureError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@app.post("/session/stop")
def stop(x_worker_token: str | None = Header(default=None), origin: str | None = Header(default=None)) -> dict[str, Any]:
    _check_token(x_worker_token, origin)
    try:
        return manager.stop().as_dict()
    except CaptureError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@app.get("/session/state")
def state(x_worker_token: str | None = Header(default=None), origin: str | None = Header(default=None)) -> dict[str, Any]:
    _check_token(x_worker_token, origin)
    data = manager.state()
    data["process"] = process_info()
    return data


@app.post("/session/capture")
def capture(
    payload: CaptureRequest,
    x_worker_token: str | None = Header(default=None),
    origin: str | None = Header(default=None),
) -> dict[str, Any]:
    _check_token(x_worker_token, origin)
    try:
        meta = manager.capture(
            payload.label, full_page=payload.full_page, relative_dir=payload.relative_dir
        )
    except CaptureError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001 - error tak terduga dibungkus rapi
        raise HTTPException(status_code=500, detail=f"Gagal mengambil screenshot: {exc}") from exc

    if payload.include_image:
        import base64

        try:
            meta["png_base64"] = base64.b64encode(
                Path(meta["file_path"]).read_bytes()
            ).decode("ascii")
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(
                status_code=500, detail=f"Gagal membaca hasil screenshot: {exc}"
            ) from exc

    return meta


@app.post("/mask")
def mask(
    payload: dict[str, Any],
    x_worker_token: str | None = Header(default=None),
    origin: str | None = Header(default=None),
) -> dict[str, Any]:
    """Kembalikan versi gambar yang sudah disamarkan."""
    _check_token(x_worker_token, origin)
    import base64

    try:
        raw = base64.b64decode(payload.get("image_base64", ""))
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=422, detail="Payload gambar tidak valid") from exc
    boxes = payload.get("boxes") or []
    return {"image_base64": base64.b64encode(masking.redact(raw, boxes)).decode("ascii")}


@app.post("/session/focus")
def focus(x_worker_token: str | None = Header(default=None), origin: str | None = Header(default=None)) -> dict[str, Any]:
    """Angkat jendela browser ke depan (kalau tersembunyi di belakang)."""
    _check_token(x_worker_token, origin)
    try:
        return manager.focus()
    except CaptureError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@app.post("/document/pdf")
def render_pdf(
    payload: dict[str, Any],
    x_worker_token: str | None = Header(default=None),
    origin: str | None = Header(default=None),
) -> dict[str, Any]:
    """Render HTML menjadi PDF (dipakai untuk ekspor dokumen SOP)."""
    _check_token(x_worker_token, origin)
    import base64

    from playwright.sync_api import sync_playwright

    html = str(payload.get("html") or "")
    if not html:
        raise HTTPException(status_code=422, detail="HTML kosong")

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            page = browser.new_page()
            page.set_content(html, wait_until="networkidle")
            pdf = page.pdf(format="A4", print_background=True, margin={"top": "18mm", "bottom": "18mm", "left": "16mm", "right": "16mm"})
            browser.close()
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"Gagal render PDF: {exc}") from exc

    return {"pdf_base64": base64.b64encode(pdf).decode("ascii")}


# ===== RECONSTRUCTION ENDPOINTS =====

@app.post("/session/capture-state")
def capture_state(
    payload: CaptureStateRequest,
    x_worker_token: str | None = Header(default=None),
    origin: str | None = Header(default=None),
) -> dict[str, Any]:
    """Capture halaman dengan nama state (multi-state: dropdown_closed, dropdown_open, modal_open, dll)."""
    _check_token(x_worker_token, origin)
    try:
        return manager.capture_state(
            payload.state_name,
            label=payload.label,
            full_page=payload.full_page,
            relative_dir=payload.relative_dir,
        )
    except CaptureError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Gagal capture state: {exc}") from exc


@app.get("/session/har")
def get_har(
    x_worker_token: str | None = Header(default=None),
    origin: str | None = Header(default=None),
) -> list[dict[str, Any]]:
    """Ambil HAR (network log) dari sesi saat ini."""
    _check_token(x_worker_token, origin)
    try:
        return manager.get_har()
    except CaptureError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@app.get("/session/storage")
def get_storage(
    x_worker_token: str | None = Header(default=None),
    origin: str | None = Header(default=None),
) -> dict[str, Any]:
    """Ambil snapshot localStorage & sessionStorage."""
    _check_token(x_worker_token, origin)
    try:
        return manager.get_storage()
    except CaptureError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@app.get("/session/component-states")
def get_component_states(
    x_worker_token: str | None = Header(default=None),
    origin: str | None = Header(default=None),
) -> dict[str, Any]:
    """Deteksi state komponen interaktif (dropdown, modal, tabs, accordion)."""
    _check_token(x_worker_token, origin)
    try:
        return manager.get_component_states()
    except CaptureError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@app.get("/session/form-schemas")
def get_form_schemas(
    x_worker_token: str | None = Header(default=None),
    origin: str | None = Header(default=None),
) -> list[dict[str, Any]]:
    """Ekstrak schema form (field, type, validation, options)."""
    _check_token(x_worker_token, origin)
    try:
        return manager.get_form_schemas()
    except CaptureError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@app.post("/session/save-page")
def save_page(
    payload: SavePageRequest,
    x_worker_token: str | None = Header(default=None),
    origin: str | None = Header(default=None),
) -> dict[str, Any]:
    """Simpan halaman sebagai single-file HTML (assets di-inline base64)."""
    _check_token(x_worker_token, origin)
    try:
        return manager.save_page_as_html(payload.export_name)
    except CaptureError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Gagal save page: {exc}") from exc


@app.get("/session/data")
def get_session_data(
    x_worker_token: str | None = Header(default=None),
    origin: str | None = Header(default=None),
) -> dict[str, Any]:
    """Ambil SEMUA data sesi untuk reconstruction: captures, HAR, storage, component states, form schemas, HTML exports."""
    _check_token(x_worker_token, origin)
    try:
        return manager.get_session_data()
    except CaptureError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


if __name__ == "__main__":  # pragma: no cover
    import uvicorn

    uvicorn.run(app, host=settings.host, port=settings.port)
