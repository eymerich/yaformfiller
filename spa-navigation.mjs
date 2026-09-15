// YaFormFiller — business logic of the SPA navigation detection in the topbar.
// Classic-script-compatible (like domains.js / form-selection.mjs): no exports, exposes
// globalThis.YAFSpaNav. Also used as an ES module in Node tests (assigning to globalThis
// works in both contexts). Do not use dynamic `import()` from classic content scripts:
// in Firefox it fails and the bar stays stuck on "Loading…".
(function () {
  // Rules:
  //  1. The bar refreshes itself on SPA navigation (history.pushState/replaceState,
  //     popstate, hashchange) — no full page reload needed.
  //  2. Only a change of origin+pathname (see YAFSelection.pageUriOf, which excludes
  //     query and hash) triggers a refresh. Hash-only navigation (hashchange, or a
  //     pushState/replaceState with a new hash on the same path) is skipped.
  //  3. The page-world history patch must be a classic script (no modules, no import()):
  //     it is injected as an inline <script> element from the content-script isolated
  //     world, because a wrapper installed in the isolated world never sees calls made
  //     by the page realm.
  //  4. Event sent to the content script: CustomEvent "yaf-spa-nav" on window (DOM
  //     events are visible across worlds); the actual refresh decision and debounce
  //     happen in inpage-bar.js.

  // Debounce for SPA-navigation refresh scheduling: rapid successive navigations
  // (e.g. several pushState calls in a row) coalesce into one refresh per tick.
  const REFRESH_DEBOUNCE_MS = 300;
  // Safety net for strict-CSP pages where inline scripts are blocked (no error is
  // thrown, the patch just never runs): cheap poll comparing origin+pathname.
  // The refresh short-circuits on an unchanged URL with zero storage reads / DOM work.
  const POLL_FALLBACK_MS = 500;
  const NAV_EVENT = "yaf-spa-nav";

  // Refresh decision: compare the previous page URI (origin+pathname) with the one at
  // navigation time. Refresh only when the new URI is known (not null) AND differs
  // from the previous one. Idempotent: same URI → no refresh (no storage reads, no DOM).
  function pageUriChanged(prevUri, nextUri) {
    return !!nextUri && nextUri !== prevUri;
  }

  // Source of the page-world classic script. Instructed as text of an inline <script>
  // appended to document.documentElement (AMO-safe: no remote code, no eval).
  // It wraps history.pushState/replaceState in the PAGE realm and re-emits every SPA
  // navigation source (pushState, replaceState, popstate, hashchange) as a single
  // CustomEvent("yaf-spa-nav") on window, which the content script listens for.
  // Runs once per page (guarded by window.__yafSpaMainPatched) so re-injections never
  // stack wrappers (double-fires).
  function pageWorldPatchSource() {
    return `(function () {
  if (window.__yafSpaMainPatched) return;
  window.__yafSpaMainPatched = true;
  function emit(ev) { try { var CE = window.CustomEvent; if (!CE) return; window.dispatchEvent(new CE("${NAV_EVENT}", { detail: ev })); } catch (e) {} }
  ["pushState", "replaceState"].forEach(function (m) {
    var orig = history[m];
    if (typeof orig !== "function") return;
    history[m] = function () { var r = orig.apply(this, arguments); emit("history"); return r; };
  });
  window.addEventListener("popstate", function () { emit("popstate"); });
  window.addEventListener("hashchange", function () { emit("hashchange"); });
})();`;
  }

  globalThis.YAFSpaNav = { NAV_EVENT, REFRESH_DEBOUNCE_MS, POLL_FALLBACK_MS, pageUriChanged, pageWorldPatchSource };
})();
