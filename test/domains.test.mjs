// YaFormFiller — unit test: form enablement/validity based on the given domains.
// Rule: domains within a single form are evaluated in OR — the form is valid if AT LEAST
// ONE domain in the list matches the page. A form without domains is valid everywhere.
import { test } from "node:test";
import assert from "node:assert/strict";
import "../domains.js";

const { domainMatches, formsForUrl, anyFormMatchesUrl } = globalThis.YAFDomains;

const url = (u) => new URL(u);
const mk = (name, domains) => ({ id: name, name, domains });

test("single plain domain: identical host matches any port and path", () => {
  const f = mk("keycloak", ["localhost"]);
  const forms = [f];
  assert.ok(anyFormMatchesUrl(forms, url("https://localhost:9090/realms/x/protocol")));
  assert.ok(anyFormMatchesUrl(forms, url("http://localhost:80/")));
  assert.ok(anyFormMatchesUrl(forms, url("https://localhost:9090/admin/master/console")));
});

test("single domain: subdomain of the given domain matches; external host does not", () => {
  const f = mk("example", ["example.com"]);
  assert.ok(domainMatches(url("https://app.example.com/a"), "example.com"));
  assert.ok(domainMatches(url("https://example.com"), "example.com"));
  assert.equal(domainMatches(url("https://notexample.com"), "example.com"), false);
  assert.equal(formsForUrl([f], url("https://other.io")).length, 0);
});

test("multiple domains for the same form: evaluated in OR — ONE match is enough", () => {
  const f = mk("multi", ["keycloak.local", "localhost:9090"]);
  const forms = [f];
  // second one matches
  assert.equal(formsForUrl(forms, url("https://localhost:9090")).length, 1);
  // first one matches (any port)
  assert.equal(formsForUrl(forms, url("https://keycloak.local:8443/console")).length, 1);
  // none matches
  assert.equal(formsForUrl(forms, url("https://localhost:8080")).length, 0);
  assert.equal(formsForUrl(forms, url("https://example.com")).length, 0);
});

test("multiple forms, different domains: ONLY forms whose domains match (in OR) are returned", () => {
  const forms = [
    mk("keycloak", ["keycloak.local", "localhost"]),
    mk("grafana", ["grafana.local:3000"]),
    mk("no-domains", []), // no domains → valid everywhere
  ];
  const onLocalhost = formsForUrl(forms, url("https://localhost:9090"));
  assert.deepEqual(onLocalhost.map((f) => f.name), ["keycloak", "no-domains"]);
  const onGrafana = formsForUrl(forms, url("http://grafana.local:3000/d/abc"));
  assert.deepEqual(onGrafana.map((f) => f.name), ["grafana", "no-domains"]);
  const onOther = formsForUrl(forms, url("https://example.com"));
  assert.deepEqual(onOther.map((f) => f.name), ["no-domains"]);
});

test("pattern with explicit port: matches only with that port", () => {
  const f = mk("p", ["localhost:9090"]);
  assert.equal(domainMatches(url("https://localhost:9090/x"), "localhost:9090"), true);
  assert.equal(domainMatches(url("https://localhost"), "localhost:9090"), false);
  assert.equal(domainMatches(url("http://localhost:80/target"), "localhost:9090"), false);
  assert.equal(domainMatches(url("https://localhost:9090/target"), "localhost:9090"), true);
});

test("path prefix in the pattern: restricts to paths under the prefix", () => {
  const f = mk("path", ["keycloak.local/admin"]);
  assert.equal(domainMatches(url("https://keycloak.local/admin/master"), "keycloak.local/admin"), true);
  assert.equal(domainMatches(url("https://keycloak.local/adminx"), "keycloak.local/admin"), false);
  assert.equal(domainMatches(url("https://keycloak.local/console"), "keycloak.local/admin"), false);
});

test("wildcard *.domain syntax and https:// scheme accepted as input", () => {
  const f = mk("w", ["*.example.com", "https://foo.org"]);
  assert.equal(domainsMatch(f, url("https://sub.example.com")), true);
  assert.equal(domainsMatch(f, url("http://foo.org:8080/")), true);
  f.domains = ["*.example.com", "foo.org"]; // foo.org without port: any port
  assert.equal(domainsMatch(f, url("https://foo.org:9090")), true);
});

function domainsMatch(form, u) {
  return form.domains.some((d) => domainMatches(u, d));
}

test("http/https only: non-web scheme never matches", () => {
  const f = mk("s", ["localhost"]);
  assert.equal(domainMatches(url("ftp://localhost/x"), "localhost"), false);
});

test("invalid URL → formsForUrl returns an empty array (and anyForm false)", () => {
  assert.deepEqual(formsForUrl([mk("a", ["localhost"])], "not a url"), []);
  assert.equal(anyFormMatchesUrl([mk("a", ["localhost"])], "niente"), false);
});

test("no forms / null list: no match, no error", () => {
  assert.deepEqual(formsForUrl(null, url("https://localhost")), []);
  assert.deepEqual(formsForUrl([], url("https://localhost")), []);
  assert.equal(anyFormMatchesUrl([], url("https://localhost")), false);
});
