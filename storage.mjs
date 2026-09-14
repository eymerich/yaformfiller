// YaFormFiller — storage helpers (browser.storage.local, modern API)
const STORAGE_KEY = "savedFormFields";

/**
 * Form: { id, name, domains: [string], fields: [ { type: "text"|"password", selector: "...", value: "..." } ] }
 * Domains are match patterns (see domains.js); evaluated in OR within a single form.
 */

export async function getForms() {
  const d = await browser.storage.local.get(STORAGE_KEY);
  return d[STORAGE_KEY] ?? [];
}

export async function saveForms(forms) {
  await browser.storage.local.set({ [STORAGE_KEY]: forms });
}

export function uid() {
  return crypto.randomUUID();
}
