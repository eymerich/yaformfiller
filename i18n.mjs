// YaFormFiller — i18n helpers for extension pages (popup, options).
// Thin wrapper around browser.i18n plus DOM auto-translation via data attributes:
//   data-i18n                 → textContent
//   data-i18n-title           → title attribute (and aria-label)
//   data-i18n-placeholder     → placeholder attribute
//   data-i18n-aria-label      → aria-label attribute
//   data-i18n-html            ▸ sanitized HTML (only for trusted, app-owned strings;
//                                parsed inertly and whitelisted, never via innerHTML)

const api = (typeof browser !== "undefined" ? browser : chrome).i18n;

export function t(key, substitutions) {
  return api.getMessage(key, substitutions) ?? key;
}

// Insert trusted, app-owned HTML without assigning to innerHTML (AMO linter:
// "Unsafe assignment to innerHTML"). The string is loaded from our own _locales
// catalog, so it is app-controlled by definition; still, we parse it in an inert
// document (DOMParser output never executes scripts and fires no events) and
// re-emit only a whitelist of safe elements/attributes as real DOM nodes.
const SAFE_HTML_ELEMENTS = new Set(["CODE", "B", "I", "EM", "STRONG", "BR", "SPAN"]);
function insertSanitizedHtml(el, html) {
  const frag = new DOMParser().parseFromString(html, "text/html").body;
  const out = document.createDocumentFragment();
  const copy = (node, parent) => {
    for (const child of node.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        parent.append(document.createTextNode(child.textContent));
      } else if (child.nodeType === Node.ELEMENT_NODE && SAFE_HTML_ELEMENTS.has(child.tagName)) {
        const clone = document.createElement(child.tagName);
        copy(child, clone);
        parent.append(clone);
      }
      // Anything else (scripts, other elements, comments) is dropped.
    }
  };
  copy(frag, out);
  el.replaceChildren(out);
}

export function applyI18n(root = document) {
  for (const el of root.querySelectorAll("[data-i18n]")) {
    el.textContent = t(el.dataset.i18n);
  }
  for (const el of root.querySelectorAll("[data-i18n-html]")) {
    insertSanitizedHtml(el, t(el.dataset.i18nHtml));
  }
  for (const el of root.querySelectorAll("[data-i18n-title]")) {
    el.title = t(el.dataset.i18nTitle);
    if (!el.getAttribute("aria-label")) el.setAttribute("aria-label", el.title);
  }
  for (const el of root.querySelectorAll("[data-i18n-placeholder]")) {
    el.placeholder = t(el.dataset.i18nPlaceholder);
  }
  for (const el of root.querySelectorAll("[data-i18n-aria-label]")) {
    el.setAttribute("aria-label", t(el.dataset.i18nAriaLabel));
  }
  root.documentElement.lang = api.getUILanguage().split("-")[0];
}
