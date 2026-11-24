"""Manajemen sesi browser Playwright.

Aturan yang tidak boleh dilanggar:
- Browser selalu HEADED saat development: operator harus melihat dan login manual.
- Tidak ada kode yang mengisi form login.
- Navigasi dibatasi ke host yang diotorisasi untuk sesi tersebut.
- Nilai input yang diketik pengguna TIDAK PERNAH dicatat (bisa berupa kredensial).
"""

from __future__ import annotations

import hashlib
import json
import time
import base64
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from playwright.sync_api import Browser, BrowserContext, Page, sync_playwright

from config import settings
from detector import (
    DEFAULT_CONFIG,
    DetectedElement,
    detect_interactive_elements,
    generate_detection_report,
)


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
    # Multi-state captures: { state_name: capture_meta }
    captures: dict[str, dict[str, Any]] = field(default_factory=dict)
    # HAR entries accumulated during session
    har_entries: list[dict[str, Any]] = field(default_factory=list)
    # Component states detected
    component_states: dict[str, Any] = field(default_factory=dict)
    # Form schemas
    form_schemas: list[dict[str, Any]] = field(default_factory=list)
    # Storage snapshots
    storage_snapshots: list[dict[str, Any]] = field(default_factory=list)
    # Single-file HTML exports
    html_exports: dict[str, str] = field(default_factory=dict)

    def as_dict(self) -> dict[str, Any]:
        return {
            "session_id": self.id,
            "status": self.status,
            "started_at": self.started_at,
            "current_url": self.url,
            "allowed_hosts": self.allowed_hosts,
            "event_count": len(self.events),
            "last_capture": self.last_capture,
            "capture_states": list(self.captures.keys()),
            "har_count": len(self.har_entries),
            "component_states_count": len(self.component_states),
            "form_schemas_count": len(self.form_schemas),
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

# Skrip ekstraksi visual tree dan computed styles
VISUAL_EXTRACT_SCRIPT = """
() => {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const body = document.body;
  if (!body) return { viewport: { w: vw, h: vh }, page: {}, nodes: [], truncated: false };

  const bodyStyle = window.getComputedStyle(body);
  const pageBg = bodyStyle.backgroundColor || '';
  let pageBgImg = bodyStyle.backgroundImage || 'none';
  if (pageBgImg !== 'none' && pageBgImg.length > 100) {
    pageBgImg = pageBgImg.slice(0, 100);
  }
  const pageFont = bodyStyle.fontFamily || '';

  const ignoredTags = new Set([
    'SCRIPT', 'STYLE', 'NOSCRIPT', 'META', 'LINK', 'TEMPLATE',
    'DEFS', 'CLIPPATH', 'HEAD', 'TITLE', 'BR'
  ]);

  const cleanSvgString = (svgEl) => {
    try {
      const clone = svgEl.cloneNode(true);
      const scripts = clone.querySelectorAll('script');
      scripts.forEach(s => s.remove());
      const all = [clone, ...clone.querySelectorAll('*')];
      for (const node of all) {
        const attrs = Array.from(node.attributes || []);
        for (const attr of attrs) {
          if (attr.name.toLowerCase().startsWith('on') || attr.value.toLowerCase().includes('javascript:')) {
            node.removeAttribute(attr.name);
          }
        }
      }
      const raw = clone.outerHTML || '';
      return raw.length <= 4096 ? raw : raw.slice(0, 4096);
    } catch (e) {
      return null;
    }
  };

  const getDirectText = (el) => {
    let text = '';
    for (let i = 0; i < el.childNodes.length; i++) {
      const node = el.childNodes[i];
      if (node.nodeType === Node.TEXT_NODE) {
        text += node.textContent || '';
      }
    }
    text = text.trim().replace(/\\s+/g, ' ');
    if (!text) return null;
    return text.length > 120 ? text.slice(0, 120) : text;
  };

  const checkPseudo = (el) => {
    const res = {};
    for (const pseudo of ['::before', '::after']) {
      try {
        const ps = window.getComputedStyle(el, pseudo);
        const content = ps.getPropertyValue('content');
        if (content && content !== 'none' && content !== 'normal' && content !== '""' && content !== "''") {
          const item = { content: content.replace(/^["']|["']$/g, '') };
          if (ps.color && ps.color !== 'rgba(0, 0, 0, 0)') item.color = ps.color;
          res[pseudo.replace('::', '')] = item;
        }
      } catch (e) {}
    }
    return Object.keys(res).length > 0 ? res : null;
  };

  const extractStyle = (el, style) => {
    const s = {};
    // Color
    if (style.color && style.color !== 'rgba(0, 0, 0, 0)' && style.color !== 'transparent') {
      s.color = style.color;
    }
    // Background color
    if (style.backgroundColor && style.backgroundColor !== 'rgba(0, 0, 0, 0)' && style.backgroundColor !== 'transparent') {
      s.backgroundColor = style.backgroundColor;
    }
    // Font
    if (style.fontFamily) s.fontFamily = style.fontFamily;
    if (style.fontSize && style.fontSize !== '0px') s.fontSize = style.fontSize;
    if (style.fontWeight && style.fontWeight !== '400' && style.fontWeight !== 'normal') s.fontWeight = style.fontWeight;
    if (style.lineHeight && style.lineHeight !== 'normal') s.lineHeight = style.lineHeight;
    if (style.textAlign && style.textAlign !== 'start' && style.textAlign !== 'left') s.textAlign = style.textAlign;
    if (style.letterSpacing && style.letterSpacing !== 'normal' && style.letterSpacing !== '0px') s.letterSpacing = style.letterSpacing;

    // Borders
    const bStyle = style.borderStyle || 'none';
    if (bStyle && bStyle !== 'none' && bStyle !== 'hidden') {
      s.borderStyle = bStyle;
      if (style.borderTopWidth && style.borderTopWidth !== '0px') s.borderTopWidth = style.borderTopWidth;
      if (style.borderRightWidth && style.borderRightWidth !== '0px') s.borderRightWidth = style.borderRightWidth;
      if (style.borderBottomWidth && style.borderBottomWidth !== '0px') s.borderBottomWidth = style.borderBottomWidth;
      if (style.borderLeftWidth && style.borderLeftWidth !== '0px') s.borderLeftWidth = style.borderLeftWidth;
      if (style.borderColor && style.borderColor !== 'rgba(0, 0, 0, 0)') s.borderColor = style.borderColor;
    }
    if (style.borderRadius && style.borderRadius !== '0px') s.borderRadius = style.borderRadius;
    if (style.boxShadow && style.boxShadow !== 'none') s.boxShadow = style.boxShadow;

    // Padding
    if (style.paddingTop && style.paddingTop !== '0px') s.paddingTop = style.paddingTop;
    if (style.paddingRight && style.paddingRight !== '0px') s.paddingRight = style.paddingRight;
    if (style.paddingBottom && style.paddingBottom !== '0px') s.paddingBottom = style.paddingBottom;
    if (style.paddingLeft && style.paddingLeft !== '0px') s.paddingLeft = style.paddingLeft;

    // Layout
    const disp = style.display || 'inline';
    if (disp && disp !== 'inline' && disp !== 'block') {
      s.display = disp;
      if (disp.includes('flex')) {
        if (style.flexDirection && style.flexDirection !== 'row') s.flexDirection = style.flexDirection;
        if (style.justifyContent && style.justifyContent !== 'normal' && style.justifyContent !== 'flex-start') s.justifyContent = style.justifyContent;
        if (style.alignItems && style.alignItems !== 'normal' && style.alignItems !== 'stretch') s.alignItems = style.alignItems;
        if (style.gap && style.gap !== 'normal' && style.gap !== '0px') s.gap = style.gap;
      }
    }
    if (style.opacity && style.opacity !== '1') s.opacity = style.opacity;

    return s;
  };

  const rawNodes = [];
  let counter = 0;

  const walk = (el, parentId) => {
    if (!el || el.nodeType !== Node.ELEMENT_NODE) return;
    const tag = el.tagName.toUpperCase();
    if (ignoredTags.has(tag)) return;

    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return;

    const r = el.getBoundingClientRect();
    if (r.width <= 0 && r.height <= 0) return;

    const currentId = `n${counter++}`;
    const tagLower = el.tagName.toLowerCase();
    const role = el.getAttribute('role') || null;
    const isInput = tagLower === 'input';
    const isTextarea = tagLower === 'textarea';
    const inputType = isInput ? (el.getAttribute('type') || 'text').toLowerCase() : (isTextarea ? 'textarea' : null);

    let text = null;
    if (isInput) {
      if (inputType === 'submit' || inputType === 'button' || inputType === 'reset') {
        text = el.value || null;
      }
    } else if (tagLower === 'svg') {
      text = null;
    } else {
      text = getDirectText(el);
    }

    const placeholder = (isInput || isTextarea) ? (el.getAttribute('placeholder') || null) : null;

    let icon = null;
    if (tagLower === 'svg') {
      const svgStr = cleanSvgString(el);
      if (svgStr) icon = { svg: svgStr };
    } else if (tagLower === 'img') {
      const src = (el.getAttribute('src') || '').split('?')[0];
      const alt = el.getAttribute('alt') || null;
      if (src) icon = { img: { src, alt } };
    }

    const nodeStyle = extractStyle(el, style);

    if (inputType === 'checkbox' || tagLower === 'button' || (el.className && String(el.className).includes('eye'))) {
      const pseudo = checkPseudo(el);
      if (pseudo) nodeStyle.pseudo = pseudo;
    }

    rawNodes.push({
      id: currentId,
      parent: parentId,
      tag: tagLower,
      role: role,
      box: {
        x: Math.round(r.x + window.scrollX),
        y: Math.round(r.y + window.scrollY),
        w: Math.round(r.width),
        h: Math.round(r.height)
      },
      text: text,
      placeholder: placeholder,
      inputType: inputType,
      style: nodeStyle,
      icon: icon
    });

    if (tagLower !== 'svg') {
      for (let i = 0; i < el.children.length; i++) {
        walk(el.children[i], currentId);
      }
    }
  };

  walk(body, null);

  return {
    viewport: { w: vw, h: vh },
    page: {
      backgroundColor: pageBg,
      backgroundImage: pageBgImg,
      fontFamily: pageFont
    },
    nodes: rawNodes,
    truncated: false
  };
}
"""


def _prune_visual_tree(
    visual: dict[str, Any], max_nodes: int = 150, max_bytes: int = 60000
) -> dict[str, Any]:
    """Batasi node visual agar tidak melebihi 150 node dan 60 KB JSON."""
    if not isinstance(visual, dict):
        return visual
    nodes = visual.get("nodes", [])
    if not isinstance(nodes, list):
        return visual

    if len(nodes) <= max_nodes and len(json.dumps(visual, ensure_ascii=True)) <= max_bytes:
        return visual

    visual["truncated"] = True
    while (
        len(nodes) > max_nodes or len(json.dumps(visual, ensure_ascii=True)) > max_bytes
    ) and len(nodes) > 1:
        parent_ids = {n["parent"] for n in nodes if n.get("parent")}
        leaves = [n for n in nodes if n.get("id") not in parent_ids]
        if not leaves:
            nodes.pop()
        else:
            def _score(n: dict) -> tuple:
                has_input = 1 if n.get("inputType") else 0
                has_icon = 1 if n.get("icon") else 0
                has_text = 1 if n.get("text") else 0
                box = n.get("box", {})
                area = box.get("w", 0) * box.get("h", 0)
                return (has_input, has_icon, has_text, area)

            leaves.sort(key=_score)
            victim = leaves[0]
            nodes.remove(victim)

    visual["nodes"] = nodes
    return visual

# Skrip untuk capture HAR (network log) - request/response headers & body
EXTRACT_HAR = """
() => {
  const entries = window.__nigmasim_har || [];
  window.__nigmasim_har = [];
  return entries;
}
"""

# Skrip untuk inject HAR capture ke page
INJECT_HAR_CAPTURE = """
(() => {
  window.__nigmasim_har = window.__nigmasim_har || [];
  
  // Intercept fetch
  const originalFetch = window.fetch;
  window.fetch = async function(...args) {
    const startTime = Date.now();
    const requestUrl = args[0];
    const requestOptions = args[1] || {};
    const requestHeaders = {};
    if (requestOptions.headers) {
      if (requestOptions.headers instanceof Headers) {
        requestOptions.headers.forEach((v, k) => { requestHeaders[k] = v; });
      } else if (Array.isArray(requestOptions.headers)) {
        requestOptions.headers.forEach(([k, v]) => { requestHeaders[k] = v; });
      } else {
        Object.assign(requestHeaders, requestOptions.headers);
      }
    }
    
    let responseClone;
    try {
      const response = await originalFetch.apply(this, args);
      responseClone = response.clone();
      const responseHeaders = {};
      response.headers.forEach((v, k) => { responseHeaders[k] = v; });
      
      let responseBody;
      const contentType = responseHeaders['content-type'] || '';
      if (contentType.includes('application/json')) {
        responseBody = await responseClone.json().catch(() => null);
      } else if (contentType.includes('text/') || contentType.includes('application/javascript') || contentType.includes('application/xml')) {
        responseBody = await responseClone.text().catch(() => null);
      }
      
      window.__nigmasim_har.push({
        request: {
          url: requestUrl.toString ? requestUrl.toString() : String(requestUrl),
          method: requestOptions.method || 'GET',
          headers: requestHeaders,
          postData: requestOptions.body ? (typeof requestOptions.body === 'string' ? requestOptions.body : JSON.stringify(requestOptions.body).slice(0, 10000)) : null,
        },
        response: {
          status: response.status,
          statusText: response.statusText,
          headers: responseHeaders,
          body: responseBody,
        },
        timings: {
          duration: Date.now() - startTime,
        },
        startedDateTime: new Date(startTime).toISOString(),
      });
      return response;
    } catch (error) {
      window.__nigmasim_har.push({
        request: {
          url: requestUrl.toString ? requestUrl.toString() : String(requestUrl),
          method: requestOptions.method || 'GET',
          headers: requestHeaders,
          postData: requestOptions.body ? (typeof requestOptions.body === 'string' ? requestOptions.body : JSON.stringify(requestOptions.body).slice(0, 10000)) : null,
        },
        response: {
          status: 0,
          statusText: error.message,
          headers: {},
          body: null,
        },
        timings: { duration: Date.now() - startTime },
        startedDateTime: new Date(startTime).toISOString(),
        error: error.message,
      });
      throw error;
    }
  };
  
  // Intercept XHR
  const originalXHR = window.XMLHttpRequest;
  window.XMLHttpRequest = function() {
    const xhr = new originalXHR();
    const originalOpen = xhr.open;
    const originalSend = xhr.send;
    let requestData = { url: '', method: '', headers: {}, postData: null };
    
    xhr.open = function(method, url) {
      requestData.url = url;
      requestData.method = method;
      return originalOpen.apply(this, arguments);
    };
    
    xhr.setRequestHeader = function(key, value) {
      requestData.headers[key] = value;
      return originalXHR.prototype.setRequestHeader.apply(this, arguments);
    };
    
    xhr.send = function(body) {
      const startTime = Date.now();
      requestData.postData = body ? (typeof body === 'string' ? body : JSON.stringify(body).slice(0, 10000)) : null;
      
      const originalOnReadyStateChange = xhr.onreadystatechange;
      xhr.onreadystatechange = function() {
        if (xhr.readyState === 4) {
          const responseHeaders = {};
          const headerStr = xhr.getAllResponseHeaders();
          headerStr.split('\\n').forEach(line => {
            const idx = line.indexOf(':');
            if (idx > 0) {
              responseHeaders[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
            }
          });
          
          let responseBody;
          const contentType = responseHeaders['content-type'] || '';
          if (contentType.includes('application/json')) {
            try { responseBody = JSON.parse(xhr.responseText); } catch { responseBody = xhr.responseText; }
          } else if (contentType.includes('text/') || contentType.includes('application/javascript') || contentType.includes('application/xml')) {
            responseBody = xhr.responseText;
          }
          
          window.__nigmasim_har.push({
            request: requestData,
            response: {
              status: xhr.status,
              statusText: xhr.statusText,
              headers: responseHeaders,
              body: responseBody,
            },
            timings: { duration: Date.now() - startTime },
            startedDateTime: new Date(startTime).toISOString(),
          });
        }
        if (originalOnReadyStateChange) originalOnReadyStateChange.apply(this, arguments);
      };
      return originalSend.apply(this, arguments);
    };
    return xhr;
  };
})();
"""

# Skrip untuk capture localStorage & sessionStorage
EXTRACT_STORAGE = """
() => {
  const local = {};
  try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); local[k] = localStorage.getItem(k); } } catch {}
  const session = {};
  try { for (let i = 0; i < sessionStorage.length; i++) { const k = sessionStorage.key(i); session[k] = sessionStorage.getItem(k); } } catch {}
  return { localStorage: local, sessionStorage: session };
}
"""

# Skrip untuk save page as single HTML (inline assets)
SAVE_PAGE_AS_HTML = """
(async () => {
  // Clone document
  const clone = document.cloneNode(true);
  
  // Inline all stylesheets
  const styleLinks = Array.from(clone.querySelectorAll('link[rel="stylesheet"]'));
  for (const link of styleLinks) {
    try {
      const response = await fetch(link.href);
      if (response.ok) {
        const css = await response.text();
        const style = clone.createElement('style');
        style.textContent = css;
        link.replaceWith(style);
      }
    } catch {}
  }
  
  // Inline all scripts (non-module)
  const scripts = Array.from(clone.querySelectorAll('script[src]:not([type="module"])'));
  for (const script of scripts) {
    try {
      const response = await fetch(script.src);
      if (response.ok) {
        const js = await response.text();
        const newScript = clone.createElement('script');
        newScript.textContent = js;
        script.replaceWith(newScript);
      }
    } catch {}
  }
  
  // Inline images as base64
  const images = Array.from(clone.querySelectorAll('img[src]'));
  for (const img of images) {
    try {
      if (img.src.startsWith('data:')) continue;
      const response = await fetch(img.src);
      if (response.ok) {
        const blob = await response.blob();
        const reader = new FileReader();
        const base64 = await new Promise(resolve => {
          reader.onload = () => resolve(reader.result);
          reader.readAsDataURL(blob);
        });
        img.src = base64;
      }
    } catch {}
  }
  
  // Inline favicon
  const favicon = clone.querySelector('link[rel="icon"], link[rel="shortcut icon"]');
  if (favicon && favicon.href) {
    try {
      const response = await fetch(favicon.href);
      if (response.ok) {
        const blob = await response.blob();
        const reader = new FileReader();
        const base64 = await new Promise(resolve => {
          reader.onload = () => resolve(reader.result);
          reader.readAsDataURL(blob);
        });
        favicon.href = base64;
      }
    } catch {}
  }
  
  // Remove module scripts (can't inline easily) - replace with comment
  const moduleScripts = Array.from(clone.querySelectorAll('script[type="module"][src]'));
  for (const script of moduleScripts) {
    const comment = clone.createComment(`MODULE SCRIPT (external): ${script.src} - cannot be inlined`);
    script.replaceWith(comment);
  }
  
  // Add base tag for relative URLs
  const base = clone.createElement('base');
  base.href = window.location.origin + '/';
  const head = clone.querySelector('head');
  if (head) head.insertBefore(base, head.firstChild);
  
  // Serialize
  const doctype = '<!DOCTYPE html>';
  const html = clone.documentElement.outerHTML;
  return doctype + '\\n' + html;
})()
"""

# Skrip untuk detect component states (dropdown open/closed, modal, etc.)
EXTRACT_COMPONENT_STATES = """
() => {
  const states = {};
  
  // Find dropdowns/selects
  const dropdowns = document.querySelectorAll('[role="combobox"], [role="listbox"], select, .dropdown, [data-dropdown], [x-data*="open"]');
  dropdowns.forEach((el, i) => {
    const isOpen = el.getAttribute('aria-expanded') === 'true' || 
                   el.classList.contains('open') || 
                   el.classList.contains('show') ||
                   (el._x_dataStack && el._x_dataStack[0] && el._x_dataStack[0].open);
    states[`dropdown_${i}`] = {
      type: 'dropdown',
      selector: el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.className ? '.' + el.className.split(' ')[0] : ''),
      label: el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.innerText?.slice(0, 50) || `Dropdown ${i}`,
      isOpen: isOpen,
      options: Array.from(el.querySelectorAll('option, [role="option"]')).map(o => o.innerText.trim()).filter(Boolean),
      boundingBox: el.getBoundingClientRect()
    };
  });
  
  // Find modals
  const modals = document.querySelectorAll('[role="dialog"], .modal, [data-modal], [x-show*="modal"], [x-show*="open"]');
  modals.forEach((el, i) => {
    const isOpen = el.style.display !== 'none' && 
                   !el.classList.contains('hidden') && 
                   el.getAttribute('aria-hidden') !== 'true' &&
                   (el._x_dataStack && el._x_dataStack[0] && (el._x_dataStack[0].open || el._x_dataStack[0].show));
    states[`modal_${i}`] = {
      type: 'modal',
      selector: el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.className ? '.' + el.className.split(' ')[0] : ''),
      label: el.querySelector('h1,h2,h3,h4,[role="heading"]')?.innerText?.trim() || `Modal ${i}`,
      isOpen: isOpen,
      boundingBox: el.getBoundingClientRect()
    };
  });
  
  // Find tabs
  const tabs = document.querySelectorAll('[role="tablist"], .tabs, [data-tabs]');
  tabs.forEach((el, i) => {
    const panels = el.querySelectorAll('[role="tabpanel"], .tab-panel, [data-tab-panel]');
    const activeTab = el.querySelector('[role="tab"][aria-selected="true"], .active, [data-active]');
    states[`tabs_${i}`] = {
      type: 'tabs',
      selector: el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.className ? '.' + el.className.split(' ')[0] : ''),
      tabs: Array.from(el.querySelectorAll('[role="tab"], .tab, [data-tab]')).map(t => t.innerText.trim()).filter(Boolean),
      activeIndex: activeTab ? Array.from(el.querySelectorAll('[role="tab"], .tab, [data-tab]')).indexOf(activeTab) : 0,
      boundingBox: el.getBoundingClientRect()
    };
  });
  
  // Find accordions
  const accordions = document.querySelectorAll('[role="region"], .accordion, [data-accordion], details');
  accordions.forEach((el, i) => {
    const isOpen = el.open || el.getAttribute('aria-expanded') === 'true' || el.classList.contains('open');
    states[`accordion_${i}`] = {
      type: 'accordion',
      selector: el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.className ? '.' + el.className.split(' ')[0] : ''),
      label: el.querySelector('summary, [role="heading"], h1,h2,h3,h4')?.innerText?.trim() || `Accordion ${i}`,
      isOpen: isOpen,
      boundingBox: el.getBoundingClientRect()
    };
  });
  
  return states;
}
"""

# Skrip untuk extract form schemas
EXTRACT_FORM_SCHEMAS = """
() => {
  const forms = document.querySelectorAll('form');
  const schemas = [];
  
  forms.forEach((form, formIndex) => {
    const fields = [];
    const elements = form.querySelectorAll('input, select, textarea');
    
    elements.forEach((el) => {
      const field = {
        name: el.name || el.id,
        type: el.type || el.tagName.toLowerCase(),
        tag: el.tagName.toLowerCase(),
        label: '',
        required: el.required,
        placeholder: el.placeholder || '',
        options: [],
        value: '', // Not captured for security
      };
      
      // Find label
      const labelEl = form.querySelector(`label[for="${el.id}"]`) || el.closest('label');
      if (labelEl) {
        field.label = labelEl.innerText.trim();
      } else if (el.getAttribute('aria-label')) {
        field.label = el.getAttribute('aria-label');
      } else if (el.placeholder) {
        field.label = el.placeholder;
      }
      
      // Options for select
      if (el.tagName === 'SELECT') {
        field.options = Array.from(el.options).map(o => ({
          value: o.value,
          label: o.innerText.trim(),
          selected: o.selected
        }));
      }
      
      // Checkbox/radio
      if (el.type === 'checkbox' || el.type === 'radio') {
        field.checked = el.checked;
      }
      
      fields.push(field);
    });
    
    if (fields.length > 0) {
      schemas.push({
        formIndex: formIndex,
        selector: form.tagName.toLowerCase() + (form.id ? '#' + form.id : '') + (form.className ? '.' + form.className.split(' ')[0] : ''),
        action: form.action,
        method: form.method || 'GET',
        fields: fields,
        boundingBox: form.getBoundingClientRect()
      });
    }
  });
  
  return schemas;
}
"""


# Preset perangkat: emulasi tampilan mobile/tablet di browser desktop.
# Dipakai saat capture aplikasi web yang punya versi mobile.
DEVICE_PRESETS: dict[str, dict[str, Any]] = {
    "desktop": {
        "viewport": {"width": 1440, "height": 900},
        "is_mobile": False,
        "has_touch": False,
        "user_agent": None,
        "device_scale_factor": 1,
    },
    "tablet": {
        "viewport": {"width": 820, "height": 1180},
        "is_mobile": True,
        "has_touch": True,
        "user_agent": (
            "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 "
            "(KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
        ),
        "device_scale_factor": 2,
    },
    "phone": {
        "viewport": {"width": 390, "height": 844},
        "is_mobile": True,
        "has_touch": True,
        "user_agent": (
            "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 "
            "(KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
        ),
        "device_scale_factor": 3,
    },
}


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
        device: str = "desktop",
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
        self._browser = self._playwright.chromium.launch(
            headless=settings.headless,
            # Jendela muncul di kiri atas supaya mudah ditemukan operator,
            # dan tidak tersembunyi di belakang jendela lain.
            args=["--window-position=30,30", "--window-size=1476,986"],
        )
        preset = DEVICE_PRESETS.get((device or "desktop").lower(), DEVICE_PRESETS["desktop"])
        context_args: dict[str, Any] = {
            "viewport": {
                "width": viewport_width or preset["viewport"]["width"],
                "height": viewport_height or preset["viewport"]["height"],
            },
            "is_mobile": preset["is_mobile"],
            "has_touch": preset["has_touch"],
            "device_scale_factor": preset["device_scale_factor"],
            # Jangan pernah memuat state login milik siapa pun.
            "storage_state": None,
        }
        if preset.get("user_agent"):
            context_args["user_agent"] = preset["user_agent"]

        self._context = self._browser.new_context(**context_args)
        self._context.add_init_script(INIT_SCRIPT)
        self._context.add_init_script(INJECT_HAR_CAPTURE)

        page = self._context.new_page()
        self._guard_navigation(page, hosts)
        self._page = page

        def _handle_page_close() -> None:
            if self.session and self.session.status != "stopped":
                self.session.status = "stopped"
                self._reconcile_db_session()

        def _handle_browser_disconnect() -> None:
            if self.session and self.session.status != "stopped":
                self.session.status = "stopped"
                self._reconcile_db_session()

        page.on("close", lambda: _handle_page_close())
        self._browser.on("disconnected", lambda: _handle_browser_disconnect())

        self.session = Session(id=f"cap_{int(time.time() * 1000)}", allowed_hosts=hosts)
        page.goto(url, wait_until="domcontentloaded")
        # Angkat jendela browser ke depan supaya operator langsung melihatnya.
        try:
            page.bring_to_front()
        except Exception:  # noqa: BLE001 - tidak semua platform mendukung
            pass
        self.session.url = page.url
        return self.session

    def _reconcile_db_session(self) -> None:
        """Sinkronkan penutupan sesi ke database SQLite jika file DB dapat ditemukan."""
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

    def focus(self) -> dict[str, Any]:
        """Fokuskan jendela browser (kalau tersembunyi di belakang)."""
        self._require_session()
        assert self._page is not None
        try:
            self._page.bring_to_front()
        except Exception as exc:  # noqa: BLE001
            raise CaptureError(f"Gagal memfokuskan jendela browser: {exc}") from exc
        return {"status": "focused", "url": self._page.url, "title": self._page.title()}

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
        if self.session is None:
            self.session = Session(id="", allowed_hosts=[], status="stopped")
        else:
            self.session.status = "stopped"
        self._reconcile_db_session()
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

        # Wait for network idle and fonts/images to load
        try:
            page.wait_for_load_state("networkidle", timeout=10000)
        except Exception:
            pass  # Continue even if timeout

        # Wait for fonts
        page.evaluate("""() => document.fonts.ready""")

        # Run enhanced element detection
        detected_elements = detect_interactive_elements(page, DEFAULT_CONFIG)

        # Also get structure for reconstruction
        structure = page.evaluate(EXTRACT_STRUCTURE)
        if isinstance(structure, dict):
            try:
                raw_visual = page.evaluate(VISUAL_EXTRACT_SCRIPT)
                structure["visual"] = _prune_visual_tree(raw_visual)
            except Exception:  # noqa: BLE001
                structure["visual"] = {
                    "viewport": {"w": 1440, "h": 900},
                    "page": {},
                    "nodes": [],
                    "truncated": False,
                }

        # Get recorded interaction events
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

        # Generate detection report
        detection_report = generate_detection_report(detected_elements)

        # Convert DetectedElement objects to dict for storage
        elements_data = []
        for elem in detected_elements:
            elements_data.append({
                "type": elem.type,
                "label": elem.label,
                "hint": elem.selector,
                "box": {
                    "x": elem.raw_box["x"] if elem.raw_box else 0,
                    "y": elem.raw_box["y"] if elem.raw_box else 0,
                    "w": elem.raw_box["w"] if elem.raw_box else 0,
                    "h": elem.raw_box["h"] if elem.raw_box else 0,
                },
                "percent_box": {
                    "x": elem.x,
                    "y": elem.y,
                    "w": elem.width,
                    "h": elem.height,
                },
                "source": elem.source,
                "tag": elem.tag,
                "href": elem.href,
                "target": elem.target,
                "role": elem.role,
                "input_type": elem.input_type,
                "parent_id": elem.parent_id,
                "state": elem.state,
                "confidence": elem.confidence,
            })

        png = page.screenshot(full_page=full_page, type="png")
        try:
            page.bring_to_front()
        except Exception:  # noqa: BLE001
            pass
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
            "elements": elements_data,
            "structure": structure,
            "interactions": [e.as_dict() for e in self.session.events],
            "detection_report": detection_report,
        }
        self.session.last_capture = {
            "file_name": file_path.name,
            "url": meta["url"],
            "title": meta["title"],
            "captured_at": meta["captured_at"],
        }
        # Also store in named captures
        self.session.captures[label] = meta
        return meta

    # ---------- Multi-state & Reconstruction Methods ----------

    def capture_state(self, state_name: str, label: str | None = None, full_page: bool = False, relative_dir: str = "captures") -> dict[str, Any]:
        """Capture halaman dengan nama state (mis. 'dropdown_closed', 'dropdown_open', 'modal_open', 'form_error')."""
        if label is None:
            label = state_name
        meta = self.capture(label, full_page=full_page, relative_dir=relative_dir)
        meta["state_name"] = state_name
        self.session.captures[state_name] = meta
        return meta

    def get_har(self) -> list[dict[str, Any]]:
        """Ambil HAR entries yang tertangkap selama sesi."""
        self._require_session()
        assert self._page is not None
        har_entries = self._page.evaluate(EXTRACT_HAR)
        self.session.har_entries.extend(har_entries)
        return har_entries

    def get_storage(self) -> dict[str, Any]:
        """Ambil snapshot localStorage & sessionStorage."""
        self._require_session()
        assert self._page is not None
        storage = self._page.evaluate(EXTRACT_STORAGE)
        self.session.storage_snapshots.append({
            "timestamp": time.time(),
            "url": self._page.url,
            **storage
        })
        return storage

    def get_component_states(self) -> dict[str, Any]:
        """Deteksi state komponen interaktif (dropdown, modal, tabs, accordion)."""
        self._require_session()
        assert self._page is not None
        states = self._page.evaluate(EXTRACT_COMPONENT_STATES)
        self.session.component_states.update(states)
        return states

    def get_form_schemas(self) -> list[dict[str, Any]]:
        """Ekstrak schema form (field, type, validation, options)."""
        self._require_session()
        assert self._page is not None
        schemas = self._page.evaluate(EXTRACT_FORM_SCHEMAS)
        self.session.form_schemas.extend(schemas)
        return schemas

    def save_page_as_html(self, export_name: str | None = None) -> dict[str, Any]:
        """Simpan halaman sebagai single-file HTML (assets di-inline sebagai base64)."""
        self._require_session()
        assert self._page is not None
        
        html_content = self._page.evaluate(SAVE_PAGE_AS_HTML)
        
        if export_name is None:
            export_name = f"page_{int(time.time() * 1000)}"
        
        # Save to disk
        target_dir = _safe_join(settings.storage_path, "html_exports")
        target_dir.mkdir(parents=True, exist_ok=True)
        file_path = target_dir / f"{export_name}.html"
        file_path.write_text(html_content, encoding="utf-8")
        
        # Store in session
        self.session.html_exports[export_name] = str(file_path)
        
        return {
            "export_name": export_name,
            "file_path": str(file_path),
            "file_name": file_path.name,
            "size_bytes": len(html_content.encode("utf-8")),
            "url": self._page.url,
            "title": self._page.title(),
        }

    def get_session_data(self) -> dict[str, Any]:
        """Ambil semua data sesi untuk reconstruction: captures, HAR, storage, component states, form schemas."""
        self._require_session()
        return {
            "session_id": self.session.id,
            "url": self.session.url,
            "allowed_hosts": self.session.allowed_hosts,
            "captures": self.session.captures,
            "har_entries": self.session.har_entries,
            "storage_snapshots": self.session.storage_snapshots,
            "component_states": self.session.component_states,
            "form_schemas": self.session.form_schemas,
            "html_exports": self.session.html_exports,
            "events": [e.as_dict() for e in self.session.events],
        }

    def state(self) -> dict[str, Any]:
        if self.session is None:
            return {"status": "idle", "session_id": None}
        data = self.session.as_dict()
        if self._page is not None and self.session.status != "stopped":
            try:
                if self._page.is_closed():
                    self.session.status = "stopped"
                    data["status"] = "stopped"
                    self._reconcile_db_session()
                else:
                    data["current_url"] = self._page.url
                    data["current_title"] = self._page.title()
                    try:
                        win_info = self._page.evaluate("""() => ({
                            screenX: window.screenX,
                            screenY: window.screenY,
                            outerWidth: window.outerWidth,
                            outerHeight: window.outerHeight,
                            innerWidth: window.innerWidth,
                            innerHeight: window.innerHeight,
                            devicePixelRatio: window.devicePixelRatio,
                            visibilityState: document.visibilityState,
                            hidden: document.hidden,
                            isMinimized: (window.outerWidth === 0 && window.outerHeight === 0) || document.hidden
                        })""")
                        data["window_info"] = win_info
                    except Exception:  # noqa: BLE001
                        pass
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
