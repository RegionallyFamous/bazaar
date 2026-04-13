# 10-pass codebase audit — tracked todos

Action items from the **10-Pass Codebase Audit** (security, performance, types, quality, a11y, tests).  
Check items off in PRs as work lands; reference the `id` in the commit message.

---

## Pass 1 — Security

- [x] **`sec-webhook-secret`** — Strip `secret` from `WebhooksController` list/create responses (never return the HMAC signing key to the client).
- [x] **`sec-audit-hooks`** — Fire `bazaar_ware_installed` / `bazaar_ware_deleted` / `bazaar_ware_toggled` from `UploadController`, `WareController`, and CLI install paths; extend audit log for config/update events as needed.
- [x] **`sec-ssrf`** — Apply URL safety (e.g. shared `is_safe_url`) to `RemoteRegistry` download URLs and `WareLicense` remote URLs before `wp_remote_*`.
- [x] **`sec-uninstall`** — Finish `uninstall.php`: drop `bazaar_errors` and `bazaar_audit_log` tables, unschedule all Bazaar crons, remove remaining options (verify nothing left behind after delete).

---

## Pass 2 — Performance

- [x] **`perf-n1`** — Remove N+1 `get_option` pattern in `WareRegistry::get_all()` (batch cache or consolidate storage).
- [x] **`perf-mkdir`** — Skip writing `.htaccess` in `ensure_wares_directory()` when content is unchanged (avoid disk write every `admin_init`).
- [x] **`perf-mosaic`** — Move Mosaic `Canvas.tsx` pixel compositing to `OffscreenCanvas` + worker; fix `commit` callback identity churn in `usePixelEditor`.

---

## Pass 3 — Type safety

- [x] **`type-store-never`** — Replace `as never` in ware stores; widen `WareStore` generic or add typed serialize/deserialize.
- [x] **`type-client-json`** — Add optional runtime validation to `response.json() as T` paths in `@bazaar/client`.
- [x] **`type-local-store`** — Add shape guards after `JSON.parse` in board / swatch / tome / ledger local stores.

---

## Pass 4 — Resilience & architecture

- [x] **`resilience-install-lock`** — Add an atomic lock (e.g. `add_option`) around same-slug install in `WareLoader` to block concurrent installs.
- [x] **`resilience-multisite`** — Wire `Multisite::merge_index()` into `WareRegistry` or delete dead code; add `repair-index` CLI if useful.

---

## Pass 5 — Code quality

- [x] **`quality-store-factory`** — Extract `createWareStore` + `lsGet`/`lsSet` + save-fallback into `@bazaar/client`; dedupe flow / tome / ledger.
- [x] **`quality-coreapps-rollback`** — Mirror `UploadController` rollback in `CoreAppsController::install_from_url`; depend on `WareLoaderInterface` / `WareRegistryInterface`.
- [x] **`quality-analytics-shape`** — `AnalyticsController`: use `WP_Error` for errors; fix incorrect HTTP **202** on write failure (use **500** or appropriate code).

---

## Pass 6 — Developer experience

- [x] **`dx-design-readme`** — Add `packages/design/README.md`; export `BazaarClientConfig` from `@bazaar/client` barrel if missing.

---

## Pass 7 — Accessibility & UX

- [x] **`a11y-focus-trap`** — Focus trap + restore focus in `Modal.tsx` and Launchpad overlay.
- [x] **`a11y-keyboard`** — `Ring.tsx`: `tabIndex` + `onKeyDown`; Mosaic toolbar: `aria-pressed`; Flow settings + Tome sidebar: `aria-expanded` where collapsible.
- [x] **`a11y-confirmations`** — Confirm step before destructive actions (Tome delete page, Flow clear done, Swatch delete, Mosaic clear canvas, etc.).

---

## Pass 8 — Tests

- [x] **`tests-priority`** — Unit tests for `WareServer`, `WareLoader` install/delete, `WebhookDispatcher`, multisite paths.

---

## Optional follow-ups (from full audit narrative)

Track separately if you want them on the board:

- [ ] Rate limiting on upload / remote install / expensive health endpoints.
- [ ] `AuditController` recursive sanitization of `meta` before `AuditLog::record`.
- [ ] `BadgeController` transient update race (document or lock).
- [ ] `BazaarShell::resolve_assets()` cache manifest JSON per request.
- [ ] Mosaic flood-fill off main thread.
- [ ] `WareSigner` strict `signature` type check before `base64_decode`.
- [ ] `admin/src/modules/upload.js` XHR timeout + `ontimeout`.
- [ ] Ledger `InvoiceEditor`: replace `alert()` with inline validation / toast.

---

When an item is done, check it here and reference the id in the commit or PR title (e.g. `fix(sec): strip webhook secret from REST responses (sec-webhook-secret)`).
