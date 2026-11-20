"""Deteksi sesi Windows (SessionId) proses Capture Worker.

Dipakai untuk membuktikan bahwa worker berjalan di sesi interaktif desktop
operator (SessionId != 0 dan punya window station), sehingga jendela Chromium
yang dibuka Playwright benar-benar tampil di layar operator — bukan di sesi
lain (mis. sesi 0 milik shell agen / proses latar belakang).
"""

from __future__ import annotations

import ctypes
import os
from typing import Any

TH32CS_SNAPPROCESS = 0x00000002
INVALID_HANDLE_VALUE = ctypes.c_void_p(-1).value

BROWSER_EXE_NAMES = {"chrome.exe", "msedge.exe", "chromium.exe"}


class PROCESSENTRY32W(ctypes.Structure):
    _fields_ = [
        ("dwSize", ctypes.c_ulong),
        ("cntUsage", ctypes.c_ulong),
        ("th32ProcessID", ctypes.c_ulong),
        ("th32DefaultHeapID", ctypes.c_void_p),
        ("th32ModuleID", ctypes.c_ulong),
        ("cntThreads", ctypes.c_ulong),
        ("th32ParentProcessID", ctypes.c_ulong),
        ("pcPriClassBase", ctypes.c_long),
        ("dwFlags", ctypes.c_ulong),
        ("szExeFile", ctypes.c_wchar * 260),
    ]


def _kernel32() -> Any:
    k = ctypes.windll.kernel32
    k.CreateToolhelp32Snapshot.restype = ctypes.c_void_p
    k.CreateToolhelp32Snapshot.argtypes = [ctypes.c_ulong, ctypes.c_ulong]
    k.Process32FirstW.argtypes = [ctypes.c_void_p, ctypes.POINTER(PROCESSENTRY32W)]
    k.Process32NextW.argtypes = [ctypes.c_void_p, ctypes.POINTER(PROCESSENTRY32W)]
    k.CloseHandle.argtypes = [ctypes.c_void_p]
    k.ProcessIdToSessionId.restype = ctypes.c_int
    k.ProcessIdToSessionId.argtypes = [ctypes.c_ulong, ctypes.POINTER(ctypes.c_ulong)]
    return k


def session_id_of_pid(pid: int) -> int | None:
    """SessionId Windows dari sebuah PID (via ProcessIdToSessionId)."""
    if os.name != "nt":
        return None
    try:
        sid = ctypes.c_ulong(0)
        if _kernel32().ProcessIdToSessionId(ctypes.c_ulong(pid), ctypes.byref(sid)):
            return int(sid.value)
    except Exception:
        pass
    return None


def current_session_id() -> int | None:
    """SessionId Windows dari proses worker itu sendiri."""
    return session_id_of_pid(os.getpid())


def _has_window_station() -> bool:
    """True kalau proses punya window station sehingga bisa membuat jendela."""
    if os.name != "nt":
        return True
    try:
        user32 = ctypes.windll.user32
        user32.GetProcessWindowStation.restype = ctypes.c_void_p
        return bool(user32.GetProcessWindowStation())
    except Exception:
        return False


def _snapshot_processes() -> list[tuple[int, int, str]]:
    """Daftar (pid, parent_pid, nama_exe) semua proses yang berjalan."""
    if os.name != "nt":
        return []
    try:
        kernel32 = _kernel32()
        snap = kernel32.CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0)
        if not snap or snap == INVALID_HANDLE_VALUE:
            return []
        try:
            entry = PROCESSENTRY32W()
            entry.dwSize = ctypes.sizeof(PROCESSENTRY32W)
            if not kernel32.Process32FirstW(snap, ctypes.byref(entry)):
                return []
            out: list[tuple[int, int, str]] = []
            while True:
                out.append((int(entry.th32ProcessID), int(entry.th32ParentProcessID), entry.szExeFile))
                if not kernel32.Process32NextW(snap, ctypes.byref(entry)):
                    break
            return out
        finally:
            kernel32.CloseHandle(snap)
    except Exception:
        return []


def descendants(pid: int) -> list[dict[str, Any]]:
    """Semua proses turunan (rekursif) dari sebuah PID."""
    children: dict[int, list[tuple[int, str]]] = {}
    for p, parent, name in _snapshot_processes():
        children.setdefault(parent, []).append((p, name))
    out: list[dict[str, Any]] = []
    stack = [pid]
    seen = {pid}
    while stack:
        current = stack.pop()
        for child_pid, name in children.get(current, []):
            if child_pid in seen:
                continue
            seen.add(child_pid)
            out.append({"pid": child_pid, "name": name})
            stack.append(child_pid)
    return out


def process_info() -> dict[str, Any]:
    """Info sesi worker: SessionId proses + daftar proses browser yang dibuatnya.

    - windows_session_id: SessionId proses worker (0 = sesi layanan, tanpa desktop).
    - interactive: True kalau worker bisa menampilkan jendela di layar operator.
    - browser_children: proses chrome.exe/msedge.exe turunan worker beserta SessionId-nya.
    """
    sid = current_session_id()
    if os.name != "nt":
        interactive = True
    else:
        interactive = sid is not None and sid != 0 and _has_window_station()

    browser_children: list[dict[str, Any]] = []
    for proc in descendants(os.getpid()):
        if proc["name"].lower() in BROWSER_EXE_NAMES:
            browser_children.append(
                {
                    "pid": proc["pid"],
                    "name": proc["name"],
                    "windows_session_id": session_id_of_pid(proc["pid"]),
                }
            )

    return {
        "pid": os.getpid(),
        "windows_session_id": sid,
        "interactive": bool(interactive),
        "browser_children": browser_children,
    }
