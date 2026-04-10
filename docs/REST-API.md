# REST API

Bazaar registers four REST endpoints under the `bazaar/v1` namespace. All endpoints require authentication — there is no anonymous access to ware files or management actions.

**Base URL:** `https://your-site.com/wp-json/bazaar/v1`

---

## Table of Contents

- [Authentication](#authentication)
- [Endpoints](#endpoints)
  - [GET /serve/{slug}/{file}](#get-serveslugfile)
  - [POST /wares](#post-wares)
  - [PATCH /wares/{slug}](#patch-waresslug)
  - [DELETE /wares/{slug}](#delete-waresslug)
- [Using the REST API from Inside Your Ware](#using-the-rest-api-from-inside-your-ware)
- [Registering Your Own REST Endpoints](#registering-your-own-rest-endpoints)

---

## Authentication

| Context | Method |
|:---|:---|
| Browser (wp-admin) | Cookie auth + `X-WP-Nonce` header — get the nonce with `wp_create_nonce('wp_rest')` |
| External clients | [Application Passwords](https://developer.wordpress.org/rest-api/using-the-rest-api/authentication/#application-passwords) via HTTP Basic auth |

> [!NOTE]
> `@wordpress/api-fetch` (used by the Bazaar admin UI) attaches the nonce automatically via the `X-WP-Nonce` header. You only need to think about this when making fetch calls from inside your own ware.

---

## Endpoints

### GET /serve/{slug}/{file}

Serves any static file from an installed ware's directory.

```
GET /wp-json/bazaar/v1/serve/{slug}/{file}
```

| Parameter | Type | Description |
|:---|:---|:---|
| `slug` | `string` | The ware slug, e.g. `invoice-generator` |
| `file` | `string` | Path to the file within the ware, e.g. `index.html` or `assets/app.js` |

**Required permission:** Logged in + capability declared in the ware's `manifest.json` (default: `manage_options`)

**Response:** Raw file contents with the correct `Content-Type` header — not a JSON response.

```
GET /wp-json/bazaar/v1/serve/invoice-generator/index.html
→ 200 Content-Type: text/html; charset=UTF-8

GET /wp-json/bazaar/v1/serve/invoice-generator/assets/app.js
→ 200 Content-Type: application/javascript
```

<details>
<summary><strong>Error responses</strong></summary>

| Status | Code | Meaning |
|:---:|:---|:---|
| 401 | `rest_forbidden` | Not logged in |
| 403 | `rest_forbidden` | Logged in but lacks required capability |
| 403 | `ware_disabled` | Ware is installed but disabled |
| 404 | `ware_not_found` | No ware with that slug |
| 404 | `file_not_found` | File doesn't exist in the ware |
| 400 | `path_traversal` | File path contains `..` |

</details>

> [!TIP]
> **Relative asset paths just work.** Your `index.html` can reference `./assets/app.js` and the browser resolves it against the iframe's `src` URL, which already points at this endpoint. You never need to construct the full URL for assets.

---

### POST /wares

Upload and install a new `.wp` ware file.

```
POST /wp-json/bazaar/v1/wares
Content-Type: multipart/form-data
```

**Required permission:** `manage_options`

**Request body:** Multipart form data with a `file` field containing the `.wp` archive.

<details>
<summary><strong>JS example (from inside wp-admin)</strong></summary>

```js
import apiFetch from '@wordpress/api-fetch';

const formData = new FormData();
formData.append( 'file', fileInput.files[ 0 ] );

const result = await apiFetch( {
  path: '/bazaar/v1/wares',
  method: 'POST',
  body: formData,
} );
// result.ware contains the new ware's full registry entry
```

</details>

<details>
<summary><strong>curl example</strong></summary>

```bash
curl -X POST https://your-site.com/wp-json/bazaar/v1/wares \
  -H "X-WP-Nonce: $(wp eval 'echo wp_create_nonce("wp_rest");')" \
  -F "file=@invoice-generator.wp"
```

</details>

**Success response — `201 Created`**

```json
{
  "success": true,
  "message": "\"Invoice Generator\" installed successfully.",
  "ware": {
    "name": "Invoice Generator",
    "slug": "invoice-generator",
    "version": "1.0.0",
    "author": "Nick",
    "description": "Generate and manage invoices from wp-admin.",
    "icon": "icon.svg",
    "entry": "index.html",
    "menu": {
      "title": "Invoices",
      "position": 30,
      "capability": "manage_options",
      "parent": null
    },
    "enabled": true,
    "installed": "2026-04-10T12:00:00Z"
  }
}
```

<details>
<summary><strong>Error responses</strong></summary>

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
| 422 | `slug_exists` | A ware with that slug is already installed |
| 422 | `missing_entry` | Entry file not found in archive |
| 422 | `php_not_allowed` | Archive contains a `.php` / `.phar` / `.phtml` file |
| 422 | `too_large` | Uncompressed size exceeds configured limit |
| 500 | `registry_failed` | Files extracted but registry write failed |

</details>

---

### PATCH /wares/{slug}

Enable or disable an installed ware.

```
PATCH /wp-json/bazaar/v1/wares/{slug}
Content-Type: application/json
```

**Required permission:** `manage_options`

**Request body:**

```json
{ "enabled": true }
```

**JS example:**

```js
await apiFetch( {
  path: `/bazaar/v1/wares/invoice-generator`,
  method: 'PATCH',
  data: { enabled: false },
} );
```

**Success response — `200 OK`**

```json
{
  "success": true,
  "slug": "invoice-generator",
  "enabled": false,
  "message": "\"invoice-generator\" disabled."
}
```

---

### DELETE /wares/{slug}

Remove a ware from the registry and permanently delete its files from disk.

```
DELETE /wp-json/bazaar/v1/wares/{slug}
```

**Required permission:** `manage_options`

> [!WARNING]
> This is irreversible. The ware's files are deleted from `wp-content/bazaar/{slug}/` immediately.

**JS example:**

```js
await apiFetch( {
  path: `/bazaar/v1/wares/invoice-generator`,
  method: 'DELETE',
} );
```

**Success response — `200 OK`**

```json
{
  "success": true,
  "slug": "invoice-generator",
  "message": "\"invoice-generator\" deleted successfully."
}
```

---

## Using the REST API from Inside Your Ware

Your ware runs in a same-origin iframe, so it can call any WordPress REST endpoint directly using `fetch`.

**1. Get the nonce from the iframe URL:**

```js
const nonce = new URLSearchParams( window.location.search ).get( '_wpnonce' );
```

**2. Make authenticated requests:**

```js
// Read posts
const posts = await fetch( '/wp-json/wp/v2/posts', {
  headers: { 'X-WP-Nonce': nonce },
} ).then( r => r.json() );

// Create a post
await fetch( '/wp-json/wp/v2/posts', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-WP-Nonce': nonce,
  },
  body: JSON.stringify({ title: 'New Post', status: 'publish' }),
} );

// Get current user
const me = await fetch( '/wp-json/wp/v2/users/me', {
  headers: { 'X-WP-Nonce': nonce },
} ).then( r => r.json() );
```

---

## Registering Your Own REST Endpoints

If your ware needs server-side logic or persistent storage, create a companion WordPress plugin that registers custom REST routes. Your ware calls them using the same nonce pattern.

```php
// companion-plugin.php
add_action( 'rest_api_init', function () {
    register_rest_route( 'my-ware/v1', '/settings', [
        [
            'methods'             => WP_REST_Server::READABLE,
            'callback'            => fn() => new WP_REST_Response( get_option( 'my_ware_settings', [] ) ),
            'permission_callback' => fn() => current_user_can( 'manage_options' ),
        ],
        [
            'methods'             => WP_REST_Server::CREATABLE,
            'callback'            => function ( WP_REST_Request $req ) {
                update_option( 'my_ware_settings', $req->get_json_params(), false );
                return new WP_REST_Response( [ 'success' => true ] );
            },
            'permission_callback' => fn() => current_user_can( 'manage_options' ),
        ],
    ] );
} );
```

From your ware:

```js
const nonce    = new URLSearchParams( window.location.search ).get( '_wpnonce' );
const settings = await fetch( '/wp-json/my-ware/v1/settings', {
  headers: { 'X-WP-Nonce': nonce },
} ).then( r => r.json() );
```
