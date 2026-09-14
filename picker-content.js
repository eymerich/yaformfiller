// YaFormFiller — injected into the page: on click it generates a jQuery-style CSS selector
// and sends it to the settings page with a runtime message { type: "yaf-picker", selector }.

function buildSelector(el) {
  if (!(el instanceof Element)) return null;

  // Prefer a unique #id
  if (el.id && document.querySelectorAll(`#${CSS.escape(el.id)}`).length === 1) {
    return `#${el.id}`;
  }

  const parts = [];
  let node = el;
  let depth = 0;
  while (node && node.nodeType === Node.ELEMENT_NODE && depth < 6) {
    let part = node.tagName.toLowerCase();
    if (node.id) {
      parts.unshift(`#${node.id}`);
      break;
    }
    // stable classes (avoid hashed/generated classes)
    const classes = [...node.classList].filter(
      (c) => !/[A-Z]{2,}|_|-?\d{2,}\b|[0-9a-f]{6,}/i.test(c)
    ).slice(0, 2);
    if (classes.length) part += classes.map((c) => `.${CSS.escape(c)}`).join("");

    // tag name + known name/type attributes
    const name = node.getAttribute("name");
    if (name && document.querySelectorAll(`${node.tagName}[name="${CSS.escape(name)}"]`).length) {
      part += `[name="${name}"]`;
    }

    // nth-of-type among siblings if needed
    const parent = node.parentElement;
    if (parent) {
      const siblings = [...parent.children].filter((s) => s.tagName === node.tagName);
      if (siblings.length > 1) {
        part += `:nth-of-type(${siblings.indexOf(node) + 1})`;
      }
    }
    parts.unshift(part);
    node = parent;
    depth++;
  }

  const sel = parts.filter(Boolean).join(" > ");
  // validate
  try {
    if (document.querySelector(sel) === el) return sel;
  } catch {}
  // fallback: an uglier but valid path
  const path = [];
  let n = el;
  while (n && n.nodeType === Node.ELEMENT_NODE) {
    let p = n.tagName.toLowerCase();
    if (n.id) { path.unshift(`#${CSS.escape(n.id)}`); break; }
    const parent = n.parentElement;
    if (parent) {
      const siblings = [...parent.children].filter((s) => s.tagName === n.tagName);
      if (siblings.length > 1) p += `:nth-of-type(${siblings.indexOf(n) + 1})`;
    }
    path.unshift(p);
    n = n.parentElement;
  }
  return path.join(" > ");
}

(function startPicker() {
  // Avoid double picker
  if (window.__yaformfillerPicker) return;
  window.__yaformfillerPicker = true;

  const style = document.createElement("style");
  style.textContent = `
    .yaf-outline { outline: 2px solid #ff6600 !important; outline-offset: 1px !important; cursor: crosshair !important; }
    .yaf-badge {
      position: fixed; top: 8px; left: 50%; transform: translateX(-50%);
      z-index: 2147483647; background: #ff6600; color: #fff; padding: 6px 14px;
      border-radius: 6px; font: 13px sans-serif; pointer-events: none;
      box-shadow: 0 2px 8px rgba(0,0,0,.4);
    }`;
  document.head.append(style);
  const badge = document.createElement("div");
  badge.className = "yaf-badge";
  badge.textContent = (typeof browser !== "undefined" ? browser : chrome).i18n.getMessage("pickerBadge");
  document.documentElement.append(badge);

  let last = null;
  const onMove = (e) => {
    if (last) last.classList.remove("yaf-outline");
    last = e.target;
    last.classList.add("yaf-outline");
  };
  const cleanup = () => {
    document.removeEventListener("mouseover", onMove, true);
    document.removeEventListener("click", onClick, true);
    document.removeEventListener("keydown", onKey, true);
    if (last) last.classList.remove("yaf-outline");
    badge.remove();
    style.remove();
    delete window.__yaformfillerPicker;
  };
  const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); cleanup(); browser.runtime.sendMessage({ type: "yaf-picker", selector: null }); } };
  const onClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const sel = buildSelector(e.target);
    cleanup();
    browser.runtime.sendMessage({ type: "yaf-picker", selector: sel });
  };
  document.addEventListener("mouseover", onMove, true);
  document.addEventListener("click", onClick, true);
  document.addEventListener("keydown", onKey, true);
})();
