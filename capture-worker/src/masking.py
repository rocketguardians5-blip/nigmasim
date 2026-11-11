"""Masking region sensitif pada screenshot.

Data pribadi harus disamarkan SEBELUM aset dipakai. File asli tetap privat di
storage; yang disajikan ke antarmuka adalah versi yang sudah disamarkan.
"""

from __future__ import annotations

import io

from PIL import Image, ImageDraw


def redact(image_bytes: bytes, boxes: list[dict]) -> bytes:
    """Tutup region dengan kotak solid gelap.

    `boxes` berisi {"x", "y", "w", "h"} dalam piksel absolut.
    """
    if not boxes:
        return image_bytes

    image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    draw = ImageDraw.Draw(image)

    for box in boxes:
        x = int(box.get("x", 0))
        y = int(box.get("y", 0))
        w = int(box.get("w", 0))
        h = int(box.get("h", 0))
        if w <= 0 or h <= 0:
            continue
        # Sedikit melebar agar tepi teks tidak bocor.
        pad = 2
        draw.rectangle(
            [max(0, x - pad), max(0, y - pad), min(image.width, x + w + pad), min(image.height, y + h + pad)],
            fill=(17, 24, 39),
        )

    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def image_size(image_bytes: bytes) -> dict[str, int]:
    image = Image.open(io.BytesIO(image_bytes))
    return {"width": image.width, "height": image.height}
