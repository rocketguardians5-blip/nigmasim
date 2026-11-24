import sys
from pathlib import Path

# Tambahkan src ke sys.path
src_dir = str(Path(__file__).resolve().parent.parent / "src")
if src_dir not in sys.path:
    sys.path.insert(0, src_dir)

import pytest
from playwright.sync_api import sync_playwright

from detector import detect_interactive_elements


def test_sensitive_input_values_are_not_recorded_as_labels():
    """Nilai input sensitif (email, password, tel, dll) tidak boleh terekam sebagai label."""
    html_content = """
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Login Test</title>
      <style>
        body { margin: 20px; font-family: sans-serif; }
        input { display: block; margin: 10px 0; width: 300px; height: 50px; }
      </style>
    </head>
    <body>
      <form>
        <input type="email" id="email" value="rahasia@contoh.com">
        <input type="password" id="pwd" value="Rahasia123">
        <input type="text" id="tel" value="08123456789">
        <input type="hidden" id="token" value="secret-csrf-token">
        <textarea id="bio">Teks privat rahasia</textarea>
        <input type="submit" id="submit-btn" value="Masuk">
      </form>
    </body>
    </html>
    """

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1000, "height": 600})
        page.set_content(html_content)

        elements = detect_interactive_elements(page)
        browser.close()

    labels = [e.label for e in elements if e.label is not None]
    all_serialized = " ".join(f"{e.label} {e.id} {e.selector}" for e in elements)

    # 1. Pastikan value rahasia TIDAK muncul sama sekali di label maupun metadata
    assert "rahasia@contoh.com" not in all_serialized, "Email sensitif bocor ke label/metadata!"
    assert "Rahasia123" not in all_serialized, "Password sensitif bocor ke label/metadata!"
    assert "08123456789" not in all_serialized, "Nomor telepon sensitif bocor ke label/metadata!"
    assert "secret-csrf-token" not in all_serialized, "Token CSRF sensitif bocor ke label/metadata!"
    assert "Teks privat rahasia" not in all_serialized, "Textarea privat bocor ke label/metadata!"

    # 2. Pastikan tombol submit tetap menggunakan value-nya sebagai label teks tombol
    assert "Masuk" in labels, "Tombol submit tidak menemukan label 'Masuk'!"
