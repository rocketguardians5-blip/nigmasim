"""Endpoint AI Agent: POST /api/v1/agent"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.config import settings
from app.db.session import get_db
from app.models.user import User
from app.schemas.agent import AgentRequest, AgentResponse
from app.services.agent import get_agent_service, check_rate_limit

router = APIRouter(prefix="/agent", tags=["agent"])


@router.post("", response_model=AgentResponse)
async def agent_chat(
    request: AgentRequest,
    http_request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AgentResponse:
    """
    Kirim percakapan ke AI Agent.

    - **messages**: Riwayat pesan (max 20, role: user/assistant/system/tool)
    - **stream**: Belum didukung (akan ditambah nanti)

    Rate limit: 10 req/menit per user.
    """
    # Rate limit per user
    check_rate_limit(f"user:{user.id}")

    # Validasi panjang input
    total_chars = sum(len(m.content or "") for m in request.messages)
    if total_chars > settings.agent_max_input_chars:
        raise HTTPException(
            status_code=400,
            detail=f"Input terlalu panjang (maks {settings.agent_max_input_chars} karakter).",
        )

    # Validasi role
    for m in request.messages:
        if m.role not in {"user", "assistant", "system", "tool"}:
            raise HTTPException(status_code=400, detail=f"Role tidak valid: {m.role}")

    # Pastikan pesan terakhir dari user (bukan tool/assistant)
    if request.messages and request.messages[-1].role != "user":
        raise HTTPException(status_code=400, detail="Pesan terakhir harus dari user")

    try:
        service = get_agent_service()
        response = await service.run(request, user.id, db)
        return response
    except HTTPException:
        raise
    except RuntimeError as e:
        if "NVIDIA_API_KEY" in str(e):
            raise HTTPException(
                status_code=503,
                detail="Fitur AI belum dikonfigurasi (NVIDIA_API_KEY tidak di-set). Hubungi administrator.",
            )
        raise
    except Exception as e:
        # Jangan bocorkan detail error internal
        import logging
        logging.getLogger("nigmasim.agent").exception("Agent error")
        raise HTTPException(
            status_code=500,
            detail="Terjadi kesalahan saat memproses permintaan. Coba lagi nanti.",
        )


@router.get("/tools")
async def list_agent_tools(
    user: User = Depends(get_current_user),
) -> dict[str, list[dict]]:
    """Daftar tool yang tersedia untuk agent (read-only)."""
    from app.services.agent_tools import get_tool_definitions
    return {"tools": get_tool_definitions()}