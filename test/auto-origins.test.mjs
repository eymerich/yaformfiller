// YaFormFiller — unit tests of the autoOrigins entry logic (storage format
// [{ url: <origin URL>, with_submit: bool }], see auto-origins.mjs / background.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeAutoOrigins,
  findEntry,
  hasOrigin,
  setOriginEnabled,
  setEntryWithSubmit,
} from "../auto-origins.mjs";

const entry = (url, with_submit = false) => ({ url, with_submit });

// ——— normalizeAutoOrigins ———
test("normalize: round-trip of a valid object-format list", () => {
  const raw = [entry("https://a.example.com", true), entry("https://b.example.com", false)];
  assert.deepEqual(normalizeAutoOrigins(raw), raw);
  // idempotent write→read
  assert.deepEqual(normalizeAutoOrigins(normalizeAutoOrigins(raw)), raw);
});

test("normalize: drops invalid entries (not objects, missing/empty url)", () => {
  const raw = [null, "https://old.example.com", entry(""), entry("https://ok.example.com", true)];
  assert.deepEqual(normalizeAutoOrigins(raw), [entry("https://ok.example.com", true)]);
});

test("normalize: non-array input → empty list; missing with_submit → false", () => {
  assert.deepEqual(normalizeAutoOrigins(undefined), []);
  assert.deepEqual(normalizeAutoOrigins({ url: "https://x", with_submit: true }), []);
  assert.deepEqual(normalizeAutoOrigins([entry("https://x")]), [entry("https://x", false)]);
});

// ——— hasOrigin / findEntry ———
test("hasOrigin/findEntry: membership on the object format", () => {
  const list = [entry("https://a.example.com", true)];
  assert.equal(hasOrigin(list, "https://a.example.com"), true);
  assert.equal(hasOrigin(list, "https://b.example.com"), false);
  assert.equal(hasOrigin(list, null), false);
  assert.deepEqual(findEntry(list, "https://a.example.com"), entry("https://a.example.com", true));
  assert.equal(findEntry(list, "https://b.example.com"), null);
});

// ——— setOriginEnabled (popup toggle semantics) ———
test("toggle: enabling a brand-new origin writes with_submit: false", () => {
  const next = setOriginEnabled([], "https://a.example.com", true);
  assert.deepEqual(next, [entry("https://a.example.com", false)]);
});

test("toggle: enabling an already-stored origin preserves its with_submit", () => {
  const list = [entry("https://a.example.com", true), entry("https://b.example.com", false)];
  assert.deepEqual(setOriginEnabled(list, "https://a.example.com", true), [
    entry("https://b.example.com", false),
    entry("https://a.example.com", true),
  ]);
});

test("toggle: disabling removes the whole entry", () => {
  const list = [entry("https://a.example.com", true), entry("https://b.example.com", false)];
  assert.deepEqual(setOriginEnabled(list, "https://a.example.com", false), [
    entry("https://b.example.com", false),
  ]);
});

test("toggle: enabling passes with_submit only for new origins (existing value wins)", () => {
  const next = setOriginEnabled([entry("https://a.example.com", true)], "https://a.example.com", true, false);
  assert.deepEqual(next, [entry("https://a.example.com", true)]);
});

test("toggle: null/unknown origin leaves the list untouched", () => {
  const list = [entry("https://a.example.com", true)];
  assert.deepEqual(setOriginEnabled(list, null, true), list);
});

// ——— setEntryWithSubmit (in-page checkbox persistence) ———
test("with_submit update: only stored origins are touched", () => {
  const list = [entry("https://a.example.com", true)];
  assert.deepEqual(setEntryWithSubmit(list, "https://a.example.com", false), [
    entry("https://a.example.com", false),
  ]);
  // no entry for the origin (e.g. invisible page without autoOrigins entry) → no write
  const list2 = [entry("https://b.example.com", true)];
  assert.deepEqual(setEntryWithSubmit(list2, "https://a.example.com", true), list2);
  assert.equal(setEntryWithSubmit(list2, null, true), list2);
});

// ——— background yaf-auto-get/yaf-auto-set semantics (shape of the returned state) ———
test("yaf-auto-get shape: enabled + with_submit exposed alongside", () => {
  const list = [entry("https://a.example.com", true)];
  const e = findEntry(list, "https://a.example.com");
  assert.deepEqual({ enabled: !!e, with_submit: !!e?.with_submit }, {
    enabled: true,
    with_submit: true,
  });
  const e2 = findEntry(list, "https://missing.example.com");
  assert.deepEqual({ enabled: !!e2, with_submit: !!e2?.with_submit }, {
    enabled: false,
    with_submit: false,
  });
});
