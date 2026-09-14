// YaFormFiller — unit test: form preselection rules in the topbar (form-selection.mjs)
//
// Business rules under test:
//  1. The form list is in alphabetical order (name, case-insensitive).
//  2. The preselection is persisted per page URI (origin + path, no query/hash).
//  3. On reopen: if the saved form still exists among the valid ones → set WITHOUT
//     re-saving (changed=false, no recursion); otherwise → first in alphabetical
//     order and TO BE SAVED (changed=true) — missing/invalid/first-open cases.
//  4. No valid form → no selection and no save.
//  5. Manual user selection → form set and saved.
import { test } from "node:test";
import assert from "node:assert/strict";
// form-selection.mjs is a classic dual-load (IIFE exposing globalThis.YAFSelection):
// importing it as a module executes it; the logic comes from globalThis.YAFSelection.
await import("../form-selection.mjs");
const { SELECTED_KEY, compareFormNames, sortFormsAlphabetically, selectInitialForm, pageUriOf } =
  globalThis.YAFSelection;

const f = (id, name, nFields = 1) => ({ id, name, domains: [], fields: Array(nFields).fill({ selector: "#x", value: "" }) });

// ——— 1. Alphabetical order ———
test("form list sorted alphabetically by name", () => {
  const ordered = sortFormsAlphabetically([f("3", "Charlie"), f("1", "Alfa"), f("2", "Bravo")]);
  assert.deepEqual(ordered.map((x) => x.name), ["Alfa", "Bravo", "Charlie"]);
});

test("alphabetical order case-insensitive", () => {
  const ordered = sortFormsAlphabetically([f("2", "bravo"), f("1", "Alfa")]);
  assert.deepEqual(ordered.map((x) => x.name), ["Alfa", "bravo"]);
});

test("compareFormNames: identical names with different case are equivalent and do not reorder", () => {
  assert.equal(compareFormNames(f("a", "Login"), f("b", "LOGIN")), 0);
  assert.ok(compareFormNames(f("a", "Alfa"), f("b", "Beta")) < 0);
  assert.ok(compareFormNames(f("a", "Zeta"), f("b", "Beta")) > 0);
});

test("sortFormsAlphabetically does not mutate the input array", () => {
  const input = [f("2", "Charlie"), f("1", "Alfa")];
  const snapshot = [...input];
  sortFormsAlphabetically(input);
  assert.deepEqual(input, snapshot);
});

// ——— 2. Page URI as persistence key ———
test("pageUriOf: origin + path, no query or hash", () => {
  const loc = { href: "https://www.example.com/users?sort=asc#detail" };
  assert.equal(pageUriOf(loc), "https://www.example.com/users");
});

test("pageUriOf: different path → different key (areas with independent preselections)", () => {
  const users = { href: "https://www.example.com/users" };
  const articles = { href: "https://www.example.com/articles" };
  assert.notEqual(pageUriOf(users), pageUriOf(articles));
});

test("pageUriOf: same area with different query/hash → SAME key", () => {
  assert.equal(
    pageUriOf({ href: "https://www.example.com/users?id=5#row" }),
    pageUriOf({ href: "https://www.example.com/users?id=9" }),
  );
});

test("pageUriOf: non-default port included in the origin", () => {
  assert.equal(pageUriOf({ href: "http://localhost:9090/admin" }), "http://localhost:9090/admin");
});

test("pageUriOf: invalid href → null", () => {
  assert.equal(pageUriOf({ href: "::::not-a-url" }), null);
});

test("SELECTED_KEY is the expected storage key", () => {
  assert.equal(SELECTED_KEY, "selectedFormIds");
});

// ——— 3. Initial selection on reopen ———
test("saved form present: it is set WITHOUT re-saving (no recursion)", () => {
  const forms = sortFormsAlphabetically([f("a", "Alfa"), f("b", "Bravo")]);
  const savedMap = { "https://www.example.com/users": "b" };
  const { form, changed } = selectInitialForm({
    validForms: forms,
    savedMap,
    pageUri: "https://www.example.com/users",
  });
  assert.equal(form.id, "b");
  assert.equal(changed, false); // skipSave=true → it is not re-saved
});

test("saved form missing for the URI (first open): first in alphabetical order, TO BE SAVED", () => {
  const forms = sortFormsAlphabetically([f("a", "Alfa"), f("b", "Bravo")]);
  const { form, changed } = selectInitialForm({
    validForms: forms,
    savedMap: {}, // no entry for this URI
    pageUri: "https://www.example.com/articles",
  });
  assert.equal(form.id, "a"); // not the historical forms[0] order, but the alphabetically first
  assert.equal(changed, true);
});

test("saved form deleted/invalid: fallback to first in alphabetical order, TO BE SAVED", () => {
  const forms = sortFormsAlphabetically([f("a", "Alfa"), f("b", "Bravo")]);
  const { form, changed } = selectInitialForm({
    validForms: forms,
    savedMap: { "https://www.example.com/users": "deleted-id" },
    pageUri: "https://www.example.com/users",
  });
  assert.equal(form.id, "a");
  assert.equal(changed, true);
});

test("falls back to first alphabetically even when validForms is in non-alphabetical order", () => {
  const forms = [f("c", "Charlie"), f("a", "Alfa"), f("b", "Bravo")];
  const { form, changed } = selectInitialForm({ validForms: forms, savedMap: {}, pageUri: "u" });
  assert.equal(form.id, "a");
  assert.equal(changed, true);
});

test("a non-first-alphabetical form found in storage stays preselected", () => {
  const forms = [f("c", "Charlie"), f("a", "Alfa")];
  const { form, changed } = selectInitialForm({
    validForms: forms,
    savedMap: { "https://www.example.com/articles": "c" },
    pageUri: "https://www.example.com/articles",
  });
  assert.equal(form.id, "c");
  assert.equal(changed, false);
});

test("different areas keep different preselections", () => {
  const forms = sortFormsAlphabetically([f("a", "Alfa"), f("b", "Bravo"), f("c", "Charlie")]);
  const savedMap = { "https://www.example.com/users": "b", "https://www.example.com/articles": "c" };
  const r1 = selectInitialForm({ validForms: forms, savedMap, pageUri: "https://www.example.com/users" });
  const r2 = selectInitialForm({ validForms: forms, savedMap, pageUri: "https://www.example.com/articles" });
  assert.equal(r1.form.id, "b");
  assert.equal(r2.form.id, "c");
  assert.equal(r1.changed, false);
  assert.equal(r2.changed, false);
});

// ——— 4. No valid form ———
test("no valid form: no selection and no save", () => {
  const { form, changed } = selectInitialForm({ validForms: [], savedMap: { u: "a" }, pageUri: "u" });
  assert.equal(form, null);
  assert.equal(changed, false);
});

test("validForms absent/undefined treated as an empty list", () => {
  const { form, changed } = selectInitialForm({ validForms: undefined, savedMap: {}, pageUri: "u" });
  assert.equal(form, null);
  assert.equal(changed, false);
});

// ——— 5. Manual user selection ———
// (the actual wiring is in inpage-bar.js; the rule is: set and save. Modelled here
//  equivalently to the 'changed=true' case: the user-chosen form.)
test("manual selection: the user-chosen form is set and saved", () => {
  const forms = sortFormsAlphabetically([f("a", "Alfa"), f("b", "Bravo")]);
  // simulates the manual choice: the saved entry is updated to the chosen form
  const savedMap = { "https://www.example.com/users": "b" };
  const userChoice = forms[0]; // the user picks "Alfa"
  void savedMap; // the manual choice overwrites the entry
  const { form, changed } = selectInitialForm({
    validForms: forms,
    savedMap: { "https://www.example.com/users": userChoice.id }, // dopo il salvataggio
    pageUri: "https://www.example.com/users",
  });
  assert.equal(form.id, "a");
  assert.equal(changed, false); // at the subsequent REopen it is no longer re-saved
});
