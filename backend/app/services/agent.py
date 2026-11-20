"""AI Agent Service — loop percakapan dengan tool calling via NVIDIA NIM."""

from __future__ import annotations

import json
import logging
import time
from collections import defaultdict
from dataclasses import dataclass
from typing import Any

import httpx
from fastapi import HTTPException, Request
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.session import SessionLocal
from app.schemas.agent import AgentMessage, AgentRequest, AgentResponse, ToolDefinition
from app.services.agent_tools import execute_tool, get_tool_definitions

logger = logging.getLogger("nigmasim.agent")


# ============================================================
# RATE LIMITING (in-memory, per user/IP)
# ============================================================

_rate_limit_buckets: dict[str, list[float]] = defaultdict(list)


def check_rate_limit(identifier: str) -> None:
    """Raise HTTPException jika rate limit terlampaui."""
    now = time.time()
    window_start = now - 60  # 1 menit
    bucket = _rate_limit_buckets[identifier]
    # Bersihkan request lama
    while bucket and bucket[0] < window_start:
        bucket.pop(0)
    if len(bucket) >= settings.agent_rate_limit_per_minute:
        raise HTTPException(
            status_code=429,
            detail="Terlalu banyak permintaan. Coba lagi sebentar.",
        )
    bucket.append(now)


# ============================================================
# SYSTEM PROMPT (Bahasa Indonesia)
# ============================================================

SYSTEM_PROMPT = """Anda adalah asisten AI untuk NigmaSim — platform simulasi aplikasi milik PT Nigmagrid Indo Nesia.

PERAN ANDA:
- Membantu pengguna memahami dan menavigasi data NigmaSim: aplikasi, project, screen, rekonstruksi UI, dan simulasi.
- Menjawab pertanyaan dengan memanggil tool yang tersedia.
- Menjelaskan konsep NigmaSim dalam bahasa Indonesia yang jelas.

BATASAN:
- HANYA boleh menggunakan tool yang disediakan (read-only).
- TIDAK boleh mengakses sistem di luar NigmaSim.
- TIDAK boleh mengubah/menghapus data (tool write tidak tersedia).
- Jika tidak yakin, jujur saja: "Saya tidak memiliki akses ke informasi itu."

GAYA JAWAB:
- Bahasa Indonesia, santun, singkat.
- Gunakan poin/bullet untuk daftar.
- Sertakan ID numerik bila merujuk entitas spesifik.
- Jika memanggil tool, jelaskan mengapa sebelum memanggil.

TOOL YANG TERSEDIA:
1. list_applications — cari aplikasi terdaftar
2. get_application — detail satu aplikasi
3. list_screens — daftar screen di project
4. get_screen_elements — elemen UI terdeteksi di screen
5. get_reconstruction — status draft rekonstruksi UI
6. get_simulation — info simulasi project

CONTOH ALUR:
User: "Aplikasi apa yang statusnya approved?"
→ Panggil list_applications(status="approved")
→ Jawab dengan daftar nama + ID.

User: "Detail screen 5"
→ Panggil get_screen_elements(screen_id=5)
→ Jawab ringkasan elemen.
"""


# ============================================================
# NVIDIA NIM CLIENT
# ============================================================

@dataclass
class NIMClient:
    api_key: str
    base_url: str
    model: str
    timeout: float = 60.0

    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

    async def chat_completion(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
        tool_choice: str | dict | None = "auto",
        stream: bool = False,
    ) -> dict[str, Any]:
        payload = {
            "model": self.model,
            "messages": messages,
            "temperature": 0.3,
            "max_tokens": 2048,
            "stream": stream,
        }
        if tools:
            payload["tools"] = tools
            payload["tool_choice"] = tool_choice

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            resp = await client.post(
                f"{self.base_url}/chat/completions",
                headers=self._headers(),
                json=payload,
            )
            if resp.status_code == 429:
                raise HTTPException(
                    status_code=429,
                    detail="AI sedang sibuk (rate limit NVIDIA). Coba lagi sebentar.",
                )
            if resp.status_code >= 400:
                logger.error("NIM error %s: %s", resp.status_code, resp.text)
                raise HTTPException(
                    status_code=502,
                    detail="Layanan AI sedang tidak tersedia. Coba lagi nanti.",
                )
            return resp.json()


# ============================================================
# AGENT SERVICE
# ============================================================

class AgentService:
    def __init__(self):
        if not settings.nvidia_api_key:
            raise RuntimeError("NVIDIA_API_KEY belum dikonfigurasi")
        self.client = NIMClient(
            api_key=settings.nvidia_api_key,
            base_url=settings.nvidia_base_url,
            model=settings.nvidia_model,
        )
        self.tool_defs = get_tool_definitions()

    def _build_messages(self, request: AgentRequest) -> list[dict[str, Any]]:
        """Convert AgentMessage list to OpenAI format, inject system prompt."""
        msgs = [{"role": "system", "content": SYSTEM_PROMPT}]
        for m in request.messages:
            msg: dict[str, Any] = {"role": m.role}
            if m.content is not None:
                msg["content"] = m.content
            if m.tool_calls:
                msg["tool_calls"] = m.tool_calls
            if m.tool_call_id:
                msg["tool_call_id"] = m.tool_call_id
            if m.name:
                msg["name"] = m.name
            msgs.append(msg)
        return msgs

    def _truncate_history(self, messages: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """Keep system prompt + last N messages to stay within context."""
        if len(messages) <= settings.agent_max_history_messages + 1:
            return messages
        # Keep system + last N
        return [messages[0]] + messages[-(settings.agent_max_history_messages):]

    async def run(self, request: AgentRequest, user_id: int, db: Session) -> AgentResponse:
        """Main agent loop: LLM → tool calls → LLM → ... → final answer."""
        messages = self._build_messages(request)
        messages = self._truncate_history(messages)

        rounds = 0
        total_usage = {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}

        while rounds < settings.agent_max_rounds:
            rounds += 1

            resp_data = await self.client.chat_completion(
                messages=messages,
                tools=self.tool_defs,
                tool_choice="auto",
                stream=False,
            )

            choice = resp_data["choices"][0]
            msg = choice["message"]

            # Accumulate usage
            if "usage" in resp_data:
                u = resp_data["usage"]
                total_usage["prompt_tokens"] += u.get("prompt_tokens", 0)
                total_usage["completion_tokens"] += u.get("completion_tokens", 0)
                total_usage["total_tokens"] += u.get("total_tokens", 0)

            # If no tool calls → final answer
            if not msg.get("tool_calls"):
                return AgentResponse(
                    message=AgentMessage(role="assistant", content=msg.get("content", "")),
                    usage=total_usage,
                )

            # Execute tool calls
            messages.append(msg)  # Add assistant message with tool_calls

            for tc in msg["tool_calls"]:
                fn_name = tc["function"]["name"]
                fn_args = json.loads(tc["function"]["arguments"])

                logger.info("Agent tool call: %s(%s)", fn_name, fn_args)

                result = execute_tool(fn_name, db, fn_args)

                # Add tool result message
                messages.append({
                    "role": "tool",
                    "tool_call_id": tc["id"],
                    "name": fn_name,
                    "content": json.dumps(result, ensure_ascii=False, default=str),
                })

        # Max rounds reached
        return AgentResponse(
            message=AgentMessage(
                role="assistant",
                content="Maaf, percakapan terlalu panjang. Coba ajukan pertanyaan yang lebih spesifik.",
            ),
            usage=total_usage,
        )


# Singleton
_agent_service: AgentService | None = None


def get_agent_service() -> AgentService:
    global _agent_service
    if _agent_service is None:
        _agent_service = AgentService()
    return _agent_service