// YaFormFiller — i18n helpers for extension pages (popup, options).
// Thin wrapper around browser.i18n plus DOM auto-translation via data attributes:
//   data-i18n                 → textContent
//   data-i18n-title           → title attribute (and aria-label)
//   data-i18n-placeholder     → placeholder attribute
//   data-i18n-aria-label      → aria-label attribute
//   data-i18n-html            → innerHTML (only for trusted, app-owned strings)

const api = (typeof browser !== "undefined" ? browser : chrome).i18n;

export function t(key, substitutions) {
  return api.getMessage(key, substitutions) ?? key;
}

export function applyI18n(root = document) {
  for (const el of root.querySelectorAll("[data-i18n]")) {
    el.textContent = t(el.dataset.i18n);
  }
  for (const el of root.querySelectorAll("[data-i18n-html]")) {
    el.innerHTML = t(el.dataset.i18nHtml);
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
