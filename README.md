<div align="center">

# Bazaar

**Turn `wp-admin` into an app marketplace.**

![PHP](https://img.shields.io/badge/PHP-8.1%2B-777BB4?style=flat-square&logo=php&logoColor=white)
![WordPress](https://img.shields.io/badge/WordPress-6.6%2B-21759B?style=flat-square&logo=wordpress&logoColor=white)
![License](https://img.shields.io/badge/License-GPL--2.0--or--later-blue?style=flat-square)
![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen?style=flat-square)

Install any HTML/CSS/JS app into WordPress with a single file upload. It shows up in your sidebar. That's it.

```
invoice-generator.wp   →   upload   →   "Invoices" appears in your sidebar
```

*No shortcodes. No page templates. No style conflicts. Just apps.*

</div>

---

## Table of Contents

- [Why This Exists](#why-this-exists)
- [The Name](#the-name)
- [What is a Ware?](#what-is-a-ware)
- [How It Works](#how-it-works)
- [Installation](#installation)
- [Building Your First Ware](#building-your-first-ware)
- [WP-CLI](#wp-cli)
- [Security](#security)
- [REST API](#rest-api)
- [Development](#development)
- [Documentation](#documentation)

---

## Why This Exists

We're living through a genuinely strange and exciting moment in software. AI has changed what it means to write code — the pace of ideas, the speed of prototypes, the sheer *fun* of it. Coding is my full-time job, my obsession, and my hobby all at once, and right now that feels like the best possible thing to be.

The problem I kept running into: every time I had a new idea, I'd spin up a new server. A new domain, a new deploy pipeline, a new VPS — just to run something I wanted to play with. It was friction that didn't need to exist.

WordPress is my digital home. It's where I've lived on the web for years, where my content lives, where I feel at home in the stack. And I started thinking — why isn't this my app platform too? Why am I spinning up infrastructure elsewhere when I've already got a perfectly good authenticated, multi-user, extensible web application sitting right there?

That's where Bazaar came from. Build something cool, package it, drop it into your WordPress admin. No new servers. No new domains. No new deploys. Your WordPress install becomes the platform for everything you're building.

It was born out of the AI moment — the abundance of ideas, the joy of building fast — and the very practical desire to stop managing infrastructure every time inspiration strikes.

---

## The Name

In 1997, Eric S. Raymond wrote *[The Cathedral and the Bazaar](http://www.catb.org/~esr/writings/cathedral-bazaar/)* — one of the most influential essays in software history. He described two models of building software:

> **The Cathedral** — code released on a controlled schedule by a small group, with source guarded closely between releases. Careful, coordinated, monolithic.
>
> **The Bazaar** — code released early and often, developed in the open where *"a great babbling bazaar of differing agendas and approaches"* produces something no single team could plan in advance.

Raymond's insight was that the bazaar model produces *better* software — because *"given enough eyeballs, all bugs are shallow."*

`wp-admin` is a cathedral. Adding real functionality to it means navigating a gauntlet of PHP templates, action hooks, capability checks, and menu registration APIs. The core team controls the architecture and everyone else works around it.

**This plugin is the bazaar.** Build your app however you want, in whatever stack you prefer. Package it. Upload it. It appears in the sidebar. The WordPress admin becomes a platform that anyone can extend with a ZIP file — not just the teams who know every hook and filter by heart.

WordPress itself was built bazaar-style. This plugin brings that spirit back to the admin dashboard.

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

```mermaid
flowchart LR
    subgraph install [Installing a Ware]
        direction TB
        A[Upload .wp file] --> B[Validate ZIP + manifest]
        B --> C[Extract to wp-content/bazaar/slug/]
        C --> D[Register in wp_options]
        D --> E["Menu page appears in sidebar"]
    end

    subgraph load [Loading a Ware]
        direction TB
        F[Click menu item] --> G[WareRenderer outputs iframe]
        G --> H[REST GET /bazaar/v1/serve/slug/index.html]
        H --> I{Auth check}
        I -->|pass| J[Serve file with MIME type]
        J --> K[SPA renders in iframe]
    end
```

Wares are stored in `wp-content/bazaar/` (outside the plugin directory, so they survive plugin updates). All files are served through an authenticated REST endpoint — no direct filesystem access.

---

## Installation

> [!NOTE]
> **Requirements:** PHP 8.1+, WordPress 6.6+

- [ ] Download the latest release zip
- [ ] Upload via **Plugins → Add New → Upload Plugin**
- [ ] Activate the plugin
- [ ] A **Bazaar** item appears at the top of your admin sidebar

**Or via WP-CLI:**

```bash
wp plugin install bazaar --activate
```

---

## Building Your First Ware

### 1. Build your app

Use any framework or none at all. Build it like any static web app.

```bash
# React + Vite example
npm create vite@latest my-ware -- --template react
cd my-ware && npm install && npm run build
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
zip -r ../invoice-generator.wp .
```

Or add a `package` script to your `package.json`:

```json
{
  "scripts": {
    "package": "npm run build && cd build && zip -r ../invoice-generator.wp ."
  }
}
```

### 4. Upload

Go to **Bazaar** in your WordPress sidebar → drag and drop your `.wp` file → done.

> [!TIP]
> See [Building a Ware](docs/Building-a-Ware.md) for the full guide including React, Vue, Svelte recipes and how to call the WordPress REST API from inside your ware.

---

## WP-CLI

Bazaar ships with a full WP-CLI command suite:

```bash
wp bazaar list                                  # list all wares
wp bazaar install invoice-generator.wp          # install from a file
wp bazaar install invoice-generator.wp --force  # upgrade an existing ware
wp bazaar enable  invoice-generator             # enable a ware
wp bazaar disable invoice-generator             # disable a ware
wp bazaar delete  invoice-generator             # delete ware + files
wp bazaar info    invoice-generator             # show ware metadata
```

See [docs/WP-CLI.md](docs/WP-CLI.md) for the full reference and scripting patterns.

---

## Security

Bazaar is built with security as a first-class concern:

| Threat | Mitigation |
|:---|:---|
| PHP execution in wares | Upload validator rejects `.php`, `.phar`, `.phtml`; `.htaccess` disables PHP engine as second layer |
| Unauthenticated file access | All ware files served through `GET /bazaar/v1/serve/` — requires login + capability |
| Path traversal | `realpath()` confinement; `..` in file paths rejected at route level |
| CSRF | `X-WP-Nonce` on all mutations via `@wordpress/api-fetch` |
| iframe escaping | `sandbox="allow-scripts allow-forms allow-same-origin allow-popups"` |
| Storage abuse | Configurable uncompressed size cap (default 50 MB per ware) |

> [!WARNING]
> Wares have `allow-same-origin` in the sandbox so they can make authenticated REST requests to WordPress. This is intentional and necessary — but it means you should only install wares from sources you trust, the same way you would a plugin.

---

## REST API

All ware management goes through REST — no `admin-ajax.php`.

| Method | Endpoint | Auth | Description |
|:---:|:---|:---|:---|
| `GET` | `/wp-json/bazaar/v1/serve/{slug}/{file}` | login + ware capability | Serve a ware file |
| `POST` | `/wp-json/bazaar/v1/wares` | `manage_options` | Upload a `.wp` file |
| `PATCH` | `/wp-json/bazaar/v1/wares/{slug}` | `manage_options` | Enable or disable a ware |
| `DELETE` | `/wp-json/bazaar/v1/wares/{slug}` | `manage_options` | Delete a ware |

See [docs/REST-API.md](docs/REST-API.md) for the full endpoint reference including request/response shapes and error codes.

---

## Development

```bash
git clone https://github.com/nickhblair/bazaar
cd bazaar

composer install   # PHP deps: PHPCS, PHPStan, PHPUnit
npm install        # JS deps: Vite, @wordpress/scripts
npm run build      # compile admin/dist/

composer lint && npm run lint   # lint everything
composer test && npm test       # run tests

npx wp-env start   # local WP environment
```

<details>
<summary><strong>Project structure</strong></summary>

```
bazaar/
├── bazaar.php                  ← Plugin bootstrap
├── src/
│   ├── Plugin.php              ← Hook registration
│   ├── WareRegistry.php        ← Ware metadata (wp_options)
│   ├── WareLoader.php          ← ZIP validation + WP_Filesystem extraction
│   ├── WareRenderer.php        ← iframe output
│   ├── MenuManager.php         ← Dynamic admin menus
│   ├── BazaarPage.php          ← The Bazaar admin page
│   ├── CLI/
│   │   └── BazaarCommand.php   ← WP-CLI commands
│   └── REST/
│       ├── WareServer.php      ← Authenticated static file server
│       ├── UploadController.php← Upload handler
│       └── WareController.php  ← Toggle + delete
├── admin/src/                  ← Vite source (JS + CSS)
├── templates/                  ← PHP templates
├── tests/                      ← PHPUnit + Jest
└── docs/                       ← Developer documentation
```

</details>

---

## Documentation

| Doc | Description |
|:---|:---|
| [Building a Ware](docs/Building-a-Ware.md) | Complete guide to developing `.wp` apps — vanilla JS, React, Vue, Svelte, and WordPress REST auth patterns |
| [Manifest Reference](docs/Manifest-Reference.md) | Every `manifest.json` field documented with types, defaults, and menu position cheat sheet |
| [REST API](docs/REST-API.md) | Endpoint reference, error codes, and patterns for ware-to-WordPress communication |
| [WP-CLI](docs/WP-CLI.md) | CLI command reference with scripting recipes and multi-site patterns |
| [WordPress Shell](docs/WordPress-Shell.md) | WP-CLI power guide: `wp shell`, PsySH, `wp eval`, automation, must-have packages |

---

<div align="center">

GPL-2.0-or-later &nbsp;·&nbsp; Built on the shoulders of [The Cathedral and the Bazaar](http://www.catb.org/~esr/writings/cathedral-bazaar/)

</div>
