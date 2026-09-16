// YaFormFiller — auto-origins entry logic (pure functions, no browser.* dependencies).
// Stored format under 'autoOrigins' (background.js AUTO_KEY):
//   [{ url: <origin URL>, with_submit: true|false }]
// At most one entry per origin; "with_submit" is the in-page topbar "With submit"
// checkbox state, persisted together with the origin.
// Note: no migration from the old flat-array-of-strings format (breaking change accepted).

export function normalizeAutoOrigins(raw) {
  const list = Array.isArray(raw) ? raw : [];
  const out = [];
  for (const e of list) {
    if (!e || typeof e !== "object" || typeof e.url !== "string" || !e.url) continue;
    out.push({ url: e.url, with_submit: !!e.with_submit });
  }
  return out;
}

export function findEntry(list, origin) {
  if (!origin) return null;
  return list.find((e) => e.url === origin) ?? null;
}

export function hasOrigin(list, origin) {
  return !!findEntry(list, origin);
}

/**
 * Enable/disable an origin.
 * - enabled  → entry present: keep its existing "with_submit" (preserved across
 *              popup toggles); brand-new origin → "with_submit: false".
 * - disabled → the whole entry is dropped.
 */
export function setOriginEnabled(list, origin, enabled, withSubmit = false) {
  if (!origin) return list;
  const rest = list.filter((e) => e.url !== origin);
  if (!enabled) return rest;
  const prev = findEntry(list, origin);
  return [...rest, { url: origin, with_submit: prev ? prev.with_submit : !!withSubmit }];
}

/** Update the "with_submit" of an existing entry; no-op when the origin isn't stored. */
export function setEntryWithSubmit(list, origin, withSubmit) {
  const entry = findEntry(list, origin);
  if (!entry) return list;
  return list.map((e) => (e.url === origin ? { ...e, with_submit: !!withSubmit } : e));
}
