// YaFormFiller — form validation business rule (options: save/update).
// Pure ES module, no DOM or browser.* dependencies → testable in Node (test/form-rules.test.mjs).
//
// Rule: to save or update a form
//   1. a non-empty name is required;
//   2. AT LEAST 1 valid domain is required (non-empty token after normalization);
//   3. AT LEAST 1 field with a selector set is required;
//   4. the name must not be duplicated among already saved forms.
//
// Messages are i18n message keys (see _locales/*/messages.json); localized by the caller.
export function normalizeDomain(raw) {
  return String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "") // http(s):// scheme accepted as input, removed
    .replace(/\/+$/, ""); // trailing slashes removed
}

// A domain pattern is valid if, after normalization, it is a non-empty string
// without inner whitespace (e.g. "example.com", "https://example.com/app", "*.example.com:8443").
export function isValidDomainPattern(raw) {
  const n = normalizeDomain(raw);
  return n.length > 0 && !/\s/.test(n);
}

export function normalizeDomains(domains) {
  const list = [...new Set((domains ?? []).map(normalizeDomain).filter(Boolean))];
  return list.filter(isValidDomainPattern);
}

/**
 * @param candidate   { name, domains: string[], fields: [{selector, ...}] }
 * @param existingForms  already saved forms (for the duplicate check)
 * @param editingId   id of the form being edited (null for new); a form is not a duplicate of itself
 * @returns {{ ok: true, name: string, domains: string[] } | { ok: false, message: string, details?: unknown[] }}
 */
export function validateForm(candidate, existingForms = [], editingId = null) {
  const name = String(candidate?.name ?? "").trim();
  if (!name) return { ok: false, message: "errorNameRequired" };

  const domains = normalizeDomains(candidate?.domains);
  if (!domains.length) {
    return { ok: false, message: "errorDomainsRequired" };
  }

  const fields = candidate?.fields ?? [];
  if (!fields.length) {
    return { ok: false, message: "errorFieldsRequired" };
  }
  if (fields.some((f) => !String(f?.selector ?? "").trim())) {
    return { ok: false, message: "errorSelectorRequired" };
  }

  const dup = existingForms.some(
    (f) => f.id !== editingId && String(f.name ?? "").trim().toLowerCase() === name.toLowerCase()
  );
  if (dup) {
    return { ok: false, message: "errorDuplicateName", details: [name] };
  }

  return { ok: true, name, domains };
}
