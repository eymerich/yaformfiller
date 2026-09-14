# YaFormFiller

A Firefox WebExtension (Manifest V3) that automatically fills form fields on matching pages using saved forms. Define a form once — as a list of fields, each with a type, a CSS selector and a value — and let YaFormFiller fill it for you with one click.

> Currently localized in **English** and **Italian**.

## Features

- **Saved forms** — store reusable forms made of fields defined by a [jQuery-style CSS selector](https://api.jquery.com/category/selectors/), a value and a field type (text, password, select, textarea…).
- **In-page topbar** — an unobtrusive bar on matching pages to pick a form, fill it and clear it again. The page content slides down so nothing is ever hidden behind the bar.
- **Per-page form memory** — the form you last chose for a page is remembered and pre-selected on your next visit.
- **Domain matching** — each form can be restricted to one or more domains (OR logic); a form without domains is valid everywhere.
- **Auto-inject (optional, per site)** — via the popup you can enable the topbar to appear automatically on page load for the current origin, granted through the optional host-permission prompt.
- **Toolbar popup** — one-click "show topbar on this page" plus the auto-inject toggle.
- **Context menu** — quick access to show/hide the topbar from the right-click menu.
- **Import/Export** — back up or move your saved forms and settings as JSON from the options page.
- **Robust DOM-driven design** — show/hide/apply operations are driven by the DOM (does the bar exist?), so the extension stays consistent even when Firefox re-runs content-script injection in a new context.

## Installation

### From source (temporary install)

1. Clone this repository.
2. Open `about:debugging#/runtime/this-hub` in Firefox.
3. Click **Load Temporary Add-on** and select `manifest.json`.

### From a zip

Package (or use the provided `yaformfiller-<version>.zip`) and load it the same way, or install via `about:addons` → gear icon → *Install Add-on From File*.

### Requires

- Firefox **128.0+** (declared via `strict_min_version` in `manifest.json`).

## Usage

1. Open the extension **Options** page: create a form, give it a name, optionally restrict it to domains, and add fields (CSS selector + value).
2. Navigate to a matching page and use the toolbar button → **Topbar now on this page**, or the context-menu entry, to open the in-page topbar.
3. Pick a form (choices are sorted alphabetically, page-scoped selection is remembered) and hit **Apply**. Use **Clear** to undo the last fill.
4. Optionally enable **Autofill** in the popup so the topbar appears automatically on that site — the host permission is requested only when you flip the toggle.

## Permissions

| Permission | Why |
| --- | --- |
| `storage` | Saved forms and per-page choices |
| `scripting` / `activeTab` | Inject the topbar and interact with the page |
| `contextMenus` | Right-click "show/hide topbar" entry |
| `host_permissions: <all_urls>` / optional `origins` | Run on any site you choose; per-site access is additionally gated with optional permissions |

## Development

### Project layout

```
background.js      — MV3 event page: commands, context menu, injection orchestration
inpage-bar.js      — in-page topbar (classic script, injected via scripting API)
fill.mjs, form-rules.mjs, form-selection.mjs — business logic (shared/testable)
form-selection.js, bar-ctl-*.js — classic-script shims injected with the topbar
domains.js         — domain matching (dual-load: ESM + globalThis)
popup/, options/   — toolbar popup and options page
i18n.mjs           — i18n helpers (t() + data-i18n DOM auto-translation)
_locales/          — en / it message catalogs
test/              — node:test unit tests (no browser needed)
```

### Run the tests

```bash
node --test test/*.mjs
```

45 tests cover domain matching, form rules and form selection. No browser or dependencies are required — plain Node.js only.

## Contributing

Bug reports and pull requests are welcome. Please make sure `node --test test/*.mjs` passes before submitting, and keep new user-facing strings localized (add entries to both `_locales/en/messages.json` and `_locales/it/messages.json`).

## License

Released under the [MIT License](LICENSE). See [NOTICE](NOTICE) for the full licensing statement, including third-party components.
