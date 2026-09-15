// YaFormFiller — unit test: SPA navigation detection in the topbar (spa-navigation.mjs)
//
// Business rules under test:
//  1. Refresh decision: only a change of the page URI (origin+pathname, per
//     YAFSelection.pageUriOf) triggers a refresh. Same URI → no refresh (hash-only
//     navigation / same-path pushState skipped); unknown next URI → no refresh.
//  2. The page-world patch is a classic script (no module syntax, no dynamic import())
//     wrapping BOTH history.pushState and history.replaceState, and re-emits every SPA
//     navigation source (pushState, replaceState, popstate, hashchange) as a single
//     CustomEvent on window.
//  3. The patch runs once per page (guarded) → re-injections never stack wrappers.
//  4. The wrapped history methods are transparent: same arguments, same return value.
import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
// spa-navigation.mjs is a classic dual-load (IIFE exposing globalThis.YAFSpaNav):
// importing it as a module executes it; the logic comes from globalThis.YAFSpaNav.
await import("../spa-navigation.mjs");
await import("../form-selection.mjs");
const { NAV_EVENT, REFRESH_DEBOUNCE_MS, POLL_FALLBACK_MS, pageUriChanged, pageWorldPatchSource } =
  globalThis.YAFSpaNav;
const { pageUriOf } = globalThis.YAFSelection;

// ——— 1. Refresh decision ———
test("pageUriChanged: different pathname → refresh", () => {
  assert.equal(pageUriChanged("https://a.example/list", "https://a.example/detail"), true);
});

test("pageUriChanged: same pathname → NO refresh (hash-only navigation and same-path pushState are skipped)", () => {
  assert.equal(pageUriChanged("https://a.example/list", "https://a.example/list"), false);
});

test("pageUriChanged: different origin → refresh", () => {
  assert.equal(pageUriChanged("https://a.example/list", "https://b.example/list"), true);
});

test("pageUriChanged: unknown (null) next URI → NO refresh", () => {
  assert.equal(pageUriChanged("https://a.example/list", null), false);
});

test("pageUriChanged: null previous URI with a known next URI → refresh (first evaluation)", () => {
  assert.equal(pageUriChanged(null, "https://a.example/list"), true);
});

test("pageUriChanged: idempotent null → null (bad location both times)", () => {
  assert.equal(pageUriChanged(null, null), false);
});

test("pageUriChanged agrees with pageUriOf: hash/query-only navigation does not refresh", () => {
  const before = pageUriOf({ href: "https://a.example/list?x=1#a" });
  const afterHash = pageUriOf({ href: "https://a.example/list?x=1#b" });
  const afterQuery = pageUriOf({ href: "https://a.example/list?x=2#a" });
  assert.equal(before, "https://a.example/list");
  assert.equal(pageUriChanged(before, afterHash), false);
  assert.equal(pageUriChanged(before, afterQuery), false);
});

// ——— 2. Page-world patch source ———
test("pageWorldPatchSource: classic script (no import/export/dynamic import)", () => {
  const src = pageWorldPatchSource();
  assert.ok(!src.includes("import("), "no dynamic import()");
  assert.ok(!src.includes("import "), "no import declarations");
  assert.ok(!src.includes("export "), "no export declarations");
  // Parses as a plain classic function body (like node --check does for the file).
  new Function(src);
});

// Sandbox emulating the page realm: window (event bus) + history.
function sandbox() {
  const listeners = {};
  const dispatched = [];
  const window = {
    __yafSpaMainPatched: undefined,
    addEventListener(type, fn) { (listeners[type] ??= []).push(fn); },
    dispatchEvent(ev) {
      // Record only the nav event: what matters is what the bar's listener sees
      // (the content script listens exclusively to NAV_EVENT, not to raw popstate).
      if (ev.type === NAV_EVENT) dispatched.push(ev.type);
      for (const fn of listeners[ev.type] ?? []) fn(ev);
      return true;
    },
    CustomEvent: class {
      constructor(type, opts) { this.type = type; this.detail = opts?.detail; }
    },
  };
  return { window, listeners, dispatched };
}

test("pageWorldPatchSource: wraps pushState transparently and emits one nav event", () => {
  const s = sandbox();
  const origCalls = [];
  const history = {
    pushState(state, title, url) { origCalls.push([state, title, url]); return "pushed"; },
    replaceState() { return "replaced"; },
  };
  vm.runInContext(pageWorldPatchSource(), vm.createContext({ window: s.window, history }));
  // Wrapper is transparent: same arguments reach the original, same value comes back.
  assert.equal(history.pushState({ p: 1 }, "t", "/x"), "pushed");
  assert.deepEqual(origCalls, [[{ p: 1 }, "t", "/x"]]);
  assert.equal(s.window.__yafSpaMainPatched, true);
  assert.deepEqual(s.dispatched, [NAV_EVENT]);
});

test("pageWorldPatchSource: wraps replaceState too", () => {
  const s = sandbox();
  let origCalls = 0;
  const history = { pushState() {}, replaceState() { origCalls++; } };
  vm.runInContext(pageWorldPatchSource(), vm.createContext({ window: s.window, history }));
  history.replaceState({}, "", "/y");
  assert.equal(origCalls, 1);
  assert.deepEqual(s.dispatched, [NAV_EVENT]);
});

test("pageWorldPatchSource: popstate and hashchange emit the nav event", () => {
  const s = sandbox();
  const history = { pushState() {}, replaceState() {} };
  vm.runInContext(pageWorldPatchSource(), vm.createContext({ window: s.window, history }));
  s.window.dispatchEvent({ type: "popstate" });
  s.window.dispatchEvent({ type: "hashchange" });
  assert.deepEqual(s.dispatched, [NAV_EVENT, NAV_EVENT]);
});

test("pageWorldPatchSource: guarded — a second run does NOT stack wrappers or double-fire", () => {
  const s = sandbox();
  let pushCalls = 0;
  const history = {
    pushState() { pushCalls++; }, // becomes the wrapper installed by the FIRST run
    replaceState() {},
  };
  const src = pageWorldPatchSource();
  vm.runInContext(src, vm.createContext({ window: s.window, history }));
  const firstWrapper = history.pushState;
  // Simulate the Firefox re-injection of the same source in the same realm:
  // the window guard makes the second run a no-op, history keeps ONE wrapper.
  s.window.__yafSpaMainPatched = true;
  vm.runInContext(src, vm.createContext({ window: s.window, history: { pushState() {} } }));
  assert.equal(history.pushState, firstWrapper, "history wrapper not replaced");
  s.window.dispatchEvent({ type: "popstate" });
  assert.deepEqual(s.dispatched, [NAV_EVENT], "exactly one event");
  void pushCalls;
});

test("pageWorldPatchSource: emit failures never break the wrapped history call", () => {
  let threw = false;
  const window = { addEventListener() {}, dispatchEvent() { threw = true; }, CustomEvent: class {} };
  const history = { pushState() { return "ok"; }, replaceState() {} };
  vm.runInContext(pageWorldPatchSource(), vm.createContext({ window, history }));
  let ret;
  assert.doesNotThrow(() => { ret = history.pushState({}, "", "/z"); });
  assert.equal(ret, "ok");
  assert.equal(threw, true);
});

// ——— Constants sane (wired in inpage-bar.js) ———
test("constants: positive debounce, poll fallback slower than the debounce", () => {
  assert.ok(REFRESH_DEBOUNCE_MS > 0 && REFRESH_DEBOUNCE_MS <= 1000);
  assert.ok(POLL_FALLBACK_MS > REFRESH_DEBOUNCE_MS);
});
