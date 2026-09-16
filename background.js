// YaFormFiller — background (event page, MV3)
// domains.js (classic script) exposes globalThis.YAFDomains; importing it as a module keeps that working.
import "./domains.js";
import { normalizeAutoOrigins, findEntry, setOriginEnabled } from "./auto-origins.mjs";

const MENU_SETTINGS_ID = "yaformfiller-settings";
const OPTIONS_URL = browser.runtime.getURL("options/options.html");
const AUTO_KEY = "autoOrigins"; // list of origins with autofill enabled, persisted

// ——— Context menu on the extension icon ———
function ensureMenu() {
  browser.contextMenus.create({
    id: MENU_SETTINGS_ID,
    title: (browser.i18n?.getMessage ?? chrome.i18n.getMessage)("menuSettings"),
    contexts: ["action"],
  });
}
browser.runtime.onInstalled.addListener(ensureMenu);
browser.runtime.onStartup.addListener(ensureMenu);

// Opens (or refocuses) the settings as a normal tab
async function openSettings() {
  const tabs = await browser.tabs.query({ url: OPTIONS_URL + "*" });
  if (tabs.length) {
    await browser.windows.update(tabs[0].windowId, { focused: true });
    await browser.tabs.update(tabs[0].id, { active: true });
    return;
  }
  await browser.tabs.create({ url: OPTIONS_URL });
}

// ——— Origins with autofill enabled (persisted) ———
// Format: [{ url: <origin URL>, with_submit: true|false }] (see auto-origins.mjs).
async function getAutoOrigins() {
  const d = await browser.storage.local.get(AUTO_KEY);
  return normalizeAutoOrigins(d[AUTO_KEY]);
}
async function saveAutoOrigins(list) {
  await browser.storage.local.set({ [AUTO_KEY]: list });
}

function originOf(url) {
  try {
    const u = new URL(url);
    // origin https://domain:port (the port is only present when it is not the protocol default)
    return u.origin;
  } catch {
    return null;
  }
}

// The injection also carries the visibility command: a control file (injected right
// before inpage-bar.js) sets window.__yafMode = "show" | "hide". Files channel unchanged,
// zero dependency on tabs.sendMessage or executeScript({func}).
const BAR_CTL = { show: "/bar-ctl-show.js", hide: "/bar-ctl-hide.js" };
async function injectBar(tabId, mode = "show") {
  try {
    await browser.scripting.executeScript({
      target: { tabId },
      // domains.js, form-selection.mjs, spa-navigation.mjs first: globals used by inpage-bar.js;
      // control file next: drives bar open/close
      files: ["/domains.js", "/form-selection.mjs", "/spa-navigation.mjs", BAR_CTL[mode] ?? BAR_CTL.show, "/inpage-bar.js"],
    });
    return true;
  } catch {
    // missing permission or page no longer valid: ignore
    return false;
  }
}

// Applies the autofill state for the origin across all of its open tabs:
// enabled=true → open the topbar (with selection from the business rule); false → close it.
// If the bar was already visible, show is a no-op (keeps the selection); hide always removes it.
async function applyToOrigin(origin, enabled, injectTabId = null) {
  if (!origin) return;
  const tabs = await browser.tabs.query({ url: origin + "/*" });
  for (const t of tabs) {
    // enabled → inject and open; disable → inject only to deliver the close command
    await injectBar(t.id, enabled ? "show" : "hide");
  }
  // requested tab in case it does not match the url pattern while still belonging to the origin
  if (injectTabId != null && !tabs.some((t) => t.id === injectTabId)) {
    await injectBar(injectTabId, enabled ? "show" : "hide");
  }
}

// Toggle/state from the popup
browser.runtime.onMessage.addListener(async (msg) => {
  if (!msg || !msg.type?.startsWith("yaf-auto")) return;
  const tab = await browser.tabs.get(msg.tabId);
  const origin = isWebUrl(tab?.url) ? originOf(tab.url) : null;

  switch (msg.type) {
    case "yaf-auto-get": {
      if (!origin) return { enabled: false, with_submit: false };
      const entry = findEntry(await getAutoOrigins(), origin);
      return { enabled: !!entry, with_submit: !!entry?.with_submit };
    }
    case "yaf-auto-set": {
      if (!origin) return { enabled: false, with_submit: false };
      const list = await getAutoOrigins();
      const next = setOriginEnabled(list, origin, !!msg.enabled, !!msg.with_submit);
      await saveAutoOrigins(next);
      // explicit show when enabling (bar appears with the business-rule selection);
      // explicit hide when disabling (the bar goes away anyway, no toggle)
      await applyToOrigin(origin, !!msg.enabled, msg.tabId);
      return { enabled: msg.enabled };
    }
    case "yaf-auto-inject": {
      if (!origin) return { ok: false };
      await injectBar(msg.tabId, "show");
      return { ok: true };
    }
  }
  return;
});

function isWebUrl(url) {
  return /^https?:/.test(url ?? "");
}

// Auto-injection of the topbar at full page load:
// only pages whose origin is registered in autoOrigins (popup toggle), or explicit
// injection via "yaf-auto-inject" (popup "Topbar now"). Pages merely matching the
// domains of a saved form are NOT auto-injected: the bar is opened by the toggle or
// manually with the popup's "now" button.
browser.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete" || !isWebUrl(tab?.url)) return;
  const origins = await getAutoOrigins();
  if (findEntry(origins, originOf(tab.url))) {
    await injectBar(tabId, "show");
  }
  // otherwise: no auto-injection (the user can open it with the popup's "now" button)
}, { properties: ["status"] });

// Context menu click on the extension icon → settings
// (a plain click on the icon opens the popup: popup/popup.html, so action.onClicked is not needed)
browser.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId === MENU_SETTINGS_ID) openSettings();
});
