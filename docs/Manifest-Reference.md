# Manifest Reference

`manifest.json` is the only WordPress-specific file in a ware. It lives at the root of the archive and tells Bazaar how to register your app.

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
    "parent": null
  }
}
```

---

## Field Reference

### `name`

| | |
|---|---|
| **Type** | string |
| **Required** | Yes |
| **Example** | `"Invoice Generator"` |

Human-readable display name. Shown in the Bazaar gallery and as the browser tab title when the ware is open.

---

### `slug`

| | |
|---|---|
| **Type** | string |
| **Required** | Yes |
| **Pattern** | `[a-z0-9-]+` (lowercase letters, numbers, hyphens only) |
| **Example** | `"invoice-generator"` |

Unique identifier for the ware. Used as the directory name under `wp-content/bazaar/` and in all REST API URLs. Must be unique across all installed wares.

> **Choose carefully.** The slug is permanent — changing it after installation requires deleting and re-installing the ware.

---

### `version`

| | |
|---|---|
| **Type** | string |
| **Required** | Yes |
| **Format** | Semver recommended |
| **Example** | `"1.0.0"` |

Version string for the ware. Displayed in the Bazaar gallery. Bazaar does not currently enforce semver but it is strongly recommended.

---

### `author`

| | |
|---|---|
| **Type** | string |
| **Required** | No |
| **Example** | `"Nick"` |

Creator name shown in the gallery card. Can be a person, team, or company name.

---

### `description`

| | |
|---|---|
| **Type** | string |
| **Required** | No |
| **Example** | `"Generate and manage invoices from wp-admin."` |

Short description shown in the gallery card. Keep it to one or two sentences.

---

### `icon`

| | |
|---|---|
| **Type** | string (file path relative to archive root) |
| **Required** | No |
| **Default** | `"icon.svg"` |
| **Example** | `"icon.svg"`, `"assets/logo.png"` |

Path to the ware's sidebar icon, relative to the archive root. Supported formats:

- **SVG** — recommended. Embedded as a data URI so it scales perfectly and respects WordPress's dark/light admin color schemes. Keep it under 4 KB.
- **PNG / JPG / GIF / WebP** — served via the Bazaar file server. Use 20×20 or 40×40 (retina) pixels.

If the icon file is missing or the path is wrong, Bazaar falls back to the generic `dashicons-admin-plugins` icon.

---

### `entry`

| | |
|---|---|
| **Type** | string (file path relative to archive root) |
| **Required** | No |
| **Default** | `"index.html"` |
| **Example** | `"app.html"`, `"dist/index.html"` |

The HTML file that Bazaar loads in the iframe. Must exist in the archive.

> If your build tool outputs to a subdirectory (e.g. `dist/index.html`), set this accordingly — **or** zip from inside the `dist/` directory so everything sits at the archive root.

---

### `menu`

An object that controls how the ware's menu page is registered in `wp-admin`.

All `menu` fields are optional. If omitted entirely, the ware gets a top-level menu page with its `name` as the title.

#### `menu.title`

| | |
|---|---|
| **Type** | string |
| **Required** | No |
| **Default** | Same as `name` |
| **Example** | `"Invoices"` |

The text shown in the sidebar menu. Shorter than `name` is often better here.

#### `menu.position`

| | |
|---|---|
| **Type** | integer |
| **Required** | No |
| **Default** | WordPress decides (appended to end) |
| **Example** | `30` |

WordPress menu position integer. Common reference points:

| Position | Default item |
|---|---|
| 2 | Dashboard |
| 4 | Separator |
| 5 | Posts |
| 10 | Media |
| 20 | Pages |
| 25 | Comments |
| 60 | Appearance |
| 65 | Plugins |
| 70 | Users |
| 75 | Tools |
| 80 | Settings |
| 100 | Separator |

Use a non-round number (e.g. `26` instead of `25`) to avoid collisions with core and other plugins.

#### `menu.capability`

| | |
|---|---|
| **Type** | string |
| **Required** | No |
| **Default** | `"manage_options"` |
| **Example** | `"edit_posts"`, `"read"` |

The WordPress capability a user must have to see and access the ware. Bazaar checks this on both the menu registration and the REST file-serving endpoint.

Common values:

| Capability | Who has it |
|---|---|
| `manage_options` | Administrators only |
| `edit_posts` | Editors, Authors, Administrators |
| `publish_posts` | Authors and above |
| `read` | All logged-in users (including Subscribers) |

> **Important:** This is a **minimum** capability check. If you need role-based access control inside your ware, implement it yourself using the WordPress REST API.

#### `menu.parent`

| | |
|---|---|
| **Type** | string \| null |
| **Required** | No |
| **Default** | `null` (top-level menu) |
| **Example** | `"tools.php"`, `"options-general.php"` |

When set, the ware becomes a submenu item under an existing top-level menu. Pass the parent menu's file slug.

Common parent slugs:

| Slug | Menu |
|---|---|
| `tools.php` | Tools |
| `options-general.php` | Settings |
| `upload.php` | Media |
| `edit.php` | Posts |
| `edit.php?post_type=page` | Pages |

You can also nest under another ware by using the ware's menu slug: `bazaar-ware-{slug}`.

---

## Validation Rules

Bazaar validates the manifest on upload and rejects the ware if any of these fail:

1. `manifest.json` exists at the archive root
2. `name`, `slug`, and `version` are present non-empty strings
3. `slug` matches `[a-z0-9-]+`
4. `slug` is not already installed
5. The `entry` file exists in the archive
6. No PHP files anywhere in the archive (`.php`, `.phtml`, `.phar`, etc.)
7. Total uncompressed size is under the configured limit (default 50 MB)

---

## Versioning Your Ware

Bazaar stores the version string from your manifest but does not currently enforce or automate updates. The recommended workflow is:

1. Bump the version in `manifest.json`
2. Re-package the ware
3. Run `wp bazaar install my-ware.wp --force` (or delete + re-upload in the UI)

A GUI update flow and version comparison are planned for a future release.
