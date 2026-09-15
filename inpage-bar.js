// YaFormFiller — in-page topbar (classic script, injected via executeScript files)
// Form selection + Apply + Clear only. The command (open/close) is passed by the background
// through a control file injected RIGHT BEFORE this script that sets window.__yafMode
// ("show" | "hide"). No dependence on tabs.sendMessage nor executeScript({func}).
//
// Operations are DOM-driven (does #yaf-bar exist?), hence robust even when
// Firefox re-runs the injection in a new context: no implicit toggles.
async function initBar() {
  if (document.getElementById("yaf-bar")) return; // already open: nothing to do

  // ——— Style ———
  const style = document.createElement("style");
  style.id = "yaf-bar-style";
  style.textContent = `
    #yaf-bar {
      position: fixed; top: 0; left: 0; right: 0; z-index: 2147483646;
      background: #1b1e24; color: #e6e9ef; border-bottom: 2px solid #ff6600;
      box-shadow: 0 4px 14px rgba(0,0,0,.45);
      font: 13px/1.4 system-ui, sans-serif;
    }
    #yaf-bar * { box-sizing: border-box; }
    #yaf-bar .bar-row { display: flex; align-items: center; gap: 8px; padding: 6px 12px; }
    #yaf-bar .bar-row b { color: #ff8a3d; white-space: nowrap; }
    #yaf-bar .bar-ver { font-size: 10px; color: #9aa3b2; font-weight: normal; white-space: nowrap; }
    #yaf-bar select {
      background: #2b313d; color: #e6e9ef; border: 1px solid #3a4150;
      border-radius: 6px; padding: 5px 8px; font: inherit; min-width: 0; max-width: 300px;
    }
    #yaf-bar button { font: inherit; border: 1px solid #3a4150; background: #2b313d;
      color: #e6e9ef; border-radius: 6px; padding: 5px 12px; cursor: pointer; white-space: nowrap; }
    #yaf-bar button:hover { border-color: #ff6600; color: #ff8a3d; }
    #yaf-bar button.primary { background: #ff6600; border-color: #ff6600; color: #fff; }
    #yaf-bar button.primary:hover { background: #ff8a3d; color: #fff; }
    #yaf-bar .status { color: #4caf7d; font-size: 12px; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    #yaf-bar .status.err { color: #d9534f; }
  `;
  document.documentElement.append(style);

  let _yafVer = null;
  try { _yafVer = (typeof browser !== "undefined" ? browser : chrome).runtime.getManifest().version; } catch {}
  const t = (key, args) => (typeof browser !== "undefined" ? browser : chrome).i18n.getMessage(key, args);
  const bar = document.createElement("div");
  bar.id = "yaf-bar";
  // Built with DOM APIs, not innerHTML (AMO linter: "Unsafe assignment to innerHTML").
  const row = document.createElement("div");
  row.className = "bar-row";
  const bold = document.createElement("b");
  bold.textContent = "YaFormFiller";
  row.append(bold);
  if (_yafVer) {
    const ver = document.createElement("span");
    ver.className = "bar-ver";
    ver.textContent = `v${_yafVer}`;
    row.append(ver);
  }
  const formSelect = document.createElement("select");
  formSelect.id = "yaf-form-select";
  const loadingOpt = document.createElement("option");
  loadingOpt.value = "";
  loadingOpt.textContent = t("barLoading");
  formSelect.append(loadingOpt);
  row.append(formSelect);
  const applyBtn = document.createElement("button");
  applyBtn.id = "yaf-apply";
  applyBtn.className = "primary";
  applyBtn.textContent = t("barApply");
  row.append(applyBtn);
  const clearBtn = document.createElement("button");
  clearBtn.id = "yaf-clear";
  clearBtn.textContent = t("barClear");
  row.append(clearBtn);
  const statusEl = document.createElement("span");
  statusEl.id = "yaf-status";
  statusEl.className = "status";
  row.append(statusEl);
  bar.append(row);
  document.documentElement.append(bar);

  // ——— Data ———
  const $bar = (s) => bar.querySelector(s);
  const FIELDS_KEY = "savedFormFields";

  // ——— Layout shift: the page slides down below the bar ———
  const PAGESHIFT_ATTR = "data-yaf-shifted";
  const htmlEl = document.documentElement;
  function applyPageShift() {
    const h = bar.getBoundingClientRect().height;
    if (h > 0) {
      htmlEl.style.marginTop = h + "px";
      htmlEl.setAttribute(PAGESHIFT_ATTR, "");
    }
  }
  const ro = new ResizeObserver(applyPageShift);
  ro.observe(bar);
  window.__yafRO = ro; // global reference: destroy invokable from a different context too

  // SELECTED_KEY ('selectedFormIds') comes from form-selection.mjs (see below)
  let forms = [];
  let selectedForm = null;
  // Selector → selected/fields applied last time (used by Clear)
  let appliedSelectors = [];

  // ——— Native setter util ———
  function setNativeValue(el, value) {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function fillInPage(fields) {
    const results = [];
    for (const f of fields) {
      try {
        const el = document.querySelector(f.selector);
        if (!el) { results.push({ selector: f.selector, ok: false, error: t("fillSelectorNotFound") }); continue; }
        const isInput = el instanceof HTMLInputElement;
        if (!isInput && !(el instanceof HTMLTextAreaElement) && !(el instanceof HTMLSelectElement)) {
          results.push({ selector: f.selector, ok: false, error: t("fillUnsupportedElement") }); continue;
        }
        if (isInput && f.type === "password" && el.type !== "password") el.type = "password";
        if (el instanceof HTMLSelectElement) {
          el.value = f.value;
          el.dispatchEvent(new Event("change", { bubbles: true }));
        } else {
          setNativeValue(el, f.value);
        }
        results.push({ selector: f.selector, ok: true });
      } catch (e) {
        results.push({ selector: f.selector, ok: false, error: String(e?.message ?? e) });
      }
    }
    return results;
  }

  function clearInPage(selectors) {
    let done = 0, missed = 0;
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (!el) { missed++; continue; }
      if (el instanceof HTMLSelectElement) { el.value = ""; el.dispatchEvent(new Event("change", { bubbles: true })); }
      else if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) setNativeValue(el, "");
      else continue;
      done++;
    }
    return { done, missed };
  }

  function flash(msg, err) {
    statusEl.textContent = msg;
    statusEl.classList.toggle("err", !!err);
    setTimeout(() => { statusEl.textContent = ""; }, 2500);
  }

  // ——— Storage (content script: storage.local available) ———
  async function load() {
    const d = await browser.storage.local.get(FIELDS_KEY);
    return d[FIELDS_KEY] ?? [];
  }

  // Extracted business logic (testable): form-selection.mjs — injected by the background
  // as a classic script BEFORE this file (the domains.js dual-load pattern).
  // NO dynamic import(): in a classic content script it fails in Firefox and the
  // bar would remain stuck on "Loading…".
  const { SELECTED_KEY, compareFormNames, sortFormsAlphabetically, selectInitialForm, pageUriOf } =
    globalThis.YAFSelection;

  // Page URI as persistence key: origin + path (no query/hash,
  // which vary per list/detail page). E.g. https://www.example.com/users
  // Mutated by refreshForms() on SPA navigation (pushState/replaceState/popstate)
  // so manual selections after a navigation are keyed to the new pathname.
  let pageUri = pageUriOf(window.location);
  // Change marker (origin+pathname) to serialize navigation-triggered refreshes.
  let lastPageUri = pageUri;

  // Sets the selected form and persists the choice per domain (skipSave = true to avoid
  // recursion when the form is already the saved choice: only set it),
  // otherwise false (first form in alphabetical order or user selection).
  function setSelected(form, skipSave) {
    selectedForm = form ?? null;
    if (formSelect.value !== (form?.id ?? "")) formSelect.value = form?.id ?? "";
    if (!skipSave && pageUri) {
      void (async () => {
        const d = await browser.storage.local.get(SELECTED_KEY);
        const map = d[SELECTED_KEY] ?? {};
        if (map[pageUri] === (form?.id ?? "")) return; // already saved: skip rewriting
        map[pageUri] = form?.id ?? "";
        if (!form) delete map[pageUri];
        await browser.storage.local.set({ [SELECTED_KEY]: map });
      })();
    }
    return selectedForm;
  }

  // ——— Wiring ———
  formSelect.addEventListener("change", () => {
    // Manual user selection: set and save the choice
    setSelected(forms.find((f) => f.id === formSelect.value) ?? null, false);
  });

  $bar("#yaf-apply").addEventListener("click", () => {
    if (!selectedForm) return flash(t("barSelectFormFirst"), true);
    const results = fillInPage(selectedForm.fields);
    appliedSelectors = results.filter((r) => r.ok).map((r) => r.selector);
    const ok = results.length - (results.length - appliedSelectors.length);
    const bad = results.length - appliedSelectors.length;
    if (!results.length) return flash(t("barFormNoFields"), true);
    if (!bad) flash(t("barAppliedAll", [ok]));
    else flash(t("barAppliedPartial", [ok, results.length, bad]), true);
  });

  $bar("#yaf-clear").addEventListener("click", () => {
    // Clears the applied fields; if none were ever applied, uses the selected form's fields
    const selectors = appliedSelectors.length ? appliedSelectors : (selectedForm?.fields ?? []).map((f) => f.selector).filter(Boolean);
    if (!selectors.length) return flash(t("barNothingToClear"), true);
    const { done, missed } = clearInPage(selectors);
    flash(missed ? t("barClearedMissed", [done, missed]) : t("barCleared", [done]), !!missed && !done);
  });

  // Rebuilds the select options from an already-sorted valid-forms list.
  // Returns true when at least one form is usable.
  function populateOptions(validForms) {
    formSelect.innerHTML = "";
    if (!validForms.length) {
      const o = document.createElement("option");
      o.value = "";
      o.textContent = forms.length ? t("barNoValidForms") : t("barNoSavedForms");
      formSelect.append(o);
      return false;
    }
    for (const f of validForms) {
      const o = document.createElement("option");
      o.value = f.id;
      o.textContent = `${f.name} · ${t("optionsFieldsCount", [f.fields.length])}`;
      formSelect.append(o);
    }
    return true;
  }

  async function setInitialFromStorage(validForms, skipSave) {
    try {
      const { [SELECTED_KEY]: map } = await browser.storage.local.get(SELECTED_KEY);
      const { form: initial, changed } = selectInitialForm({ validForms, savedMap: map, pageUri });
      // Boot (skipSave=!changed):
      //   changed=false → form found from storage: just set it (no re-save, no loop)
      //   changed=true  → choice missing/invalid: set and save
      // Refresh (navigation): ALWAYS skipSave=true → the automated re-selection is
      // non-user activity and must never write to storage.local.
      setSelected(initial, skipSave || !changed);
    } catch {
      setSelected(sortFormsAlphabetically(validForms)[0], skipSave);
    }
  }

  // ——— SPA navigation refresh (debounced; wired at the end of the file) ———
  // In-place refresh of the bar after a pushState/replaceState/popstate change of
  // origin+pathname. Reuses the boot-time logic (fresh load() → formsForUrl →
  // alphabetical select → selectInitialForm → setSelected) but ALWAYS ends in
  // setSelected(skipSave=true): automated re-selection never writes to storage.
  // pageUriOf(window.location) is recomputed here at call time (never the boot const).
  // Idempotent: guarded by lastPageUri so hash-only/same-path navigations skip the
  // storage read and the DOM update entirely.
  async function refreshForms() {
    const newPageUri = pageUriOf(window.location);
    // Decision shared with the tests (YAFSpaNav): same/null URI → no work.
    if (!globalThis.YAFSpaNav.pageUriChanged(lastPageUri, newPageUri)) return false;
    lastPageUri = newPageUri;
    const targetUri = newPageUri; // re-checked after awaits: a newer refresh wins
    pageUri = newPageUri;
    forms = await load();
    if (pageUriOf(window.location) !== targetUri) return false;
    const validForms = formsForUrl(forms, window.location)
      .toSorted(compareFormNames);
    if (!populateOptions(validForms)) setSelected(null, true);
    else await setInitialFromStorage(validForms, true);
    return true;
  }
  // Exposed for the debounced navigation listener at the end of the file; cleared by
  // __yafHide() so a hidden bar is never refreshed.
  window.__yafRefreshForms = refreshForms;

  // ——— Boot ———
  forms = await load();
  // Shared domains: YAFDomains from domains.js (injected before inpage-bar.js by the background)
  const { domainMatches, formsForUrl } = globalThis.YAFDomains;
  void domainMatches; // exposed for manual use in console/debug
  // List of forms in alphabetical order (by name, case-insensitive)
  const validForms = formsForUrl(forms, window.location)
    .toSorted(compareFormNames);
  if (populateOptions(validForms)) await setInitialFromStorage(validForms, false);
  else setSelected(null, true);
}

// ——— DOM-driven operations (independent of the injection context) ———
window.__yafShow = function () {
  if (document.getElementById("yaf-bar")) return Promise.resolve({ ok: true, changed: false });
  return initBar().then(() => ({ ok: true, changed: true }));
};
window.__yafHide = function () {
  if (!document.getElementById("yaf-bar")) return Promise.resolve({ ok: true, changed: false });
  try { window.__yafRO?.disconnect(); } catch (e) {}
  delete window.__yafRO;
  // A hidden bar must not be refreshed by SPA navigation.
  window.__yafCancelSpaRefresh?.();
  delete window.__yafRefreshForms;
  const htmlEl = document.documentElement;
  if (htmlEl.hasAttribute("data-yaf-shifted")) {
    htmlEl.style.marginTop = "";
    htmlEl.removeAttribute("data-yaf-shifted");
  }
  document.getElementById("yaf-bar")?.remove();
  document.getElementById("yaf-bar-style")?.remove();
  return Promise.resolve({ ok: true, changed: true });
};
window.__yafApply = function (mode) {
  if (mode === "hide") return window.__yafHide();
  return window.__yafShow();
};

// ——— Execution of the background command (from control file) ———
if (window.__yafMode === "hide") void window.__yafApply("hide");
else if (window.__yafMode === "show") void window.__yafApply("show");
window.__yafMode = null;

// ——— SPA navigation detection (classic-script compatible: no import(), no sendMessage) ———
// Logic shared with the tests: YAFSpaNav from spa-navigation.mjs (injected before this
// file by the background, same dual-load pattern as domains.js/form-selection.mjs).
// Debounced (REFRESH_DEBOUNCE_MS): rapid successive navigations (e.g. several pushState
// calls in a row) coalesce into one refresh per tick; the refresh itself is guarded by
// the origin+pathname change marker, so hash-only or same-path navigations cause zero
// storage reads / DOM churn.
window.__yafCancelSpaRefresh = function () {
  if (window.__yafSpaTimer) { clearTimeout(window.__yafSpaTimer); window.__yafSpaTimer = null; }
};
function scheduleSpaRefresh() {
  window.__yafCancelSpaRefresh();
  window.__yafSpaTimer = setTimeout(() => {
    window.__yafSpaTimer = null;
    void window.__yafRefreshForms?.();
  }, globalThis.YAFSpaNav.REFRESH_DEBOUNCE_MS);
}
// IMPORTANT: executeScript files run in an ISOLATED world. A wrapper installed there on
// history.pushState/replaceState never sees calls made by the PAGE (a different realm),
// so pushState-driven SPA navigation would stay silent. The patch must live in the page
// world: we inject the tiny classic script from YAFSpaNav.pageWorldPatchSource as an
// inline <script>; it wraps pushState/replaceState and, on any SPA navigation
// (pushState/replaceState/popstate/hashchange), dispatches the CustomEvent "yaf-spa-nav"
// which we listen for here. DOM events are visible from the isolated world.
try {
  const s = document.createElement("script");
  s.textContent = globalThis.YAFSpaNav.pageWorldPatchSource();
  document.documentElement.append(s);
  s.remove(); // inline scripts keep working after being detached
} catch (e) {}
// Re-listen on every injection (the listener itself is idempotent; the event is ignored
// when the bar is closed and the refresh marker skips unchanged URLs).
window.addEventListener(globalThis.YAFSpaNav.NAV_EVENT, scheduleSpaRefresh);
// Safety net for strict-CSP pages where the inline page-world script above is blocked
// (no error is thrown, it just never runs): cheap poll comparing origin+pathname.
// refreshForms() short-circuits on an unchanged URL without any storage read or DOM work.
if (!window.__yafSpaPoll) {
  window.__yafSpaPoll = setInterval(() => {
    if (!window.__yafRefreshForms && !document.getElementById("yaf-bar")) return;
    void window.__yafRefreshForms?.();
  }, globalThis.YAFSpaNav.POLL_FALLBACK_MS);
}
try { window.addEventListener("pagehide", () => window.__yafCancelSpaRefresh?.(), { once: true }); } catch (e) {}
