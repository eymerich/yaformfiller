// YaFormFiller — unit test of the form save/update business rule.
// Rule: to save or update a form, AT LEAST 1 valid domain and AT LEAST 1 field with a
// selector set are required (plus: non-empty name and no duplicate name).
import { test } from "node:test";
import assert from "node:assert/strict";
import { validateForm, normalizeDomain, normalizeDomains, isValidDomainPattern } from "../form-rules.mjs";

const validForm = (over = {}) => ({
  name: "Keycloak",
  domains: ["localhost"],
  fields: [{ type: "text", selector: "#username", value: "admin" }],
  ...over,
});
const existing = [{ id: "f1", name: "Keycloak", domains: ["localhost"], fields: [] }];

test("ok: name + 1 valid domain + 1 field with selector → valid", () => {
  const r = validateForm(validForm(), []);
  assert.equal(r.ok, true);
  assert.equal(r.name, "Keycloak");
});

test("at least 1 domain is required: empty domain list → blocked", () => {
  const r = validateForm(validForm({ domains: [] }), []);
  assert.equal(r.ok, false);
  assert.match(r.message, /errorDomainsRequired/);
});

test("at least 1 domain is required: null/undefined domains → blocked", () => {
  assert.equal(validateForm(validForm({ domains: null }), []).ok, false);
  assert.equal(validateForm(validForm({ domains: undefined }), []).ok, false);
});

test("domains with only whitespace / empty strings → invalid → blocked", () => {
  const r = validateForm(validForm({ domains: ["", "   ", "     "]}), []);
  assert.equal(r.ok, false);
  assert.match(r.message, /errorDomainsRequired/);
});

test("domain with http(s):// scheme accepted as input (normalized)", () => {
  const r = validateForm(validForm({ domains: ["https://Example.com "] }), []);
  assert.equal(r.ok, true);
  assert.deepEqual(r.domains, ["example.com"]);
});

test("wildcard and port are valid patterns", () => {
  assert.equal(validateForm(validForm({ domains: ["*.example.com"] }), []).ok, true);
  assert.equal(validateForm(validForm({ domains: ["example.com:8443"] }), []).ok, true);
});

test("pattern with inner whitespace invalid → blocked", () => {
  const r = validateForm(validForm({ domains: ["ex ample.com"] }), []);
  assert.equal(r.ok, false);
  assert.match(r.message, /errorDomainsRequired/);
});

test("at least 1 field is required: no fields → blocked", () => {
  const r = validateForm(validForm({ fields: [] }), []);
  assert.equal(r.ok, false);
  assert.match(r.message, /errorFieldsRequired/);
});

test("field without selector set → blocked", () => {
  const r = validateForm(
    validForm({ fields: [{ type: "text", selector: "  ", value: "x" }] }),
    []
  );
  assert.equal(r.ok, false);
  assert.match(r.message, /errorSelectorRequired/);
});

test("missing/whitespace-only name → blocked (with valid domains present)", () => {
  const r = validateForm(validForm({ name: "   " }), []);
  assert.equal(r.ok, false);
  assert.match(r.message, /errorNameRequired/);
});

test("duplicate name (case-insensitive) → blocked", () => {
  const r = validateForm(validForm({ name: "KEYCLOAK" }), existing, null);
  assert.equal(r.ok, false);
  assert.match(r.message, /errorDuplicateName/);
});

test("duplicate name but it is the form being edited (same id) → ok (update)", () => {
  const r = validateForm(validForm(), existing, "f1");
  assert.equal(r.ok, true);
});

test("update: domain removed (now empty) blocks the update as well", () => {
  const r = validateForm(validForm({ domains: [] }), existing, "f1");
  assert.equal(r.ok, false);
  assert.match(r.message, /errorDomainsRequired/);
});

test("duplicate domains and shuffled order → dedup + normalization", () => {
  assert.deepEqual(
    normalizeDomains(["Example.com", "https://example.com/", " localhost"]),
    ["example.com", "localhost"]
  );
});

test("normalizeDomain: lowercase, scheme and trailing slashes removed", () => {
  assert.equal(normalizeDomain("HTTPS://APP.Example.COM/"), "app.example.com");
  assert.equal(normalizeDomain("  example.com  "), "example.com");
  assert.equal(normalizeDomain(""), "");
  assert.equal(normalizeDomain(null), "");
});

test("isValidDomainPattern: edge cases", () => {
  assert.equal(isValidDomainPattern("example.com"), true);
  assert.equal(isValidDomainPattern(""), false);
  assert.equal(isValidDomainPattern(null), false);
  assert.equal(isValidDomainPattern("https://example.com/app"), true);
  assert.equal(isValidDomainPattern("a b"), false);
});
