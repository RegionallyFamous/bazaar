# Bazaar Wiki

Welcome to the Bazaar developer documentation. Bazaar is a WordPress plugin that turns `wp-admin` into an app platform — upload any web app as a `.wp` file and it appears as a full-screen menu page in the sidebar.

## Pages

| Page | What's inside |
|:---|:---|
| [Building a Ware](Building-a-Ware) | Complete development guide — vanilla JS, React, Vue, Svelte, shared libraries, WordPress REST patterns |
| [Manifest Reference](Manifest-Reference) | Every `manifest.json` field with types, defaults, and validation rules |
| [REST API](REST-API) | All 35+ endpoints — request/response shapes, auth requirements, error codes |
| [WP-CLI](WP-CLI) | Full CLI command reference with lifecycle, dev mode, signing, and scripting recipes |
| [WordPress Shell](WordPress-Shell) | `wp shell`, PsySH, `wp eval`, and admin automation patterns |
| [Architecture](Architecture) | Plugin structure, storage model, security design, shared library system, and service worker |
| [10-pass audit todos](10-pass-audit-todos) | Checklist of security, perf, types, a11y, and test work from the codebase audit |

---

## Quick orientation

### What is a ware?

A **ware** is a `.wp` file — a renamed ZIP archive containing a self-contained web app and a `manifest.json`. Bazaar extracts it, registers it, and renders it as a full-screen sandboxed `<iframe>` inside `wp-admin`.

```
my-ware.wp
├── manifest.json    ← REQUIRED — name, slug, menu config, permissions
├── index.html       ← REQUIRED — app entry point
├── icon.svg         ← optional sidebar icon
└── assets/
    ├── app.js
    └── app.css
```

### The 60-second start

```bash
# Scaffold a new ware with the interactive CLI
npm create ware@latest
```

Or manually:

```json
{
  "name": "Hello Ware",
  "slug": "hello-ware",
  "version": "1.0.0",
  "entry": "index.html",
  "menu": { "title": "Hello", "position": 99 }
}
```

```bash
zip hello-ware.wp manifest.json index.html
# Upload in Bazaar → "Hello" appears in wp-admin
```

### Key concepts

**Isolation** — each ware runs in a sandboxed `<iframe>`. Your app owns the full viewport inside it. No CSS bleed from wp-admin, no JavaScript collisions with other plugins.

**Same-origin auth** — wares are served on the same origin as WordPress, so `fetch()` calls to the REST API work with a simple `X-WP-Nonce` header. No CORS, no external auth service.

**Shared libraries** — React and Vue are hosted once by the shell and shared across all ware iframes via `<importmap>`. A universal service worker caches every asset after the first load. Wares opt in by declaring `"shared": ["react", "react-dom", "react/jsx-runtime"]` in their manifest and marking those packages as Rollup externals.

**Zero-trust network** — the service worker intercepts every `fetch()` from inside a ware and enforces a `permissions.network` allowlist declared in `manifest.json`. Wares cannot make arbitrary outbound requests unless explicitly permitted.

---

## Contributing

See [CONTRIBUTING.md](https://github.com/RegionallyFamous/bazaar/blob/main/CONTRIBUTING.md) in the main repo.
