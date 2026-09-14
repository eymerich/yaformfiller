// YaFormFiller — toolbar button popup
import { t, applyI18n } from "../i18n.mjs";

const autoToggle = document.getElementById("autoToggle");
const nowBtn = document.getElementById("nowBtn");
const optionsBtn = document.getElementById("optionsBtn");
const hint = document.getElementById("hint");
const appVersionEl = document.getElementById("appVersion");
appVersionEl.textContent = "v" + browser.runtime.getManifest().version;
applyI18n();

const get = (tabId) => browser.runtime.sendMessage({ type: "yaf-auto-get", tabId });
const set = (tabId, enabled) => browser.runtime.sendMessage({ type: "yaf-auto-set", tabId, enabled });
const inject = (tabId) => browser.runtime.sendMessage({ type: "yaf-auto-inject", tabId });

let tabId = null;
let tabOrigin = null; // active page origin, used for the permission request

optionsBtn.addEventListener("click", () => browser.runtime.openOptionsPage());
nowBtn.addEventListener("click", () => inject(tabId));

init();

async function init() {
  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];

  if (!tab || !/^https?:/.test(tab.url ?? "")) {
    [autoToggle, nowBtn].forEach((el) => (el.disabled = true));
    hint.textContent = t("popupHintNotWebPage");
    return;
  }

  tabId = tab.id;
  tabOrigin = new URL(tab.url).origin + "/*";
  const state = await get(tabId).catch(() => ({ enabled: false }));
  autoToggle.checked = !!state?.enabled;

  autoToggle.addEventListener("change", async () => {
    const enabled = autoToggle.checked;
    try {
      if (enabled) {
        // optional host permission: ask for it during the user gesture of the toggle click
        const granted = await browser.permissions.request({ origins: [tabOrigin] });
        if (granted !== true) throw new Error(t("popupPermissionDenied"));
      }
      await set(tabId, enabled);
    } catch (e) {
      hint.textContent = t("popupErrorPrefix", [e.message ?? String(e)]);
      autoToggle.checked = !enabled;
    }
  });
}
