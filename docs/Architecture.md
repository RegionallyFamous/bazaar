# Architecture

This page describes how Bazaar is structured internally — from how wares are stored and served, to how the shared library system works, to the full security model.

---

## Table of Contents

- [High-level flow](#high-level-flow)
- [Directory layout](#directory-layout)
- [Storage model](#storage-model)
- [File serving](#file-serving)
- [Shared libraries and import maps](#shared-libraries-and-import-maps)
- [Service worker cache](#service-worker-cache)
- [Security model](#security-model)
- [Content Security Policy](#content-security-policy)
- [Contributing and local dev](#contributing-and-local-dev)

---

## High-level flow

### Installing a ware

```
Upload .wp file
  → Validate ZIP structure + manifest.json
  → Reject forbidden file types (.php, .phar, …)
  → Check compression ratios (zip-bomb guard)
  → Atomically extract to wp-content/bazaar/{slug}/
  → Register manifest in wp_options
  → Inject admin menu page via MenuManager
```

### Loading a ware

```
User clicks sidebar menu item
  → WareRenderer outputs <iframe src="/wp-json/bazaar/v1/serve/{slug}/index.html?_wpnonce=…">
  → REST permission callback: is_user_logged_in() + current_user_can(capability)
  → WareServer reads HTML, injects <base href>, <importmap>, error reporter
  → Browser renders the app in a full-screen sandboxed iframe
  → Service worker intercepts all subsequent asset fetches and serves from cache
```

---

## Directory layout

```
bazaar/
├── bazaar.php                       Plugin bootstrap + constants
├── src/
│   ├── Plugin.php                   Hook registration, DI wiring
│   ├── WareRegistry.php             Two-tier wp_options storage
│   ├── WareLoader.php               ZIP validation + WP_Filesystem extraction
│   ├── WareRenderer.php             iframe output
│   ├── WareUpdater.php              Auto-update scheduler + runner
│   ├── WareBundler.php              .wpbundle multi-ware archives
│   ├── WareLicense.php              License key storage + remote validation
│   ├── WareSigner.php               RSA signature verification
│   ├── MenuManager.php              Dynamic admin menus
│   ├── BazaarPage.php               The Bazaar admin page (gallery + upload)
│   ├── RemoteRegistry.php           Remote ware registry + update checks
│   ├── Multisite.php                Multisite index merging
│   ├── AuditLog.php                 Audit log helper
│   ├── CspPolicy.php                CSP builder
│   ├── WebhookDispatcher.php        Outbound webhook dispatcher
│   ├── Blocks/
│   │   └── WareBlock.php            Gutenberg block for embedding wares
│   ├── Db/
│   │   └── Tables.php               Custom table schema (analytics, errors)
│   ├── CLI/
│   │   ├── BazaarCommand.php        WP-CLI root command
│   │   └── Traits/
│   │       ├── WareLifecycleTrait.php   install/enable/disable/delete/update
│   │       ├── WareDevTrait.php         dev/scaffold/sign/keypair/types
│   │       └── WareOpsTrait.php         license/analytics/doctor/logs/audit/csp
│   └── REST/
│       ├── BazaarController.php         Base controller (shared permission helpers)
│       ├── WareServer.php               Authenticated static file server + importmap injection
│       ├── UploadController.php
│       ├── WareController.php           List / toggle / delete
│       ├── AnalyticsController.php
│       ├── AuditController.php
│       ├── BadgeController.php
│       ├── ConfigController.php
│       ├── CspController.php
│       ├── ErrorsController.php
│       ├── HealthController.php
│       ├── JobsController.php
│       ├── NonceController.php
│       ├── StorageController.php
│       ├── StreamController.php
│       └── WebhooksController.php
├── admin/src/                       Vite source (shell SPA + admin CSS)
│   ├── shell.js                     Main shell SPA
│   ├── shell.css
│   ├── zero-trust-sw.js             Service worker (network allowlist + universal asset cache)
│   ├── shared/                      Shared library re-export stubs
│   │   ├── react.js
│   │   ├── react-dom.js
│   │   ├── react-jsx-runtime.js
│   │   ├── vue.js
│   │   └── registry.json            Maps package names → Vite entry keys
│   └── modules/                     Shell sub-modules (nav, views, inspector…)
├── blocks/ware/                     Gutenberg block definition
├── create-ware/                     `npm create ware@latest` CLI scaffolder
├── packages/client/                 @bazaar/client TypeScript library
├── templates/                       PHP view templates
│   ├── bazaar-page.php
│   ├── bazaar-shell.php
│   └── ware-container.php
└── wares/                           Built-in core wares (source + registry)
    ├── registry.json                Remote registry source
    ├── pixel-art/
    ├── invoice-generator/
    ├── focus/
    ├── kanban/
    ├── color-palette/
    └── retro-synth/
```

---

## Storage model

Bazaar uses WordPress's `wp_options` table with a two-tier structure. No custom tables are required for the core registry.

| Option key | Contents |
|:---|:---|
| `bazaar_wares_index` | Compact index of all installed wares (slug, name, version, enabled flag) |
| `bazaar_ware_{slug}` | Full manifest + runtime fields for a single ware |

The index is used for cheap list operations. The full record is loaded on demand (for serving, rendering, or CLI inspection).

Both are maintained by `WareRegistry::register()` on install and kept in sync by `WareRegistry::update()` and `delete()`.

Installed ware **files** live at `wp-content/bazaar/{slug}/` — outside the plugin directory so they survive plugin updates or reinstalls.

---

## File serving

All ware assets are served through the REST endpoint `GET /wp-json/bazaar/v1/serve/{slug}/{file}`.

**Why not direct filesystem access?** The REST layer enforces authentication and capability checks before any bytes leave PHP. Direct requests to `wp-content/bazaar/` are blocked by an `.htaccess` that is written on first install.

**Performance features:**
- `ETag` (hash of path + mtime + size) and `Last-Modified` headers on every response
- `304 Not Modified` when the client's copy is still fresh — no file read needed
- `Cache-Control: private, max-age=31536000, immutable` for content-hashed assets
- `Cache-Control: private, max-age=300, must-revalidate` for HTML entry files (short because the nonce rotates)
- Files larger than 50 MB (configurable via `bazaar_max_serve_bytes` filter) are rejected to protect PHP memory

**HTML injection pipeline:** When serving `index.html`, `WareServer` reads the file into memory and applies three transforms before sending it:

1. **`<base href>`** — makes Vite's relative asset paths resolve to the directly-served static URL without going through PHP
2. **`<importmap>`** — maps bare specifiers (`react`, `react-dom`, `react/jsx-runtime`) to the shell's versioned, content-hashed bundles
3. **Error reporter** — a tiny inline `<script>` that forwards unhandled JS errors to the shell via `postMessage`, so error overlays work across the iframe boundary

---

## Shared libraries and import maps

When multiple wares use the same framework, each iframe would normally download and parse its own copy. Bazaar avoids this with two mechanisms.

### Layer 1 — Import maps

The admin shell builds versioned, content-hashed bundles of React, React DOM, `react/jsx-runtime`, and Vue in `admin/dist/shared/`. A `registry.json` maps package names to Vite entry keys; the Vite build manifest maps those to the actual hashed filenames.

When `WareServer` serves an HTML file for a ware that declares `"shared": ["react", "react-dom", "react/jsx-runtime"]`, it builds and injects:

```html
<script type="importmap">
{
  "imports": {
    "react":             "/wp-content/plugins/bazaar/admin/dist/shared/react-CAY2O9Zp.js",
    "react-dom":         "/wp-content/plugins/bazaar/admin/dist/shared/react-dom-DcnmWfor.js",
    "react/jsx-runtime": "/wp-content/plugins/bazaar/admin/dist/shared/react-jsx-runtime-DpaPxiTZ.js"
  }
}
</script>
```

The ware's Vite config must mark the same packages as Rollup externals so the bundle contains `import … from "react"` instead of a bundled copy:

```ts
build: {
  rollupOptions: {
    external: ['react', 'react-dom', 'react/jsx-runtime'],
  },
},
```

After the first load, V8's bytecode cache means React is not re-parsed — it's reused across all ware iframes.

> **Note:** `react/jsx-runtime` is always required alongside `react` and `react-dom`. The JSX transform emits `import { jsx } from "react/jsx-runtime"` regardless of whether you declared it explicitly. `WareServer` adds it automatically if a ware requests `react` or `react-dom` but omits it.

### Layer 2 — Service worker cache

`zero-trust-sw.js` is the Bazaar service worker. It caches every `wp-content/bazaar/` asset and every shared bundle in `admin/dist/shared/` after the first fetch. On subsequent page loads, nothing hits the network — not even a conditional request.

---

## Security model

Bazaar is built with security as a first-class concern at every layer.

| Threat | Mitigation |
|:---|:---|
| PHP execution in wares | Upload validator rejects `.php`, `.phar`, `.phtml`, `.cgi`, `.py`, `.sh`, and others; `.htaccess` written on install disables the PHP engine as a second layer |
| Unauthenticated file access | All files served through REST — requires `is_user_logged_in()` + `current_user_can($capability)` |
| Path traversal | `..` rejected at route validation and in the callback; `realpath()` confinement ensures the resolved path is inside the ware's directory |
| CSRF | All mutations require a `X-WP-Nonce` via `@wordpress/api-fetch` |
| iframe escaping | `sandbox="allow-scripts allow-forms allow-same-origin allow-popups allow-downloads"` — `allow-top-navigation` and `allow-modals` are intentionally excluded |
| Zip bombs | File count cap (2000 files) + per-file compression ratio check (max 100:1) |
| Storage abuse | Configurable uncompressed size cap (default 50 MB per ware) |
| Outbound network abuse | Zero-trust service worker intercepts all `fetch()` calls from inside a ware and enforces a `permissions.network` allowlist from `manifest.json` |
| Supply chain / tampered wares | Optional RSA signature verification on install (`wp bazaar sign` + `keypair`) |

> **On `allow-same-origin`:** Wares have this sandbox permission so they can make authenticated REST requests to WordPress. This is necessary and intentional — but it means wares are not fully sandboxed from the host origin. Install wares only from sources you trust, the same way you would a WordPress plugin.

---

## Content Security Policy

Each ware has a CSP that is injected into the HTML response by `WareServer`. The policy is managed by `CspPolicy` and can be customised per-ware via:

- The `permissions` block in `manifest.json`
- `wp bazaar csp {slug}` (view / edit from the CLI)
- `PATCH /wp-json/bazaar/v1/csp/{slug}` (REST API)

The default policy blocks inline scripts, restricts `connect-src` to the site origin, and sets `frame-ancestors` to the admin URL. The ware can request relaxations in its manifest; you can also grant them manually post-install.

---

## Contributing and local dev

```bash
git clone https://github.com/RegionallyFamous/bazaar
cd bazaar

composer install   # PHP deps: PHPCS, PHPStan, PHPUnit
npm install        # JS deps: Vite, @wordpress/scripts

npm run build      # compile admin/dist/

composer lint && npm run lint    # lint everything
composer test && npm test        # run all tests

npx wp-env start   # spin up a local WordPress environment
```

### Verification loop

Run these in order after any code change, and fix until all are green:

```bash
composer lint   # phpcs + phpstan
npm run lint    # eslint + stylelint
npm run build   # vite build
composer test   # phpunit (if tests exist)
npm test        # jest (if tests exist)
```
