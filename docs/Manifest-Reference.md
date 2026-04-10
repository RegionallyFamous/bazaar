# Manifest Reference

`manifest.json` is the only WordPress-specific file in a ware. It lives at the **root** of the archive and tells Bazaar how to register your app — its name, where to find the entry HTML, where to put it in the sidebar, and who can access it.

---

## Table of Contents

- [Minimal Example](#minimal-example)
- [Full Example](#full-example)
- [Field Reference](#field-reference)
  - [name](#name)
  - [slug](#slug)
  - [version](#version)
  - [author](#author)
  - [description](#description)
  - [icon](#icon)
  - [entry](#entry)
  - [menu](#menu)
  - [permissions](#permissions)
  - [health_check](#health_check)
  - [jobs](#jobs)
  - [license](#license)
  - [registry](#registry)
- [Validation Rules](#validation-rules)
- [Versioning Your Ware](#versioning-your-ware)

---

## Minimal Example

```json
{
  "name": "Invoice Generator",
  "slug": "invoice-generator",
  "version": "1.0.0"
}
```

That's all you need. Bazaar fills in sensible defaults for everything else.

---

## Full Example

```json
{
  "name": "Invoice Generator",
  "slug": "invoice-generator",
  "version": "1.2.0",
  "author": "Nick",
  "description": "Generate and manage invoices directly from wp-admin.",
  "icon": "icon.svg",
  "entry": "index.html",
  "menu": {
    "title": "Invoices",
    "position": 30,
    "capability": "manage_options",
    "parent": null,
    "group": "finance"
  },
  "permissions": {
    "network": [
      "https://api.stripe.com",
      "https://cdn.example.com"
    ]
  },
  "health_check": "https://api.example.com/health",
  "jobs": [
    {
      "id":       "sync_invoices",
      "label":    "Sync invoices from payment provider",
      "interval": "hourly",
      "endpoint": "/wp-json/bazaar/v1/jobs/invoice-generator/sync_invoices"
    }
  ],
  "license": {
    "type":     "key",
    "url":      "https://example.com/api/validate-license",
    "required": true
  },
  "registry": {
    "updateUrl": "https://registry.example.com/wares/invoice-generator.json",
    "homepage":  "https://example.com/wares/invoice-generator"
  }
}
```

---

## Field Reference

### `name`

| Property | Value |
|:---|:---|
| Type | `string` |
| Required | **Yes** |
| Example | `"Invoice Generator"` |

Human-readable display name. Shown in the Bazaar gallery card and as the browser tab title when the ware is open.

---

### `slug`

| Property | Value |
|:---|:---|
| Type | `string` |
| Required | **Yes** |
| Pattern | `[a-z0-9-]+` |
| Example | `"invoice-generator"` |

Unique identifier for the ware. Used as:
- the directory name under `wp-content/bazaar/`
- the path segment in all REST API URLs (`/bazaar/v1/serve/invoice-generator/…`)
- the WordPress menu slug (`bazaar-ware-invoice-generator`)

> [!CAUTION]
> **The slug is permanent.** Changing it after installation requires deleting and re-installing the ware. Choose it carefully — lowercase letters, numbers, and hyphens only.

---

### `version`

| Property | Value |
|:---|:---|
| Type | `string` |
| Required | **Yes** |
| Format | Semver recommended (`MAJOR.MINOR.PATCH`) |
| Example | `"1.0.0"` |

Version string displayed in the gallery. Bazaar does not currently enforce semver but it is strongly recommended.

---

### `author`

| Property | Value |
|:---|:---|
| Type | `string` |
| Required | No |
| Example | `"Nick"` |

Creator name shown in the gallery card. Can be a person, team, or company.

---

### `description`

| Property | Value |
|:---|:---|
| Type | `string` |
| Required | No |
| Example | `"Generate and manage invoices from wp-admin."` |

Short description shown in the gallery card. One or two sentences is ideal.

---

### `icon`

| Property | Value |
|:---|:---|
| Type | `string` (path relative to archive root) |
| Required | No |
| Default | `"icon.svg"` |
| Example | `"icon.svg"`, `"assets/logo.png"` |

Path to the ware's sidebar icon within the archive. Supported formats:

| Format | Notes |
|:---|:---|
| **SVG** ✓ recommended | Embedded as a `data:` URI — scales perfectly, respects WP admin colour schemes. Keep under 4 KB. |
| PNG / JPG / WebP | Served via the Bazaar file server. Use 20×20 px (or 40×40 for retina). |

If the file is missing or the path is wrong, Bazaar falls back to `dashicons-admin-plugins`.

---

### `entry`

| Property | Value |
|:---|:---|
| Type | `string` (path relative to archive root) |
| Required | No |
| Default | `"index.html"` |
| Example | `"app.html"`, `"dist/index.html"` |

The HTML file Bazaar loads in the iframe. Must exist in the archive.

> [!TIP]
> If your build tool outputs to a subdirectory (e.g. `dist/index.html`), either set `"entry": "dist/index.html"` in the manifest — or zip from *inside* `dist/` so `index.html` sits at the archive root. The latter is usually cleaner.

---

### `menu`

An object that controls how the ware's admin page is registered. All sub-fields are optional.

---

#### `menu.title`

| Property | Value |
|:---|:---|
| Type | `string` |
| Required | No |
| Default | Same as `name` |
| Example | `"Invoices"` |

The label shown in the WordPress sidebar. Shorter than `name` is usually better here.

---

#### `menu.position`

| Property | Value |
|:---|:---|
| Type | `integer` |
| Required | No |
| Default | Appended to end |
| Example | `30` |

WordPress menu position integer. Common reference points:

| Position | Default item |
|:---:|:---|
| 2 | Dashboard |
| 5 | Posts |
| 10 | Media |
| 20 | Pages |
| 25 | Comments |
| 60 | Appearance |
| 65 | Plugins |
| 70 | Users |
| 75 | Tools |
| 80 | Settings |

> [!TIP]
> Use a non-round number (e.g. `26` instead of `25`) to avoid collisions with other plugins.

---

#### `menu.capability`

| Property | Value |
|:---|:---|
| Type | `string` |
| Required | No |
| Default | `"manage_options"` |
| Example | `"edit_posts"`, `"read"` |

The WordPress capability a user must have to see and access the ware. Bazaar enforces this on **both** menu registration and the REST file-serving endpoint.

| Capability | Who has it |
|:---|:---|
| `manage_options` | Administrators only |
| `edit_posts` | Editors, Authors, Administrators |
| `publish_posts` | Authors and above |
| `read` | All logged-in users (Subscribers and above) |

> [!NOTE]
> This is a **minimum** capability check. For finer-grained access control inside your ware, implement it yourself using the WordPress REST API (`/wp/v2/users/me`).

---

#### `menu.parent`

| Property | Value |
|:---|:---|
| Type | `string \| null` |
| Required | No |
| Default | `null` (top-level menu item) |
| Example | `"tools.php"` |

When set, the ware becomes a submenu item under an existing top-level menu.

| Slug | Parent menu |
|:---|:---|
| `tools.php` | Tools |
| `options-general.php` | Settings |
| `upload.php` | Media |
| `edit.php` | Posts |
| `edit.php?post_type=page` | Pages |
| `bazaar-ware-{slug}` | Another installed ware |

---

#### `menu.group`

| Property | Value |
|:---|:---|
| Type | `string \| null` |
| Required | No |
| Default | `null` |
| Example | `"finance"` |

An arbitrary group label used by the Bazaar shell to visually cluster related wares in the sidebar nav. Multiple wares with the same `group` value are rendered under a shared section header. Has no effect on WordPress's own menu registration.

---

### `permissions`

| Property | Value |
|:---|:---|
| Type | `object` |
| Required | No |

Declares what external resources this ware is allowed to access. Bazaar uses these declarations to enforce network policies via the zero-trust service worker.

**`permissions.network`** — `string[]`

An allowlist of origins the ware is permitted to fetch from. Any fetch request to an origin *not* in this list (and not to the WordPress site itself) will be blocked with a `403` response by the service worker.

```json
{
  "permissions": {
    "network": [
      "https://api.stripe.com",
      "https://fonts.googleapis.com"
    ]
  }
}
```

> [!NOTE]
> The WordPress site's own origin is always implicitly allowed regardless of this field. Zero-trust enforcement only activates if the ware declares `"zero_trust": true` or if it is enabled globally by the admin.

---

### `health_check`

| Property | Value |
|:---|:---|
| Type | `string` (URL) |
| Required | No |
| Example | `"https://api.example.com/health"` |

A URL that Bazaar polls to determine whether an external dependency (API, service, etc.) is reachable. The result is surfaced in the Bazaar shell UI as a status indicator (ok / warn / error) and pushed in real-time via the SSE stream.

Bazaar performs a `GET` request with a 5-second timeout and maps HTTP status codes to:

| HTTP range | Status |
|:---:|:---|
| 200–299 | `ok` |
| 300–499 | `warn` |
| 500+ or network error | `error` |

---

### `jobs`

| Property | Value |
|:---|:---|
| Type | `array` |
| Required | No |

Declares background jobs that Bazaar should schedule via WP-Cron on install. Each job is an object:

| Field | Type | Required | Description |
|:---|:---|:---:|:---|
| `id` | `string` | **Yes** | Unique identifier within this ware (e.g. `sync_orders`) |
| `label` | `string` | **Yes** | Human-readable description shown in the Bazaar shell |
| `interval` | `string` | **Yes** | WP-Cron schedule: `hourly`, `twicedaily`, `daily`, or any custom schedule name |
| `endpoint` | `string` | No | REST URL Bazaar calls when the job fires. Omit if you register a WP-Cron hook directly in a companion plugin. |

```json
{
  "jobs": [
    {
      "id":       "sync_products",
      "label":    "Sync products from API",
      "interval": "hourly",
      "endpoint": "/wp-json/bazaar/v1/jobs/my-ware/sync_products"
    }
  ]
}
```

Admins can view scheduled jobs and trigger them manually via `GET /bazaar/v1/jobs/{slug}` and `POST /bazaar/v1/jobs/{slug}/{job_id}`.

---

### `license`

| Property | Value |
|:---|:---|
| Type | `object` |
| Required | No |

Controls license-key enforcement for paid wares.

| Field | Type | Default | Description |
|:---|:---|:---:|:---|
| `type` | `"free"` \| `"key"` | `"free"` | `"key"` enables license-key gating |
| `url` | `string` | `""` | URL Bazaar POSTs `{ slug, key, site }` to for remote validation |
| `required` | `boolean` | `false` | When `true`, installation is blocked until a key is stored |

```json
{
  "license": {
    "type":     "key",
    "url":      "https://example.com/api/validate-license",
    "required": true
  }
}
```

Set and validate keys with `wp bazaar license set <slug> <key>` or through the Bazaar admin UI.

---

### `registry`

| Property | Value |
|:---|:---|
| Type | `object` |
| Required | No |

Metadata linking this ware to a remote registry entry so Bazaar can check for updates.

| Field | Type | Description |
|:---|:---|:---|
| `updateUrl` | `string` | URL to a JSON file describing the latest available version |
| `homepage` | `string` | Canonical page for this ware (shown in the gallery) |
| `signature` | `string` | Base64-encoded RSA signature over the archive (verified on install) |

```json
{
  "registry": {
    "updateUrl": "https://registry.example.com/wares/my-ware.json",
    "homepage":  "https://example.com/wares/my-ware"
  }
}
```

`updateUrl` should return a JSON object with at least a `version` field. Bazaar compares it to the installed version and flags the ware as outdated if a newer one is available (`wp bazaar outdated`).

---

## Validation Rules

Bazaar runs these checks on upload and rejects the ware if any fail:

- [x] File has a `.wp` extension
- [x] File is a valid ZIP archive
- [x] `manifest.json` exists at the archive root
- [x] `name`, `slug`, and `version` are present non-empty strings
- [x] `slug` matches `[a-z0-9-]+`
- [x] `slug` is not already installed
- [x] The `entry` file exists in the archive
- [x] No PHP files anywhere in the archive (`.php`, `.phtml`, `.phar`, etc.)
- [x] Total uncompressed size is under the configured limit (default 50 MB)

---

## Versioning Your Ware

### Manual updates

1. Bump the version in `manifest.json`
2. Re-package: `npm run package`
3. Install with force: `wp bazaar install my-ware.wp --force`

### Remote updates

If your ware declares a `registry.updateUrl`, Bazaar can check for and apply updates automatically:

```bash
wp bazaar outdated                          # list wares with newer versions available
wp bazaar update invoice-generator          # update to the latest version
wp bazaar update --all                      # update everything
```

The URL should serve a JSON file like:

```json
{
  "version":   "1.3.0",
  "downloadUrl": "https://registry.example.com/wares/invoice-generator-1.3.0.wp",
  "changelog": "Fixed date formatting on generated PDFs."
}
```
