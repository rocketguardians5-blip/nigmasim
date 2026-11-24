import json
import sys
from pathlib import Path

src_dir = str(Path(__file__).resolve().parent.parent / "src")
if src_dir not in sys.path:
    sys.path.insert(0, src_dir)

import pytest
from playwright.sync_api import sync_playwright

from browser import VISUAL_EXTRACT_SCRIPT, _prune_visual_tree


def test_visual_tree_extraction_login_fixture():
    """Ekstraksi visual tree dari fixture halaman login sintetis."""
    html_content = """
    <!DOCTYPE html>
    <html lang="id">
    <head>
      <meta charset="utf-8">
      <title>Masuk - NigmaSim Portal</title>
      <style>
        body {
          margin: 0;
          background-color: rgb(241, 245, 249);
          font-family: Inter, sans-serif;
          display: flex;
          justify-content: center;
          align-items: center;
          min-height: 100vh;
        }
        .card {
          box-sizing: border-box;
          background-color: rgb(255, 255, 255);
          border-radius: 12px;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
          padding: 24px;
          width: 380px;
        }
        h1.login-title {
          font-size: 24px;
          font-weight: 700;
          color: rgb(15, 23, 42);
          margin: 0 0 8px 0;
        }
        p.subtitle {
          font-size: 14px;
          color: rgb(100, 116, 139);
          margin: 0 0 20px 0;
        }
        .form-group {
          margin-bottom: 16px;
        }
        label {
          display: block;
          font-size: 13px;
          font-weight: 600;
          color: rgb(51, 65, 85);
          margin-bottom: 6px;
        }
        input[type="email"], input[type="password"] {
          width: 100%;
          box-sizing: border-box;
          height: 40px;
          padding: 8px 12px;
          border: 1px solid rgb(203, 213, 225);
          border-radius: 6px;
          font-size: 14px;
        }
        .row-options {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 20px;
          font-size: 13px;
        }
        a.forgot-link {
          color: rgb(37, 99, 235);
          text-decoration: none;
        }
        button.btn-submit {
          width: 100%;
          height: 44px;
          background-color: rgb(37, 99, 235);
          color: rgb(255, 255, 255);
          font-weight: 600;
          font-size: 15px;
          border: none;
          border-radius: 8px;
          cursor: pointer;
        }
        .footer-text {
          margin-top: 24px;
          text-align: center;
          font-size: 12px;
          color: rgb(148, 163, 184);
        }
      </style>
    </head>
    <body>
      <div class="card" id="login-card">
        <div class="logo-box">
          <svg class="brand-logo" width="40" height="40" viewBox="0 0 24 24" fill="none">
            <path d="M12 2L2 7l10 5 10-5-10-5z" stroke="rgb(37, 99, 235)" stroke-width="2"/>
          </svg>
        </div>
        <h1 class="login-title">Masuk ke Portal</h1>
        <p class="subtitle">Silakan masukkan kredensial Anda</p>
        <form id="login-form">
          <div class="form-group">
            <label for="inp-email">Email Pengguna</label>
            <input type="email" id="inp-email" placeholder="nama@perusahaan.com" value="superadmin@rahasia-perusahaan.com">
          </div>
          <div class="form-group" style="position: relative;">
            <label for="inp-pass">Kata Sandi</label>
            <input type="password" id="inp-pass" placeholder="Minimal 8 karakter" value="RahasiaKunci123!@#">
            <button type="button" class="eye-toggle" style="position: absolute; right: 8px; top: 32px; background: none; border: none; cursor: pointer;">
              <svg width="20" height="20" viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/></svg>
            </button>
          </div>
          <div class="row-options">
            <label style="display: inline-flex; align-items: center; margin: 0; font-weight: normal;">
              <input type="checkbox" id="chk-remember" style="margin-right: 6px;">
              Ingat Saya
            </label>
            <a href="/reset-password" class="forgot-link">Lupa Password?</a>
          </div>
          <button type="submit" class="btn-submit">Masuk</button>
        </form>
        <div class="footer-text">Hak Cipta 2026 NigmaSim</div>
      </div>
    </body>
    </html>
    """

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1280, "height": 800})
        page.set_content(html_content)

        raw_visual = page.evaluate(VISUAL_EXTRACT_SCRIPT)
        browser.close()

    visual = _prune_visual_tree(raw_visual)

    # Validasi struktur umum
    assert "viewport" in visual
    assert "page" in visual
    assert "nodes" in visual
    assert visual["viewport"]["w"] == 1280
    assert visual["viewport"]["h"] == 800
    assert "rgb(241, 245, 249)" in visual["page"]["backgroundColor"]

    nodes = visual["nodes"]
    assert len(nodes) > 0
    assert len(nodes) <= 150

    json_str = json.dumps(visual, ensure_ascii=True)
    json_bytes = len(json_str.encode("utf-8"))
    assert json_bytes <= 60000

    # 1. Pastikan value sensitif TIDAK muncul di mana pun dalam JSON visual tree
    assert "superadmin@rahasia-perusahaan.com" not in json_str, "Email sensitif bocor ke visual tree!"
    assert "RahasiaKunci123!@#" not in json_str, "Password sensitif bocor ke visual tree!"

    # 2. Cari node judul h1
    h1_node = next((n for n in nodes if n.get("tag") == "h1"), None)
    assert h1_node is not None, "Node h1 tidak ditemukan!"
    assert h1_node["text"] == "Masuk ke Portal"
    h1_style = h1_node.get("style", {})
    assert h1_style.get("fontSize") == "24px"
    assert h1_style.get("fontWeight") == "700"
    assert h1_style.get("color") == "rgb(15, 23, 42)"

    # 3. Cari kartu login
    card_node = next((n for n in nodes if n.get("style", {}).get("borderRadius") == "12px"), None)
    assert card_node is not None, "Node kartu login tidak ditemukan!"
    card_style = card_node.get("style", {})
    assert card_style.get("borderRadius") == "12px"
    assert "rgba(0, 0, 0, 0.1)" in card_style.get("boxShadow", "")
    assert card_node.get("box", {}).get("w") == 380

    # 4. Cari tombol submit
    submit_node = next((n for n in nodes if n.get("tag") == "button" and n.get("text") == "Masuk"), None)
    assert submit_node is not None, "Node tombol submit tidak ditemukan!"
    submit_style = submit_node.get("style", {})
    assert submit_style.get("backgroundColor") == "rgb(37, 99, 235)"
    assert submit_style.get("borderRadius") == "8px"

    # 5. Cari input email dan password untuk cek placeholder
    email_node = next((n for n in nodes if n.get("tag") == "input" and n.get("inputType") == "email"), None)
    assert email_node is not None, "Input email tidak ditemukan!"
    assert email_node.get("placeholder") == "nama@perusahaan.com"
    assert email_node.get("text") is None, "Input email tidak boleh punya text/value!"

    # 6. Cari SVG logo
    svg_nodes = [n for n in nodes if n.get("tag") == "svg"]
    assert len(svg_nodes) >= 1, "SVG logo tidak ditemukan!"
    logo_svg = svg_nodes[0].get("icon", {}).get("svg")
    assert logo_svg is not None
    assert "<svg" in logo_svg
    assert "viewBox" in logo_svg

    # 7. Pastikan nilai default (rgba(0,0,0,0), none, 0px border) tidak tersimpan di style
    for n in nodes:
        s = n.get("style", {})
        assert s.get("backgroundColor") != "rgba(0, 0, 0, 0)"
        assert s.get("borderStyle") != "none"
        assert s.get("boxShadow") != "none"
        assert s.get("borderRadius") != "0px"
