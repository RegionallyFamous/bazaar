# Bazaar

**Turn `wp-admin` into an app marketplace.**

Install any HTML/CSS/JS app into WordPress with a single file upload. It shows up in your sidebar. That's it.

```
invoice-generator.wp   →   upload   →   "Invoices" appears in your sidebar
```

No shortcodes. No page templates. No style conflicts. Just apps.

---

## What is a Ware?

A **ware** is a `.wp` file — a renamed ZIP archive containing a self-contained web app and a `manifest.json`. Think `.apk` for Android, but for WordPress.

```
invoice-generator.wp
├── manifest.json      ← name, slug, menu placement
├── icon.svg           ← sidebar icon
├── index.html         ← your app's entry point
└── assets/
    ├── app.js
    └── app.css
```

Build your app in React, Vue, Svelte, vanilla JS — anything that compiles to HTML/CSS/JS. Add a manifest. ZIP it. Rename it `.wp`. Upload it. Done.

---

## How It Works

Each ware gets its own **full-screen sandboxed iframe** as a WordPress admin page. Your app renders exactly as it would standalone — zero style bleed from wp-admin, zero JavaScript conflicts.

```
User clicks "Invoices" in the sidebar
  → WordPress loads the menu page callback
  → Bazaar renders a full-bleed iframe
  → iframe src → authenticated REST endpoint
  → Ware Server checks login + capability
  → Serves index.html → your app renders
```

Wares are stored in `wp-content/bazaar/` (outside the plugin directory, so they survive plugin updates). All files are served through an authenticated REST endpoint — no direct filesystem access.

---

## Installation

**Requirements:** PHP 8.1+, WordPress 6.6+

1. Download the latest release zip
2. Upload to **Plugins → Add New → Upload Plugin**
3. Activate
4. A **Bazaar** item appears at the top of your admin sidebar

Or via WP-CLI:

```bash
wp plugin install bazaar --activate
```

---

## Building Your First Ware

### 1. Build your app

Use any framework or none at all. Build it like any static web app.

```bash
# React example
npx create-react-app my-ware
cd my-ware
npm run build
```

### 2. Add a manifest

Create `manifest.json` at the root of your build output:

```json
{
  "name": "Invoice Generator",
  "slug": "invoice-generator",
  "version": "1.0.0",
  "author": "Your Name",
  "description": "Generate and manage invoices from wp-admin.",
  "icon": "icon.svg",
  "entry": "index.html",
  "menu": {
    "title": "Invoices",
    "position": 30,
    "capability": "manage_options"
  }
}
```

### 3. Package it

```bash
cd build/
zip -r ../invoice-generator.zip .
mv ../invoice-generator.zip ../invoice-generator.wp
```

Or add this to your `package.json`:

```json
{
  "scripts": {
    "package": "npm run build && cd build && zip -r ../invoice-generator.wp ."
  }
}
```

### 4. Upload

Go to **Bazaar** in your WordPress sidebar → drag and drop your `.wp` file → done.

---

## WP-CLI

Bazaar ships with a full WP-CLI command suite:

```bash
# List all installed wares
wp bazaar list

# Install a ware from a .wp file
wp bazaar install invoice-generator.wp

# Enable or disable a ware
wp bazaar enable invoice-generator
wp bazaar disable invoice-generator

# Delete a ware and its files
wp bazaar delete invoice-generator

# Show details for a single ware
wp bazaar info invoice-generator
```

See [docs/WP-CLI.md](docs/WP-CLI.md) for the full reference and scripting patterns.

---

## Security

Bazaar is built with security as a first-class concern:

| Threat | Mitigation |
|---|---|
| PHP execution in wares | Upload validator rejects `.php`, `.phar`, `.phtml`; `.htaccess` disables PHP engine |
| Unauthenticated file access | All ware files served through `GET /bazaar/v1/serve/` — requires login + capability |
| Path traversal | `realpath()` confinement; `..` in file paths rejected at route level |
| CSRF | `X-WP-Nonce` on all mutations via `@wordpress/api-fetch` |
| iframe escaping | `sandbox="allow-scripts allow-forms allow-same-origin allow-popups"` |
| Storage abuse | Configurable uncompressed size cap (default 50 MB) |

---

## REST API

All ware management goes through REST — no `admin-ajax.php`.

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/wp-json/bazaar/v1/serve/{slug}/{file}` | Serve a ware file (auth required) |
| `POST` | `/wp-json/bazaar/v1/wares` | Upload a `.wp` file |
| `PATCH` | `/wp-json/bazaar/v1/wares/{slug}` | Enable or disable a ware |
| `DELETE` | `/wp-json/bazaar/v1/wares/{slug}` | Delete a ware |

---

## Development

```bash
git clone https://github.com/nickhblair/bazaar
cd bazaar

# PHP dependencies (PHPCS, PHPStan, PHPUnit)
composer install

# JS dependencies (Vite, @wordpress/scripts)
npm install

# Build admin UI
npm run build

# Lint everything
composer lint && npm run lint

# Run tests
composer test && npm test

# Local WordPress environment (requires @wordpress/env)
npx wp-env start
```

### Project Structure

```
bazaar/
├── bazaar.php              ← Plugin bootstrap
├── src/
│   ├── Plugin.php          ← Hook registration
│   ├── WareRegistry.php    ← Ware metadata (wp_options)
│   ├── WareLoader.php      ← ZIP validation + extraction
│   ├── WareRenderer.php    ← iframe output
│   ├── MenuManager.php     ← Dynamic admin menus
│   ├── BazaarPage.php      ← The Bazaar admin page
│   ├── CLI/
│   │   └── BazaarCommand.php  ← WP-CLI commands
│   └── REST/
│       ├── WareServer.php       ← Static file server
│       ├── UploadController.php ← Upload handler
│       └── WareController.php   ← Toggle + delete
├── admin/src/              ← Vite source (JS + CSS)
├── templates/              ← PHP templates
├── tests/                  ← PHPUnit + Jest
└── docs/                   ← Developer documentation
```

---

## Documentation

| Doc | Description |
|---|---|
| [Building a Ware](docs/Building-a-Ware.md) | Complete guide to developing .wp apps |
| [Manifest Reference](docs/Manifest-Reference.md) | Every manifest.json field documented |
| [REST API](docs/REST-API.md) | Endpoint reference for ware-to-WordPress communication |
| [WP-CLI](docs/WP-CLI.md) | CLI commands + scripting patterns |
| [WordPress Shell](docs/WordPress-Shell.md) | WP-CLI power tips for Bazaar developers |

---

## License

GPL-2.0-or-later. See [LICENSE](LICENSE).
