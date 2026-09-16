// YaFormFiller — settings page
import { getForms, saveForms, uid } from "../storage.mjs";
import { validateForm } from "../form-rules.mjs";
import { t, applyI18n } from "../i18n.mjs";

const $ = (sel) => document.querySelector(sel);
const formListEl = $("#formList");
const emptyEl = $("#emptyState");
const editorEl = $("#formEditor");
const fieldListEl = $("#fieldList");
const saveStatusEl = $("#saveStatus");
const nameInput = $("#formName");
const domainsBox = $("#formDomains");
const domainInput = $("#formDomainInput");

let forms = [];
// The form being edited: { id: null|..., name, fields: [{type, selector, value}] }
let editing = null;

applyI18n();

async function init() {
  forms = await getForms();
  renderList();
  $("#appVersion").textContent = "v" + browser.runtime.getManifest().version;

  $("#newFormBtn").addEventListener("click", () => startNewForm());
  $("#addFieldBtn").addEventListener("click", () => {
    if (!editing) return;
    editing.fields.push({ type: "text", selector: "", value: "" });
    renderFields();
  });
  $("#saveFormBtn").addEventListener("click", saveForm);
  $("#deleteFormBtn").addEventListener("click", deleteForm);

  $("#exportDataBtn").addEventListener("click", exportData);
  $("#importDataBtn").addEventListener("click", () => importDataInput.click());
  const importDataInput = $("#importDataInput");
  importDataInput.addEventListener("change", () => {
    const file = importDataInput.files[0];
    importDataInput.value = "";
    if (file) importData(file);
  });
  // "open=<id>" query param: direct open of a saved form
  const openId = new URLSearchParams(location.search).get("open");
  if (openId) {
    const f = forms.find((x) => x.id === openId);
    if (f) selectForm(f.id);
  } else if (forms.length) {
    selectForm(forms[0].id);
  }
}

// ——— List ———
function renderList() {
  formListEl.innerHTML = "";
  for (const f of forms) {
    const li = document.createElement("li");
    li.textContent = `${f.name} · ${t("optionsFieldsCount", [f.fields.length])}`;
    if (editing && editing.id === f.id) li.classList.add("active");
    li.addEventListener("click", () => selectForm(f.id));
    formListEl.append(li);
  }
}

// ——— Selection / editing ———
function selectForm(id) {
  const f = forms.find((x) => x.id === id);
  if (!f) return hideEditor();
  editing = JSON.parse(JSON.stringify({ id: f.id, name: f.name, domains: f.domains ?? [], fields: f.fields }));
  showEditor();
}

function startNewForm() {
  editing = { id: null, name: "", domains: [], fields: [{ type: "text", selector: "", value: "" }] };
  showEditor();
}

function hideEditor() {
  editing = null;
  emptyEl.hidden = false;
  editorEl.hidden = true;
  renderList();
}

function showEditor() {
  emptyEl.hidden = true;
  editorEl.hidden = false;
  nameInput.value = editing.name;
  renderDomainTags();
  renderFields();
  renderList();
}

// ——— Valid domains: multi-input with chips ———
function renderDomainTags() {
  domainsBox.querySelectorAll(".tag").forEach((t_) => t_.remove());
  for (const d of editing.domains) {
    const chip = document.createElement("span");
    chip.className = "tag";
    chip.textContent = d;
    const rm = document.createElement("button");
    rm.type = "button";
    rm.className = "tag-remove";
    rm.title = t("optionsRemoveDomain");
    rm.textContent = "\u00d7";
    rm.addEventListener("click", () => {
      editing.domains = editing.domains.filter((x) => x !== d);
      renderDomainTags();
    });
    chip.append(rm);
    domainsBox.insertBefore(chip, domainInput);
  }
}

function commitDomainToken() {
  const raw = domainInput.value.trim().toLowerCase();
  if (!raw) return;
  // a single token may contain multiple values separated by comma/space
  for (const tok of raw.split(/[\s,]+/).filter(Boolean)) {
    if (!editing.domains.some((d) => d.toLowerCase() === tok)) {
      editing.domains.push(tok); // no duplicates within the same form
    }
  }
  domainInput.value = "";
  renderDomainTags();
}

domainInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === ",") {
    e.preventDefault();
    commitDomainToken();
  } else if (e.key === "Backspace" && !domainInput.value && editing.domains.length) {
    e.preventDefault();
    editing.domains.pop();
    renderDomainTags();
  }
});
domainInput.addEventListener("blur", () => commitDomainToken());
domainsBox.addEventListener("click", () => domainInput.focus());

function renderFields() {
  fieldListEl.innerHTML = "";
  editing.fields.forEach((field, i) => fieldListEl.append(fieldCard(field, i)));
}

function fieldCard(field, index) {
  const card = document.createElement("div");
  card.className = "field-row";

  const typeSel = document.createElement("select");
  typeSel.className = "f-type";
  typeSel.innerHTML = `<option value="text">text</option><option value="password">password</option><option value="submit">submit</option>`;
  typeSel.value = field.type;

  const selInput = document.createElement("input");
  selInput.className = "f-selector";
  selInput.type = "text";
  selInput.value = field.selector;
  selInput.placeholder = t("optionsSelectorPlaceholder");

  const valInput = document.createElement("input");
  valInput.className = "f-value";
  valInput.type = field.type === "password" ? "password" : "text";
  valInput.value = field.value;
  valInput.placeholder = t("optionsValuePlaceholder");

  const rmBtn = document.createElement("button");
  rmBtn.className = "btn ghost f-remove";
  rmBtn.type = "button";
  rmBtn.title = t("optionsRemoveField");
  rmBtn.textContent = "✕";

  typeSel.addEventListener("input", (e) => {
    field.type = e.target.value;
    valInput.type = field.type === "password" ? "password" : "text";
    // "submit" is selector-only: the value is meaningless and ignored
    valInput.disabled = field.type === "submit";
  });
  selInput.addEventListener("input", (e) => (field.selector = e.target.value));
  valInput.disabled = field.type === "submit";
  valInput.addEventListener("input", (e) => (field.value = e.target.value));
  rmBtn.addEventListener("click", () => {
    editing.fields.splice(index, 1);
    renderFields();
  });

  card.append(typeSel, selInput, valInput, rmBtn);
  return card;
}

// ——— Persistence ———
async function saveForm() {
  commitDomainToken(); // register any not-yet-committed token into editing.domains
  const result = validateForm(
    { name: nameInput.value, domains: editing.domains, fields: editing.fields },
    forms,
    editing.id
  );
  if (!result.ok) return flashStatus(t(result.message, result.details ?? []), "#d9534f");

  editing.name = result.name;
  editing.domains = result.domains;
  renderDomainTags();
  if (editing.id == null) {
    const saved = JSON.parse(JSON.stringify(editing));
    saved.id = uid();
    forms.push(saved);
    editing = saved;
  } else {
    const f = forms.find((x) => x.id === editing.id);
    f.name = editing.name;
    f.domains = [...editing.domains];
    f.fields = JSON.parse(JSON.stringify(editing.fields));
  }
  await saveForms(forms);
  renderList();
  flashStatus(t("optionsFormSaved"));
}

async function deleteForm() {
  if (!editing?.id) { hideEditor(); return; }
  if (!confirm(t("optionsDeleteFormConfirm", [editing.name]))) return;
  forms = forms.filter((f) => f.id !== editing.id);
  await saveForms(forms);
  hideEditor();
}

function flashStatus(msg, color) {
  saveStatusEl.textContent = msg;
  saveStatusEl.style.color = color ?? "";
  setTimeout(() => (saveStatusEl.textContent = ""), 2500);
}

// ——— Data export / import ———
// storage.local keys included in the backup file.
const EXPORT_KEYS = ["autoOrigins", "savedFormFields", "selectedFormIds"];
const ieStatusEl = $("#importExportStatus");

function flashIeStatus(msg, isError) {
  ieStatusEl.textContent = msg;
  ieStatusEl.classList.toggle("error", !!isError);
  setTimeout(() => (ieStatusEl.textContent = ""), 4000);
}

function exportData() {
  browser.storage.local.get(EXPORT_KEYS).then((d) => {
    const data = { version: browser.runtime.getManifest().version };
    for (const k of EXPORT_KEYS) {
      if (d[k] !== undefined) data[k] = d[k];
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `yaformfiller-backup-${data.version}.json`;
    a.click();
    URL.revokeObjectURL(url);
    flashIeStatus(t("ieExported"));
  });
}

async function importData(file) {
  let data;
  try {
    data = JSON.parse(await file.text());
  } catch {
    flashIeStatus(t("ieInvalidJson"), true);
    return;
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    flashIeStatus(t("ieInvalidFormat"), true);
    return;
  }
  const found = EXPORT_KEYS.filter((k) => k in data);
  const missing = EXPORT_KEYS.filter((k) => !(k in data));
  if (!found.length) {
    flashIeStatus(t("ieNoKeys"), true);
    return;
  }
  const warn =
    t("ieImportConfirm1") +
    found.map((k) => `• ${k}`).join("\n") +
    (missing.length ? t("ieKeysRemovedNotice", [missing.map((k) => `• ${k}`).join("\n")]) : "") +
    t("ieImportConfirm2", [data.version ?? ""]);
  if (!confirm(warn)) return;

  const toSet = {};
  const toRemove = [];
  for (const k of EXPORT_KEYS) {
    if (k in data && data[k] !== undefined) toSet[k] = data[k];
    else toRemove.push(k);
  }
  await browser.storage.local.remove(toRemove);
  await browser.storage.local.set(toSet);

  // Reload the page state with the new data
  forms = await getForms();
  renderList();
  editing = null;
  emptyEl.hidden = false;
  editorEl.hidden = true;
  flashIeStatus(t("ieImported"));
}

init().catch((e) => console.error("YaFormFiller init:", e));
