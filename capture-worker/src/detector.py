"""Enhanced element detection for capture worker.

This module provides comprehensive interactive element detection including:
- DOM-based detection with extensive selectors
- Hover/interaction-triggered detection (dropdowns, menus)
- Visual fallback placeholder (OCR/OpenCV)
- Deduplication and cleanup
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


# =============================================================================
# Configuration
# =============================================================================

@dataclass
class DetectorConfig:
    """Configuration for element detection."""
    min_size: int = 6  # Minimum width/height in pixels
    iou_threshold: float = 0.9  # IoU threshold for duplicate merging
    include_hover: bool = True  # Trigger hover to reveal menus
    include_visual_fallback: bool = False  # Enable visual detection (OCR/OpenCV)
    max_elements: int = 500  # Maximum elements to return
    hover_wait_ms: int = 300  # Wait time after hover for animations
    click_wait_ms: int = 500  # Wait time after click for modals/dropdowns
    exclude_selectors: list[str] = field(default_factory=lambda: [
        "html", "body", "head", "script", "style", "meta", "link",
        "noscript", "template", "path", "defs", "use"
    ])


DEFAULT_CONFIG = DetectorConfig()


# =============================================================================
# Data Structures
# =============================================================================

@dataclass
class DetectedElement:
    """Represents a detected interactive element."""
    id: str
    type: str  # "link", "button", "input", "select", "textarea", "menuitem", "tab", "role-button", "role-link", "onclick", "tabindex", "cursor-pointer", "hover-trigger", "visual"
    source: str  # "dom", "hover", "visual"
    x: float  # Percentage (0-100)
    y: float  # Percentage (0-100)
    width: float  # Percentage (0-100)
    height: float  # Percentage (0-100)
    label: str | None = None
    tag: str | None = None
    href: str | None = None
    target: str | None = None
    selector: str | None = None
    role: str | None = None
    input_type: str | None = None
    parent_id: str | None = None
    state: str | None = None  # "hover", "open", "default"
    confidence: float = 1.0
    viewport_width: int = 0
    viewport_height: int = 0
    device_pixel_ratio: float = 1.0
    raw_box: dict[str, int] | None = None  # Absolute pixel coordinates {x, y, w, h}
    # Visual-specific fields
    ocr_text: str | None = None
    contour_area: float | None = None


# =============================================================================
# DOM-Based Detection Scripts
# =============================================================================

# Main DOM detection script - runs in page context
DOM_DETECTION_SCRIPT = r"""
(config) => {
  const { minSize, maxElements, excludeSelectors, devicePixelRatio } = config;

  // Helper: Check if element is visible
  const isVisible = (el) => {
    if (!el) return false;
    const style = window.getComputedStyle(el);
    if (style.display === 'none') return false;
    if (style.visibility === 'hidden') return false;
    if (style.opacity === '0') return false;
    const rect = el.getBoundingClientRect();
    if (rect.width < minSize || rect.height < minSize) return false;
    if (rect.width === 0 && rect.height === 0) return false;
    // Check if element is in viewport (or close to it for fixed/sticky)
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    // Allow elements slightly outside viewport (for sticky/fixed elements)
    if (rect.right < -50 || rect.left > vw + 50 || rect.bottom < -50 || rect.top > vh + 50) {
      // But allow fixed/sticky positioned elements
      if (style.position !== 'fixed' && style.position !== 'sticky') return false;
    }
    return true;
  };

  // Helper: Get unique CSS selector
  const getUniqueSelector = (el) => {
    if (el.id) return `#${el.id}`;
    const path = [];
    while (el && el !== document.body && el !== document.documentElement) {
      let selector = el.tagName.toLowerCase();
      if (el.className && typeof el.className === 'string') {
        const classes = el.className.trim().split(/\s+/).filter(c => c && !c.startsWith('__'));
        if (classes.length) selector += '.' + classes.join('.');
      }
      // Add nth-child if needed for uniqueness
      const parent = el.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter(c => c.tagName === el.tagName);
        if (siblings.length > 1) {
          const index = siblings.indexOf(el) + 1;
          selector += `:nth-of-type(${index})`;
        }
      }
      path.unshift(selector);
      el = parent;
    }
    return path.join(' > ');
  };

  // Helper: Get element label
  const getLabel = (el) => {
    const aria = el.getAttribute('aria-label');
    if (aria) return aria;
    const title = el.getAttribute('title');
    if (title) return title;
    const alt = el.getAttribute('alt');
    if (alt) return alt;
    const text = (el.innerText || '').trim().split('\n')[0];
    if (text && text.length < 100) return text;
    const placeholder = el.getAttribute('placeholder');
    if (placeholder) return placeholder;
    const tag = (el.tagName || '').toLowerCase();
    if (tag === 'input') {
      const inputType = (el.getAttribute('type') || 'text').toLowerCase();
      if (inputType === 'submit' || inputType === 'button' || inputType === 'reset') {
        const value = el.value;
        if (value && typeof value === 'string' && value.length < 60) return value;
      }
    }
    return null;
  };

  // Helper: Get absolute coordinates accounting for scroll
  const getAbsoluteRect = (el) => {
    const rect = el.getBoundingClientRect();
    return {
      x: Math.round(rect.x + window.scrollX),
      y: Math.round(rect.y + window.scrollY),
      w: Math.round(rect.width),
      h: Math.round(rect.height)
    };
  };

  // Helper: Convert to percentage
  const toPercent = (rect, vw, vh) => ({
    x: Math.round((rect.x / vw) * 10000) / 100,
    y: Math.round((rect.y / vh) * 10000) / 100,
    w: Math.round((rect.w / vw) * 10000) / 100,
    h: Math.round((rect.h / vh) * 10000) / 100,
  });

  // Main detection
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const dpr = devicePixelRatio || window.devicePixelRatio || 1;
  const scrollX = window.scrollX;
  const scrollY = window.scrollY;
  const docHeight = document.documentElement.scrollHeight;
  const docWidth = document.documentElement.scrollWidth;

  // Build comprehensive selector
  const interactiveSelectors = [
    'a[href]',
    'button:not([disabled])',
    'input:not([type="hidden"]):not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    'summary',
    'label',
    '[role="button"]:not([aria-disabled="true"])',
    '[role="link"]',
    '[role="tab"]:not([aria-disabled="true"])',
    '[role="menuitem"]:not([aria-disabled="true"])',
    '[role="option"]:not([aria-disabled="true"])',
    '[role="checkbox"]:not([aria-disabled="true"])',
    '[role="radio"]:not([aria-disabled="true"])',
    '[role="switch"]:not([aria-disabled="true"])',
    '[role="treeitem"]',
    '[onclick]',
    '[tabindex]:not([tabindex="-1"])',
    '[data-action]',
    '[data-click]',
    '[data-toggle]',
    '[data-trigger]',
    '.btn', '.button', '[class*="btn"]',
    '[class*="button"]',
    '[class*="link"]',
    '[class*="trigger"]',
    '[class*="toggle"]',
    '[class*="dropdown"]',
    '[class*="menu"]',
    '[class*="tab"]',
    '[class*="card"]',
    '[class*="card-item"]',
    '[class*="item"][onclick]',
    '[class*="clickable"]',
    '[class*="cursor-pointer"]',
    '[class*="icon"][onclick]',
    '[class*="icon"][role="button"]',
    'img[onclick]',
    'img[role="button"]',
    'svg[onclick]',
    'svg[role="button"]',
    '[class*="nav"] a',
    '[class*="nav"] button',
    'nav a',
    'header a',
    'header button',
  ].join(', ');

  // Get all candidates
  const candidates = Array.from(document.querySelectorAll(interactiveSelectors));
  const seen = new Set();
  const results = [];

  for (const el of candidates) {
    if (results.length >= maxElements) break;
    if (!isVisible(el)) continue;

    // Skip excluded elements
    if (excludeSelectors.some(sel => {
      try { return el.matches(sel); } catch { return false; }
    })) continue;

    const rect = getAbsoluteRect(el);
    if (rect.w < minSize || rect.h < minSize) continue;

    // Determine element type
    let type = 'unknown';
    const tag = el.tagName.toLowerCase();
    const role = el.getAttribute('role');

    if (tag === 'a' && el.hasAttribute('href')) type = 'link';
    else if (tag === 'button') type = 'button';
    else if (tag === 'input') type = 'input';
    else if (tag === 'select') type = 'select';
    else if (tag === 'textarea') type = 'textarea';
    else if (tag === 'summary') type = 'summary';
    else if (tag === 'label') type = 'label';
    else if (role === 'button') type = 'role-button';
    else if (role === 'link') type = 'role-link';
    else if (role === 'tab') type = 'tab';
    else if (role === 'menuitem') type = 'menuitem';
    else if (role === 'option') type = 'option';
    else if (role === 'checkbox') type = 'checkbox';
    else if (role === 'radio') type = 'radio';
    else if (role === 'switch') type = 'switch';
    else if (el.hasAttribute('onclick')) type = 'onclick';
    else if (el.hasAttribute('tabindex') && el.getAttribute('tabindex') !== '-1') type = 'tabindex';
    else type = 'other';

    const label = getLabel(el);
    const selector = getUniqueSelector(el);
    const href = tag === 'a' ? el.getAttribute('href') : null;
    const target = tag === 'a' ? el.getAttribute('target') : null;
    const inputType = tag === 'input' ? (el.getAttribute('type') || 'text') : null;

    const pct = toPercent(rect, docWidth > vw ? docWidth : vw, docHeight > vh ? docHeight : vh);

    // Create unique key for deduplication
    const key = `${type}|${pct.x.toFixed(2)}|${pct.y.toFixed(2)}|${pct.w.toFixed(2)}|${pct.h.toFixed(2)}|${label || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);

    results.push({
      id: `dom_${results.length}`,
      type,
      source: 'dom',
      x: pct.x,
      y: pct.y,
      width: pct.w,
      height: pct.h,
      label,
      tag,
      href,
      target,
      selector,
      role,
      input_type: inputType,
      parent_id: null,
      state: 'default',
      confidence: 1.0,
      viewport_width: vw,
      viewport_height: vh,
      device_pixel_ratio: dpr,
      raw_box: rect,
    });
  }

  // Also check for cursor:pointer elements not caught above
  if (results.length < maxElements) {
    const allElements = Array.from(document.querySelectorAll('*'));
    for (const el of allElements) {
      if (results.length >= maxElements) break;
      if (!isVisible(el)) continue;
      if (excludeSelectors.some(sel => {
        try { return el.matches(sel); } catch { return false; }
      })) continue;

      const style = window.getComputedStyle(el);
      if (style.cursor === 'pointer') {
        // Check if already captured
        const rect = getAbsoluteRect(el);
        if (rect.w < minSize || rect.h < minSize) continue;

        const pct = toPercent(rect, docWidth > vw ? docWidth : vw, docHeight > vh ? docHeight : vh);
        const key = `cursor-pointer|${pct.x.toFixed(2)}|${pct.y.toFixed(2)}|${pct.w.toFixed(2)}|${pct.h.toFixed(2)}`;
        if (seen.has(key)) continue;
        seen.add(key);

        const label = getLabel(el);
        const selector = getUniqueSelector(el);
        const tag = el.tagName.toLowerCase();
        const role = el.getAttribute('role');

        results.push({
          id: `dom_${results.length}`,
          type: 'cursor-pointer',
          source: 'dom',
          x: pct.x,
          y: pct.y,
          width: pct.w,
          height: pct.h,
          label,
          tag,
          href: null,
          target: null,
          selector,
          role,
          input_type: null,
          parent_id: null,
          state: 'default',
          confidence: 0.8, // Lower confidence for cursor-only detection
          viewport_width: vw,
          viewport_height: vh,
          device_pixel_ratio: dpr,
          raw_box: rect,
        });
      }
    }
  }

  return results;
}
"""

# Hover/Interaction detection script
HOVER_DETECTION_SCRIPT = r"""
(config) => {
  const { hoverWaitMs, minSize, maxElements, devicePixelRatio } = config;

  const isVisible = (el) => {
    if (!el) return false;
    const style = window.getComputedStyle(el);
    if (style.display === 'none') return false;
    if (style.visibility === 'hidden') return false;
    if (style.opacity === '0') return false;
    const rect = el.getBoundingClientRect();
    if (rect.width < minSize || rect.height < minSize) return false;
    return true;
  };

  const getLabel = (el) => {
    const aria = el.getAttribute('aria-label');
    if (aria) return aria;
    const title = el.getAttribute('title');
    if (title) return title;
    const text = (el.innerText || '').trim().split('\n')[0];
    if (text && text.length < 100) return text;
    return null;
  };

  const getAbsoluteRect = (el) => {
    const rect = el.getBoundingClientRect();
    return {
      x: Math.round(rect.x + window.scrollX),
      y: Math.round(rect.y + window.scrollY),
      w: Math.round(rect.width),
      h: Math.round(rect.height)
    };
  };

  const toPercent = (rect, vw, vh) => ({
    x: Math.round((rect.x / vw) * 10000) / 100,
    y: Math.round((rect.y / vh) * 10000) / 100,
    w: Math.round((rect.w / vw) * 10000) / 100,
    h: Math.round((rect.h / vh) * 10000) / 100,
  });

  const getUniqueSelector = (el) => {
    if (el.id) return `#${el.id}`;
    const path = [];
    while (el && el !== document.body && el !== document.documentElement) {
      let selector = el.tagName.toLowerCase();
      if (el.className && typeof el.className === 'string') {
        const classes = el.className.trim().split(/\s+/).filter(c => c && !c.startsWith('__'));
        if (classes.length) selector += '.' + classes.join('.');
      }
      const parent = el.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter(c => c.tagName === el.tagName);
        if (siblings.length > 1) {
          const index = siblings.indexOf(el) + 1;
          selector += `:nth-of-type(${index})`;
        }
      }
      path.unshift(selector);
      el = parent;
    }
    return path.join(' > ');
  };

  // Find hover-trigger elements (dropdown toggles, menu buttons, etc.)
  const hoverTriggers = Array.from(document.querySelectorAll(
    '[class*="dropdown"] > [class*="toggle"],' +
    '[class*="dropdown"] > button,' +
    '[class*="dropdown"] > a,' +
    '[class*="menu"] > [class*="trigger"],' +
    '[class*="menu"] > button,' +
    '[class*="menu"] > a,' +
    '[class*="select"] > [class*="trigger"],' +
    '[class*="select"] > button,' +
    '[aria-haspopup="true"],' +
    '[aria-expanded]',  // Elements that expand on hover/click
    '[data-dropdown-trigger],' +
    '[data-menu-trigger],' +
    '.dropdown-toggle,' +
    '.menu-trigger,' +
    '.select-trigger,' +
    'nav [class*="item"]:has([class*="submenu"], [class*="dropdown"]),' +
    'nav li:has(ul),' +
    'nav li:has([class*="sub"]),' +
    '[class*="language"] [class*="trigger"],' +
    '[class*="locale"] [class*="trigger"],' +
    '[class*="currency"] [class*="trigger"],' +
    '[class*="account"] [class*="trigger"],' +
    '[class*="user"] [class*="trigger"],' +
    '[class*="cart"] [class*="trigger"],' +
    '[class*="basket"] [class*="trigger"],' +
    '[class*="notification"] [class*="trigger"],' +
    '[class*="bell"] [class*="trigger"],' +
    '[class*="avatar"] [class*="trigger"],' +
    '[class*="profile"] [class*="trigger"]'
  ));

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const dpr = devicePixelRatio || window.devicePixelRatio || 1;
  const docHeight = document.documentElement.scrollHeight;
  const docWidth = document.documentElement.scrollWidth;
  const results = [];
  const seen = new Set();

  // Helper to capture currently visible elements
  const captureVisible = (state, parentId) => {
    const allElements = Array.from(document.querySelectorAll('*'));
    for (const el of allElements) {
      if (results.length >= maxElements) break;
      if (!isVisible(el)) continue;

      const rect = getAbsoluteRect(el);
      if (rect.w < minSize || rect.h < minSize) continue;

      const pct = toPercent(rect, docWidth > vw ? docWidth : vw, docHeight > vh ? docHeight : vh);
      const key = `${state}|${pct.x.toFixed(2)}|${pct.y.toFixed(2)}|${pct.w.toFixed(2)}|${pct.h.toFixed(2)}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const label = getLabel(el);
      const selector = getUniqueSelector(el);
      const tag = el.tagName.toLowerCase();
      const role = el.getAttribute('role');
      let type = 'unknown';
      if (tag === 'a' && el.hasAttribute('href')) type = 'link';
      else if (tag === 'button') type = 'button';
      else if (tag === 'input') type = 'input';
      else if (tag === 'select') type = 'select';
      else if (tag === 'textarea') type = 'textarea';
      else if (role === 'menuitem') type = 'menuitem';
      else if (role === 'option') type = 'option';
      else if (el.hasAttribute('onclick')) type = 'onclick';
      else if (el.hasAttribute('tabindex') && el.getAttribute('tabindex') !== '-1') type = 'tabindex';
      else type = 'hover-revealed';

      results.push({
        id: `hover_${results.length}`,
        type,
        source: 'hover',
        x: pct.x,
        y: pct.y,
        width: pct.w,
        height: pct.h,
        label,
        tag,
        href: tag === 'a' ? el.getAttribute('href') : null,
        target: tag === 'a' ? el.getAttribute('target') : null,
        selector,
        role,
        input_type: tag === 'input' ? (el.getAttribute('type') || 'text') : null,
        parent_id: parentId,
        state,
        confidence: 0.9,
        viewport_width: vw,
        viewport_height: vh,
        device_pixel_ratio: dpr,
        raw_box: rect,
      });
    }
  };

  // First capture base state
  captureVisible('default', null);

  // Then hover each trigger and capture revealed elements
  for (const trigger of hoverTriggers) {
    if (results.length >= maxElements) break;
    if (!isVisible(trigger)) continue;

    const triggerRect = getAbsoluteRect(trigger);
    const triggerPct = toPercent(triggerRect, docWidth > vw ? docWidth : vw, docHeight > vh ? docHeight : vh);
    const triggerId = `hover_trigger_${results.length}`;

    // Add the trigger itself
    const triggerKey = `trigger|${triggerPct.x.toFixed(2)}|${triggerPct.y.toFixed(2)}|${triggerPct.w.toFixed(2)}|${triggerPct.h.toFixed(2)}`;
    if (!seen.has(triggerKey)) {
      seen.add(triggerKey);
      const label = getLabel(trigger);
      const selector = getUniqueSelector(trigger);
      const tag = trigger.tagName.toLowerCase();
      const role = trigger.getAttribute('role');
      results.push({
        id: triggerId,
        type: 'hover-trigger',
        source: 'hover',
        x: triggerPct.x,
        y: triggerPct.y,
        width: triggerPct.w,
        height: triggerPct.h,
        label: label || 'Dropdown/Menu trigger',
        tag,
        href: tag === 'a' ? trigger.getAttribute('href') : null,
        target: tag === 'a' ? trigger.getAttribute('target') : null,
        selector,
        role,
        input_type: null,
        parent_id: null,
        state: 'hover',
        confidence: 0.95,
        viewport_width: vw,
        viewport_height: vh,
        device_pixel_ratio: dpr,
        raw_box: triggerRect,
      });
    }

    // Hover the trigger
    try {
      trigger.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
      trigger.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      trigger.setAttribute('aria-expanded', 'true');
      // Also try click for click-based dropdowns
      trigger.click();
    } catch (e) {}

    // Wait for animations (busy wait since we can't use await in this context)
    const waitStart = Date.now();
    while (Date.now() - waitStart < hoverWaitMs) {
      // Busy wait
    }

    // Capture revealed elements
    captureVisible('open', triggerId);

    // Try to close (move mouse away)
    try {
      trigger.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
      trigger.dispatchEvent(new MouseEvent('mouseout', { bubbles: true }));
      trigger.setAttribute('aria-expanded', 'false');
    } catch (e) {}

    const waitStart2 = Date.now();
    while (Date.now() - waitStart2 < 100) {
      // Busy wait
    }
  }

  return results;
}
"""

# Visual detection placeholder (for future OCR/OpenCV integration)
VISUAL_DETECTION_SCRIPT = r"""
(config) => {
  // Placeholder for visual detection (OCR/OpenCV)
  // This would be implemented via a separate service that processes the screenshot
  // For now, return empty array
  return [];
}
"""


# =============================================================================
# Deduplication and Cleanup
# =============================================================================

def calculate_iou(box1: dict[str, float], box2: dict[str, float]) -> float:
    """Calculate Intersection over Union (IoU) of two boxes.
    
    Boxes are in percentage coordinates: {x, y, width, height}
    """
    x1_min, y1_min = box1['x'], box1['y']
    x1_max, y1_max = box1['x'] + box1['width'], box1['y'] + box1['height']
    x2_min, y2_min = box2['x'], box2['y']
    x2_max, y2_max = box2['x'] + box2['width'], box2['y'] + box2['height']

    # Intersection
    inter_x_min = max(x1_min, x2_min)
    inter_y_min = max(y1_min, y2_min)
    inter_x_max = min(x1_max, x2_max)
    inter_y_max = min(y1_max, y2_max)

    if inter_x_max <= inter_x_min or inter_y_max <= inter_y_min:
        return 0.0

    inter_area = (inter_x_max - inter_x_min) * (inter_y_max - inter_y_min)
    area1 = box1['width'] * box1['height']
    area2 = box2['width'] * box2['height']
    union_area = area1 + area2 - inter_area

    return inter_area / union_area if union_area > 0 else 0.0


def deduplicate_elements(
    elements: list[DetectedElement],
    iou_threshold: float = 0.9
) -> list[DetectedElement]:
    """Merge overlapping elements, keeping the more specific one."""
    if not elements:
        return []

    # Sort by confidence (higher first) and then by area (smaller first - more specific)
    sorted_elements = sorted(elements, key=lambda e: (-e.confidence, e.width * e.height))

    kept = []
    for elem in sorted_elements:
        is_duplicate = False
        for kept_elem in kept:
            iou = calculate_iou(
                {'x': elem.x, 'y': elem.y, 'width': elem.width, 'height': elem.height},
                {'x': kept_elem.x, 'y': kept_elem.y, 'width': kept_elem.width, 'height': kept_elem.height}
            )
            if iou >= iou_threshold:
                is_duplicate = True
                # If the new element is more specific (smaller area), replace
                if elem.width * elem.height < kept_elem.width * kept_elem.height:
                    kept.remove(kept_elem)
                    kept.append(elem)
                break
        if not is_duplicate:
            kept.append(elem)

    return kept


def filter_elements(
    elements: list[DetectedElement],
    min_size: int = 6,
    max_coverage: float = 0.95
) -> list[DetectedElement]:
    """Filter out too-small elements and full-page wrappers."""
    filtered = []
    for elem in elements:
        # Skip too small
        if elem.width < min_size or elem.height < min_size:
            continue
        # Skip elements covering almost entire page
        if elem.width > 100 * max_coverage or elem.height > 100 * max_coverage:
            continue
        filtered.append(elem)
    return filtered


def expand_small_elements(
    elements: list[DetectedElement],
    min_click_size: float = 16.0,  # Minimum 16px equivalent in percentage
    padding: float = 1.0,  # Padding in percentage
    viewport_width: int = 1440,
    viewport_height: int = 900
) -> list[DetectedElement]:
    """Expand small clickable elements (icons) to meet minimum click target size."""
    # Convert min_click_size from pixels to percentage
    min_w_pct = (min_click_size / viewport_width) * 100
    min_h_pct = (min_click_size / viewport_height) * 100

    expanded = []
    for elem in elements:
        new_elem = DetectedElement(
            id=elem.id,
            type=elem.type,
            source=elem.source,
            x=elem.x,
            y=elem.y,
            width=elem.width,
            height=elem.height,
            label=elem.label,
            tag=elem.tag,
            href=elem.href,
            target=elem.target,
            selector=elem.selector,
            role=elem.role,
            input_type=elem.input_type,
            parent_id=elem.parent_id,
            state=elem.state,
            confidence=elem.confidence,
            viewport_width=elem.viewport_width,
            viewport_height=elem.viewport_height,
            device_pixel_ratio=elem.device_pixel_ratio,
            raw_box=elem.raw_box,
            ocr_text=elem.ocr_text,
            contour_area=elem.contour_area,
        )

        # Expand if too small
        if new_elem.width < min_w_pct:
            delta = min_w_pct - new_elem.width
            new_elem.x = max(0, new_elem.x - delta / 2)
            new_elem.width = min_w_pct
        if new_elem.height < min_h_pct:
            delta = min_h_pct - new_elem.height
            new_elem.y = max(0, new_elem.y - delta / 2)
            new_elem.height = min_h_pct

        expanded.append(new_elem)

    # After expansion, re-deduplicate
    return deduplicate_elements(expanded)


def build_parent_relationships(elements: list[DetectedElement]) -> list[DetectedElement]:
    """Build parent-child relationships based on containment."""
    # Sort by area (larger first = potential parents)
    sorted_by_area = sorted(elements, key=lambda e: e.width * e.height, reverse=True)

    for i, parent in enumerate(sorted_by_area):
        for child in sorted_by_area[i+1:]:
            # Check if child is contained in parent
            if (child.x >= parent.x and
                child.y >= parent.y and
                child.x + child.width <= parent.x + parent.width and
                child.y + child.height <= parent.y + parent.height):
                # Only set parent if child doesn't already have one
                # or if this parent is more specific (smaller area)
                if child.parent_id is None or parent.width * parent.height < elements[next(
                    (j for j, e in enumerate(elements) if e.id == child.parent_id), 0
                )].width * elements[next(
                    (j for j, e in enumerate(elements) if e.id == child.parent_id), 0
                )].height:
                    child.parent_id = parent.id

    return elements


# =============================================================================
# Main Detection Function
# =============================================================================

def detect_interactive_elements(page, config: DetectorConfig = DEFAULT_CONFIG) -> list[DetectedElement]:
    """Main detection function - runs all detection strategies and merges results."""
    all_elements = []

    # 1. DOM-based detection
    dom_results = page.evaluate(DOM_DETECTION_SCRIPT, {
        'minSize': config.min_size,
        'maxElements': config.max_elements,
        'excludeSelectors': config.exclude_selectors,
        'devicePixelRatio': 1,  # Will be overridden by actual value
    })
    for r in dom_results:
        all_elements.append(DetectedElement(**r))

    # 2. Hover/interaction detection
    if config.include_hover:
        hover_results = page.evaluate(HOVER_DETECTION_SCRIPT, {
            'hoverWaitMs': config.hover_wait_ms,
            'minSize': config.min_size,
            'maxElements': config.max_elements,
            'devicePixelRatio': 1,
        })
        for r in hover_results:
            all_elements.append(DetectedElement(**r))

    # 3. Visual fallback (placeholder - would call external service)
    if config.include_visual_fallback:
        # This would be implemented by calling a visual detection service
        # with the screenshot as input
        pass

    # 4. Deduplication
    all_elements = deduplicate_elements(all_elements, config.iou_threshold)

    # 5. Filtering
    all_elements = filter_elements(all_elements, config.min_size)

    # 6. Expand small elements
    if all_elements:
        vp_width = all_elements[0].viewport_width
        vp_height = all_elements[0].viewport_height
        all_elements = expand_small_elements(all_elements, viewport_width=vp_width, viewport_height=vp_height)

    # 7. Build parent relationships
    all_elements = build_parent_relationships(all_elements)

    # Re-assign IDs
    for i, elem in enumerate(all_elements):
        elem.id = f"auto_{i}"

    return all_elements


# =============================================================================
# Detection Report Generation
# =============================================================================

def generate_detection_report(elements: list[DetectedElement]) -> dict[str, Any]:
    """Generate a summary report of detected elements."""
    by_type = {}
    by_source = {}
    low_confidence = []

    for elem in elements:
        by_type[elem.type] = by_type.get(elem.type, 0) + 1
        by_source[elem.source] = by_source.get(elem.source, 0) + 1
        if elem.confidence < 0.7:
            low_confidence.append({
                'id': elem.id,
                'type': elem.type,
                'label': elem.label,
                'confidence': elem.confidence,
                'reason': 'Low confidence detection'
            })

    return {
        'total_elements': len(elements),
        'by_type': by_type,
        'by_source': by_source,
        'low_confidence_count': len(low_confidence),
        'low_confidence_elements': low_confidence[:20],  # Limit to 20
        'hover_revealed_count': len([e for e in elements if e.state == 'open']),
        'hover_triggers_count': len([e for e in elements if e.type == 'hover-trigger']),
    }


# =============================================================================
# Export for use in capture worker
# =============================================================================

__all__ = [
    'DetectorConfig',
    'DEFAULT_CONFIG',
    'DetectedElement',
    'detect_interactive_elements',
    'generate_detection_report',
    'calculate_iou',
    'deduplicate_elements',
    'filter_elements',
    'expand_small_elements',
    'build_parent_relationships',
]