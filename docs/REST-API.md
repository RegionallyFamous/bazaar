# REST API

Bazaar registers endpoints under the `bazaar/v1` namespace. Most endpoints require authentication. Two exceptions: `GET /sw` is always public (the service worker script), and `GET /serve/{slug}/{file}` allows unauthenticated access for static image assets (`.png`, `.jpg`, `.gif`, `.svg`, `.webp`, `.ico`) since those are loaded by `<img>` tags that cannot send a nonce.

**Base URL:** `https://your-site.com/wp-json/bazaar/v1`

---

## Table of Contents

- [Authentication](#authentication)
- [Endpoints](#endpoints)
  - [Wares](#wares)
  - [File Serving](#file-serving)
  - [Config](#config)
  - [Health](#health)
  - [Analytics](#analytics)
  - [Audit Log](#audit-log)
  - [Badges](#badges)
  - [Content Security Policy](#content-security-policy)
  - [Errors](#errors)
  - [Jobs](#jobs)
  - [Nonce](#nonce)
  - [Storage](#storage)
  - [Stream (SSE)](#stream-sse)
  - [Webhooks](#webhooks)
  - [Service Worker](#service-worker)
  - [Core Apps](#core-apps)
- [Using the REST API from Inside Your Ware](#using-the-rest-api-from-inside-your-ware)
- [Registering Your Own REST Endpoints](#registering-your-own-rest-endpoints)

---

## Authentication

| Context | Method |
|:---|:---|
| Browser (wp-admin) | Cookie auth + `X-WP-Nonce` header — get the nonce with `wp_create_nonce('wp_rest')` |
| External clients | [Application Passwords](https://developer.wordpress.org/rest-api/using-the-rest-api/authentication/#application-passwords) via HTTP Basic auth |

> [!NOTE]
> `@wordpress/api-fetch` (used by the Bazaar admin UI) attaches the nonce automatically via the `X-WP-Nonce` header. `@bazaar/client` does the same from inside your ware.

**Auth shorthand used below:**
- `admin` — logged in + `manage_options` capability
- `login` — any logged-in user

---

## Endpoints

### Wares

Ware management: install, list, toggle, delete.

---

#### `GET /wares`

List all installed wares. Optional `?status=enabled|disabled` filter.

**Auth:** admin

**Response — `200 OK`**
```json
[
  {
    "slug": "ledger",
    "name": "Ledger",
    "version": "1.0.0",
    "enabled": true,
    "installed": "2026-04-10T12:00:00Z"
  }
]
```

---

#### `POST /wares`

Upload and install a new `.wp` ware file.

**Auth:** admin · `Content-Type: multipart/form-data`

**Request body:** `file` field containing the `.wp` archive.

<details>
<summary><strong>JS example</strong></summary>

```js
import apiFetch from '@wordpress/api-fetch';

const formData = new FormData();
formData.append('file', fileInput.files[0]);

const result = await apiFetch({
  path: '/bazaar/v1/wares',
  method: 'POST',
  body: formData,
});
```

</details>

<details>
<summary><strong>curl example</strong></summary>

```bash
curl -X POST https://your-site.com/wp-json/bazaar/v1/wares \
  -H "X-WP-Nonce: $(wp eval 'echo wp_create_nonce("wp_rest");')" \
  -F "file=@ledger.wp"
```

</details>

**Success — `201 Created`**
```json
{
  "success": true,
  "message": "\"Ledger\" installed successfully.",
  "ware": { "slug": "ledger", "name": "Ledger", "..." }
}
```

<details>
<summary><strong>Error codes</strong></summary>

| Status | Code | Meaning |
|:---:|:---|:---|
| 400 | `no_file` | No `file` field in the request |
| 400 | `upload_error` | PHP upload error (check `upload_max_filesize`) |
| 422 | `invalid_extension` | File is not `.wp` |
| 422 | `invalid_zip` | File is not a valid ZIP archive |
| 422 | `missing_manifest` | No `manifest.json` at archive root |
| 422 | `invalid_manifest` | `manifest.json` is not valid JSON |
| 422 | `missing_manifest_field` | Required field (`name`, `slug`, or `version`) missing |
| 422 | `invalid_slug` | Slug contains invalid characters |
| 422 | `slug_exists` | A ware with that slug is already installed (use `--force` via CLI) |
| 422 | `missing_entry` | Entry file not found in archive |
| 422 | `php_not_allowed` | Archive contains a `.php` / `.phar` / `.phtml` file |
| 422 | `too_large` | Uncompressed size exceeds configured limit |
| 422 | `license_required` | Paid ware — store a license key first |
| 500 | `registry_failed` | Files extracted but registry write failed |

</details>

---

#### `GET /wares/{slug}`

Retrieve the full manifest for a single installed ware.

**Auth:** admin

**Response — `200 OK`** — full ware manifest object.

---

#### `PATCH /wares/{slug}`

Enable or disable an installed ware.

**Auth:** admin · `Content-Type: application/json`

```json
{ "enabled": true }
```

**Response — `200 OK`**
```json
{ "success": true, "slug": "ledger", "enabled": false }
```

---

#### `DELETE /wares/{slug}`

Remove a ware from the registry and permanently delete its files.

**Auth:** admin

> [!WARNING]
> Irreversible. Files are deleted from `wp-content/bazaar/{slug}/` immediately.

**Response — `200 OK`**
```json
{ "success": true, "slug": "ledger", "message": "\"ledger\" deleted successfully." }
```

---

#### `GET /index`

Lightweight ware index — slugs with name, enabled state, capability, and icon only. Used by the shell for fast nav rendering.

**Auth:** admin

**Response — `200 OK`** — `array` of index entry objects (not keyed by slug).

---

### File Serving

#### `GET /serve/{slug}/{file}`

Serve any static file from an installed ware's directory.

**Auth:** login + capability declared in the ware's `manifest.json` (default: `manage_options`)

| Parameter | Description |
|:---|:---|
| `slug` | Ware slug, e.g. `ledger` |
| `file` | Path within the ware, e.g. `index.html` or `assets/app.js` |

**Response:** Raw file contents with the correct `Content-Type` header.

> [!TIP]
> **Relative asset paths just work.** Your `index.html` can reference `./assets/app.js` and the browser resolves it against the iframe's `src` URL — you never need to hard-code the full serve URL.

<details>
<summary><strong>Error codes</strong></summary>

| Status | Code | Meaning |
|:---:|:---|:---|
| 401 | `rest_forbidden` | Not logged in |
| 403 | `rest_forbidden` | Lacks required capability |
| 403 | `ware_disabled` | Ware is installed but disabled |
| 404 | `ware_not_found` | No ware with that slug |
| 404 | `file_not_found` | File not in ware directory |
| 400 | `path_traversal` | File path contains `..` |

</details>

---

### Config

Per-ware admin-editable configuration, declared in the ware manifest's `settings` array.

#### `GET /config/{slug}`

Retrieve the config schema and current values for a ware.

**Auth:** admin

**Response — `200 OK`**
```json
{
  "slug": "ledger",
  "schema": [{ "key": "api_key", "type": "string", "label": "API Key" }],
  "values": { "api_key": "sk-…" }
}
```

---

#### `PATCH /config/{slug}`

Update config values. Body must be a JSON object with a `values` key containing the key → value pairs to update.

```json
{ "values": { "api_key": "sk-new-key" } }
```

**Auth:** admin · `Content-Type: application/json`

---

#### `DELETE /config/{slug}/{key}`

Reset a single config key to its manifest default.

**Auth:** admin

---

### Health

#### `GET /health`

Aggregated health status for all wares that declare a `health_check` URL in their manifest. Results are cached for 30 seconds.

**Auth:** admin

**Response — `200 OK`**
```json
[
  { "slug": "ledger", "status": "ok" },
  { "slug": "crm", "status": "warn" }
]
```

Status values: `ok` (2xx), `warn` (3xx–4xx), `error` (5xx or network failure), `unknown` (no `health_check` URL).

---

#### `GET /health/{slug}`

Check health for a single ware. Always performs a live probe (bypasses cache).

**Auth:** admin

---

### Analytics

Page-view and engagement tracking for wares.

#### `POST /analytics`

Record an analytics event from inside a ware.

**Auth:** admin · `Content-Type: application/json`

```json
{ "slug": "ledger", "event": "view", "duration_ms": 4200 }
```

`event` must be `"view"` (default) or `"interaction"`.

---

#### `GET /analytics`

Aggregate stats across all wares — views, total time, unique users — for the past N days.

**Auth:** admin

**Query params:** `?days=30`

---

#### `GET /analytics/{slug}`

Per-day breakdown for a single ware.

**Auth:** admin

**Query params:** `?days=30`

---

### Audit Log

Immutable log of all install / enable / disable / delete / update / dev-mode events.

#### `GET /audit`

Paginated audit log, most recent first.

**Auth:** admin

**Query params:** `?per_page=50&page=1&event=install`

**Response — `200 OK`**
```json
{ "entries": [...], "total": 142, "pages": 3 }
```

> [!NOTE]
> `POST /audit` is intentionally not exposed. Lifecycle events are recorded server-side only to prevent injection of fake audit entries.

---

#### `GET /audit/{slug}`

Audit entries for a single ware.

**Auth:** admin

**Response — `200 OK`**
```json
{ "entries": [...], "total": 14, "pages": 1 }
```

---

### Badges

Per-user notification counts shown as badges on ware sidebar items.

#### `GET /badges`

All badge counts for the current user.

**Auth:** admin

**Response — `200 OK`**
```json
[
  { "slug": "ledger", "count": 3 },
  { "slug": "crm", "count": 0 }
]
```

---

#### `POST /badges/{slug}`

Set a badge count for the current user.

**Auth:** admin · `Content-Type: application/json`

```json
{ "count": 5 }
```

---

#### `DELETE /badges/{slug}`

Clear the badge for a ware (set to 0).

**Auth:** admin

---

### Content Security Policy

Per-ware CSP configuration. Bazaar injects the compiled `Content-Security-Policy` header when serving the ware's HTML.

#### `GET /csp/{slug}`

Retrieve current CSP directives and the compiled header string.

**Auth:** admin

**Response — `200 OK`**
```json
{
  "directives": {
    "default-src": "'self'",
    "script-src":  "'self' 'unsafe-inline'",
    "img-src":     "'self' data: https:"
  },
  "header": "default-src 'self'; script-src 'self' 'unsafe-inline'; img-src 'self' data: https:"
}
```

---

#### `PATCH /csp/{slug}`

Update one or more CSP directives. Body must have a `directives` key containing an object of `directive → value`.

**Auth:** admin · `Content-Type: application/json`

```json
{ "directives": { "connect-src": "'self' https://api.stripe.com" } }
```

---

#### `DELETE /csp/{slug}`

Reset the ware's CSP to the Bazaar baseline.

**Auth:** admin

---

### Errors

Client-side error reports from wares, stored server-side for admin review.

#### `GET /errors`

Paginated error log, most recent first.

**Auth:** admin

**Query params:** `?per_page=50&page=1&slug=ledger`

---

#### `POST /errors`

Record a client-side error from inside a ware.

**Auth:** admin · `Content-Type: application/json`

```json
{
  "slug":    "ledger",
  "message": "TypeError: Cannot read property 'id' of undefined",
  "stack":   "…",
  "url":     "https://example.com/wp-admin/admin.php?page=bazaar-ledger"
}
```

---

#### `DELETE /errors`

Clear all errors, or all errors for a specific ware (`?slug=ledger`).

**Auth:** admin

---

#### `DELETE /errors/{id}`

Delete a single error record by ID.

**Auth:** admin

---

### Jobs

Manifest-declared WP-Cron background jobs.

#### `GET /jobs/{slug}`

List all jobs declared in a ware's manifest, with their schedule and next run time.

**Auth:** admin

**Response — `200 OK`**
```json
[
  {
    "id":       "sync_invoices",
    "label":    "Sync invoices",
    "interval": "hourly",
    "next_run": "2026-04-10T13:00:00Z"
  }
]
```

---

#### `POST /jobs/{slug}/{job_id}`

Manually trigger a declared job immediately, outside its schedule.

**Auth:** admin

---

### Nonce

#### `GET /nonce`

Issue a fresh `wp_rest` nonce. Useful for wares that need to refresh the nonce before it expires (nonces are valid for 12 hours).

**Auth:** login

**Response — `200 OK`**
```json
{
  "nonce":      "a1b2c3d4e5",
  "expires_in": 43200
}
```

`expires_in` is the number of seconds until the nonce expires (43200 = 12 hours).

---

### Storage

Server-backed key-value store per ware per user. Survives browser cache clears and is shared across devices. Backend: `wp_usermeta`.

#### `GET /store/{slug}`

List all stored keys for the current user for this ware.

**Auth:** login

---

#### `GET /store/{slug}/{key}`

Read a stored value.

**Auth:** login

**Response — `200 OK`**
```json
{ "key": "theme", "value": "dark" }
```

If the key does not exist, returns `200` with `"value": null` (not `404`):
```json
{ "key": "theme", "value": null }
```

---

#### `PUT /store/{slug}/{key}`

Write a value. Accepts any JSON-serialisable value.

**Auth:** login · `Content-Type: application/json`

```json
{ "value": "dark" }
```

---

#### `DELETE /store/{slug}/{key}`

Delete a stored value.

**Auth:** login

---

#### `DELETE /store/{slug}`

Delete all stored values for this ware for the current user.

**Auth:** login

---

### Stream (SSE)

#### `GET /stream`

Server-Sent Events endpoint. Uses a short-polling pattern: each request drains the queued events and exits immediately. The browser's `EventSource` reconnects after a `retry` interval, giving efficient push without holding a PHP worker open.

**Auth:** admin

**Response:** `Content-Type: text/event-stream`

```
retry: 3000

event: ware-installed
data: {"slug":"ledger","name":"Ledger","source":"upload"}

event: badge
data: {"slug":"crm","count":7}

event: health
data: {"slug":"ledger","status":"ok"}

event: toast
data: {"message":"Ware updated successfully.","type":"success"}
```

Event names are hyphenated: `ware-installed`, `ware-deleted`, `ware-toggled`, `ware-updated`, `health`, `badge`, `toast`.

---

### Webhooks

Outbound HTTP POST notifications on bus events. When the Bazaar event bus broadcasts the configured event, WP-Cron fires an outbound POST to the registered URL.

#### `GET /webhooks/{slug}`

List registered webhooks for a ware.

**Auth:** admin

**Response — `200 OK`**
```json
[
  {
    "id":    "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "event": "invoice.paid",
    "url":   "https://example.com/hooks/bazaar"
  }
]
```

---

#### `POST /webhooks/{slug}`

Register a new webhook.

**Auth:** admin · `Content-Type: application/json`

```json
{ "event": "invoice.paid", "url": "https://example.com/hooks/bazaar" }
```

**Response — `201 Created`** — the new webhook object including its generated `id`.

---

#### `DELETE /webhooks/{slug}/{id}`

Remove a webhook.

**Auth:** admin

---

### Service Worker

#### `GET /sw`

Serve the Bazaar zero-trust service worker script.

**Auth:** Public (no authentication required). The `Service-Worker-Allowed` response header is set to `/` so the SW can intercept all page-origin requests.

---

### Core Apps

#### `GET /core-apps`

List wares available from the Bazaar core app catalog. Response is cached server-side.

**Auth:** admin

---

#### `POST /core-apps/install`

Install a ware from the core app catalog.

**Auth:** admin · `Content-Type: application/json`

```json
{ "url": "https://registry.bazaar.example.com/wares/swatch.wp" }
```

The URL must be on the configured allowlist.

---

## Using the REST API from Inside Your Ware

Your ware runs in a same-origin iframe and can call any WordPress REST endpoint directly.

### With `@bazaar/client` (recommended)

```ts
import { wpJson } from '@bazaar/client';

const posts = await wpJson<WpPost[]>('/wp/v2/posts?per_page=5');
const me    = await wpJson<WpUser>('/wp/v2/users/me');
```

### With raw `fetch`

**1. Get the nonce from the iframe URL:**

```js
const nonce = new URLSearchParams(window.location.search).get('_wpnonce');
```

**2. Make authenticated requests:**

```js
const posts = await fetch('/wp-json/wp/v2/posts', {
  headers: { 'X-WP-Nonce': nonce },
}).then(r => r.json());

await fetch('/wp-json/wp/v2/posts', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-WP-Nonce': nonce },
  body: JSON.stringify({ title: 'New Post', status: 'publish' }),
});
```

---

## Registering Your Own REST Endpoints

If your ware needs server-side logic, create a companion WordPress plugin:

```php
// companion-plugin.php
add_action('rest_api_init', function () {
    register_rest_route('my-ware/v1', '/settings', [
        [
            'methods'             => WP_REST_Server::READABLE,
            'callback'            => fn() => new WP_REST_Response(get_option('my_ware_settings', [])),
            'permission_callback' => fn() => current_user_can('manage_options'),
        ],
        [
            'methods'             => WP_REST_Server::CREATABLE,
            'callback'            => function (WP_REST_Request $req) {
                update_option('my_ware_settings', $req->get_json_params(), false);
                return new WP_REST_Response(['success' => true]);
            },
            'permission_callback' => fn() => current_user_can('manage_options'),
        ],
    ]);
});
```

From your ware:

```ts
import { wpJson } from '@bazaar/client';

const settings = await wpJson('/my-ware/v1/settings');
```

Or scaffold the stub with WP-CLI:

```bash
wp bazaar scaffold endpoint settings --namespace=my-ware/v1
```
