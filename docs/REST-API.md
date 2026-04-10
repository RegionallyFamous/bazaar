# REST API

Bazaar registers four REST endpoints under the `bazaar/v1` namespace. All endpoints require authentication — there is no anonymous access to ware files or management actions.

Base URL: `https://your-site.com/wp-json/bazaar/v1`

---

## Authentication

All endpoints use standard WordPress REST API authentication:

- **Cookie auth** (browser requests from wp-admin): send `X-WP-Nonce: {nonce}` header. Get the nonce with `wp_create_nonce('wp_rest')`.
- **Application Passwords** (external clients): HTTP Basic auth with an Application Password.

---

## Endpoints

### Serve a Ware File

Serves any static file from an installed ware's directory.

```
GET /wp-json/bazaar/v1/serve/{slug}/{file}
```

**Parameters**

| Parameter | Type | Description |
|---|---|---|
| `slug` | string | The ware slug (e.g. `invoice-generator`) |
| `file` | string | Path to the file within the ware (e.g. `index.html`, `assets/app.js`) |

**Permissions:** Must be logged in + have the capability declared in the ware's `manifest.json` (`manage_options` by default).

**Response:** The raw file contents with the correct `Content-Type` header. Not a JSON response.

**Example:**

```
GET /wp-json/bazaar/v1/serve/invoice-generator/index.html
→ 200 text/html

GET /wp-json/bazaar/v1/serve/invoice-generator/assets/app.js
→ 200 application/javascript
```

**Error responses:**

| Status | Code | Meaning |
|---|---|---|
| 401 | `rest_forbidden` | Not logged in |
| 403 | `rest_forbidden` | Logged in but lacks required capability |
| 403 | `ware_disabled` | Ware is installed but disabled |
| 404 | `ware_not_found` | No ware with that slug |
| 404 | `file_not_found` | File doesn't exist in the ware |
| 400 | `path_traversal` | File path contains `..` |

> **Using this endpoint from inside your ware:** Relative asset paths in your HTML/JS/CSS work automatically. The browser resolves them against the iframe's `src` URL which already points at the Bazaar file server. You don't need to construct the full URL for assets.

---

### Upload a Ware

Upload and install a new `.wp` ware file.

```
POST /wp-json/bazaar/v1/wares
Content-Type: multipart/form-data
```

**Permissions:** `manage_options`

**Request body:** Multipart form data with a `file` field containing the `.wp` file.

**JS example (from inside wp-admin using `@wordpress/api-fetch`):**

```js
import apiFetch from '@wordpress/api-fetch';

const formData = new FormData();
formData.append( 'file', fileInput.files[0] );

const result = await apiFetch( {
  path: '/bazaar/v1/wares',
  method: 'POST',
  body: formData,
} );
// result.ware contains the installed ware's registry data
```

**curl example:**

```bash
curl -X POST https://your-site.com/wp-json/bazaar/v1/wares \
  -H "X-WP-Nonce: $(wp eval 'echo wp_create_nonce("wp_rest");')" \
  -F "file=@invoice-generator.wp"
```

**Success response (201):**

```json
{
  "success": true,
  "message": "\"Invoice Generator\" installed successfully.",
  "ware": {
    "name": "Invoice Generator",
    "slug": "invoice-generator",
    "version": "1.0.0",
    "author": "Nick",
    "description": "...",
    "icon": "icon.svg",
    "entry": "index.html",
    "menu": { "title": "Invoices", "position": 30, "capability": "manage_options", "parent": null },
    "enabled": true,
    "installed": "2026-04-10T12:00:00Z"
  }
}
```

**Error responses:**

| Status | Code | Meaning |
|---|---|---|
| 400 | `no_file` | No file field in request |
| 400 | `upload_error` | PHP upload error |
| 422 | `invalid_extension` | File is not `.wp` |
| 422 | `invalid_zip` | File is not a valid ZIP |
| 422 | `missing_manifest` | No `manifest.json` in archive |
| 422 | `invalid_manifest` | `manifest.json` is not valid JSON |
| 422 | `missing_manifest_field` | Required manifest field missing |
| 422 | `invalid_slug` | Slug contains invalid characters |
| 422 | `slug_exists` | A ware with that slug is already installed |
| 422 | `missing_entry` | Entry file not found in archive |
| 422 | `php_not_allowed` | Archive contains a PHP file |
| 422 | `too_large` | Uncompressed size exceeds limit |
| 500 | `registry_failed` | Files extracted but registry write failed |

---

### Toggle Ware Status

Enable or disable an installed ware.

```
PATCH /wp-json/bazaar/v1/wares/{slug}
Content-Type: application/json
```

**Permissions:** `manage_options`

**Request body:**

```json
{
  "enabled": true
}
```

**JS example:**

```js
await apiFetch( {
  path: `/bazaar/v1/wares/invoice-generator`,
  method: 'PATCH',
  data: { enabled: false },
} );
```

**Success response (200):**

```json
{
  "success": true,
  "slug": "invoice-generator",
  "enabled": false,
  "message": "\"invoice-generator\" disabled."
}
```

---

### Delete a Ware

Remove a ware from the registry and delete its files from disk.

```
DELETE /wp-json/bazaar/v1/wares/{slug}
```

**Permissions:** `manage_options`

**JS example:**

```js
await apiFetch( {
  path: `/bazaar/v1/wares/invoice-generator`,
  method: 'DELETE',
} );
```

**Success response (200):**

```json
{
  "success": true,
  "slug": "invoice-generator",
  "message": "\"invoice-generator\" deleted successfully."
}
```

---

## Using the REST API from Inside Your Ware

Your ware runs in an iframe on the same origin as WordPress, so you can call any WordPress REST endpoint directly.

**Get the nonce from the iframe URL:**

```js
const nonce = new URLSearchParams( window.location.search ).get( '_wpnonce' );
```

**Query WordPress data:**

```js
const nonce = new URLSearchParams( window.location.search ).get( '_wpnonce' );

// Get posts
const posts = await fetch( '/wp-json/wp/v2/posts', {
  headers: { 'X-WP-Nonce': nonce },
} ).then( r => r.json() );

// Get current user
const me = await fetch( '/wp-json/wp/v2/users/me', {
  headers: { 'X-WP-Nonce': nonce },
} ).then( r => r.json() );
```

**Store custom data using the Settings API:**

You can expose custom options to your ware via a custom REST endpoint in your own plugin or theme, then call it from the ware.

---

## Registering Your Own REST Endpoints

If your ware needs persistent storage or server-side logic, register a companion WordPress plugin that adds REST routes. Your ware can then call those routes using the same nonce pattern.

Example companion plugin route:

```php
add_action( 'rest_api_init', function() {
    register_rest_route( 'my-ware/v1', '/settings', [
        'methods'             => WP_REST_Server::READABLE,
        'callback'            => fn() => new WP_REST_Response( get_option( 'my_ware_settings', [] ) ),
        'permission_callback' => fn() => current_user_can( 'manage_options' ),
    ] );
} );
```

Then from your ware:

```js
const settings = await fetch( '/wp-json/my-ware/v1/settings', {
  headers: { 'X-WP-Nonce': nonce },
} ).then( r => r.json() );
```
