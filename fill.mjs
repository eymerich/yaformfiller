// YaFormFiller — fill logic (injected into the page)

// The function is SERIALIZED and executed in the page context: no external references.
function fillInPage(fields) {
  const results = [];
  for (const f of fields) {
    try {
      const el = document.querySelector(f.selector);
      if (!el) {
        results.push({ selector: f.selector, ok: false, error: (typeof i18n === "undefined" ? "Selector not found" : i18n.getMessage("fillSelectorNotFound")) });
        continue;
      }
      const isInput = el instanceof HTMLInputElement;
      const isTextArea = el instanceof HTMLTextAreaElement;
      if (!isInput && !isTextArea && !(el instanceof HTMLSelectElement)) {
        results.push({ selector: f.selector, ok: false, error: (typeof i18n === "undefined" ? "Unsupported element (not input/textarea/select)" : i18n.getMessage("fillUnsupportedElement")) });
        continue;
      }
      if (isInput && f.type === "password" && el.type !== "password") {
        // Field declared as password but the element is not a password input: force the type
        el.type = "password";
      }

      if (el instanceof HTMLSelectElement) {
        el.value = f.value;
        el.dispatchEvent(new Event("change", { bubbles: true }));
      } else {
        // Native setter: bypasses the value proxies of React/Vue
        const proto = isTextArea ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        const desc = Object.getOwnPropertyDescriptor(proto, "value");
        desc.set.call(el, f.value);
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
        // Additional events for maximum framework compatibility
        el.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true }));
        el.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true }));
      }
      results.push({ selector: f.selector, ok: true });
    } catch (e) {
      results.push({ selector: f.selector, ok: false, error: String(e?.message ?? e) });
    }
  }
  return results;
}

export async function fillFields(tabId, fields) {
  const [res] = await browser.scripting.executeScript({
    target: { tabId },
    func: fillInPage,
    args: [fields],
  });
  return res?.result ?? [];
}
