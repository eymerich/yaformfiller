// YaFormFiller — business logic of form preselection in the topbar.
// Classic-script-compatible (like domains.js): no exports, exposes globalThis.YAFSelection.
// Also used as an ES module in Node tests (assigning to globalThis works in
// both contexts). Do not use dynamic `import()` from classic content scripts:
// in Firefox it fails and the bar stays stuck on "Loading…".
(function () {
  // Rules:
  //  1. The list of valid forms is shown in alphabetical order (name, case-insensitive).
  //  2. The preselection is persisted per page URI (origin + path, no query/hash):
  //     map { pageUri: formId } in storage.local under 'selectedFormIds'.
  //  3. On reopen, if the saved form for the URI still exists among the valid ones → it is
  //     set WITHOUT re-saving (no recursion); otherwise the FIRST form in alphabetical
  //     order is selected and the choice is saved (cases: missing/invalid, first open,
  //     manual user selection).
  //  4. No valid form for the page → no selection and no save.
  const SELECTED_KEY = "selectedFormIds";

  // Alphabetical comparison for the list: name, case-insensitive, base sensitivity
  function compareFormNames(a, b) {
    return (a?.name ?? "").localeCompare(b?.name ?? "", undefined, { sensitivity: "base" });
  }

  function sortFormsAlphabetically(forms) {
    return [...forms].sort(compareFormNames);
  }

  // Page URI to persist: origin + pathname (query and hash excluded)
  function pageUriOf(location) {
    try {
      const u = new URL(location.href);
      return u.origin + u.pathname;
    } catch {
      return null;
    }
  }

  /**
   * Determina la preselezione iniziale.
   * @param {object} p
   * @param {Array} p.validForms  Forms valid for the page, already in display order
   * @param {object|undefined} p.savedMap  Map { pageUri: formId } read from storage
   * @param {string|null} p.pageUri  Current page URI (see pageUriOf)
   * @returns {{ form: object|null, changed: boolean }} the form to select and whether to save the choice
   */
  function selectInitialForm({ validForms, savedMap, pageUri }) {
    if (!validForms?.length) return { form: null, changed: false };
    const savedForm = pageUri ? validForms.find((f) => f.id === savedMap?.[pageUri]) : null;
    if (savedForm) return { form: savedForm, changed: false };
    // Saved form missing/invalid (or no entry): first in alphabetical order, to be saved
    const first = sortFormsAlphabetically(validForms)[0];
    return { form: first, changed: true };
  }

  globalThis.YAFSelection = { SELECTED_KEY, compareFormNames, sortFormsAlphabetically, selectInitialForm, pageUriOf };
})();
