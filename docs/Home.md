# Bazaar — Developer Docs

Welcome to the Bazaar technical documentation. This is where the how lives. If you haven't read the [README](https://github.com/RegionallyFamous/bazaar#readme) yet, start there — it explains what Bazaar is and why it exists.

---

## Pages

| Page | What's inside |
|:---|:---|
| [Building a Ware](Building-a-Ware) | Complete development guide — vanilla JS, React, Vue, Svelte, shared libraries, WordPress REST patterns |
| [Manifest Reference](Manifest-Reference) | Every `manifest.json` field with types, defaults, and validation rules |
| [REST API](REST-API) | All endpoints — request/response shapes, auth requirements, error codes |
| [WP-CLI](WP-CLI) | Full CLI command reference with lifecycle, dev mode, signing, and scripting recipes |
| [WordPress Shell](WordPress-Shell) | `wp shell`, PsySH, `wp eval`, and admin automation patterns |
| [Architecture](Architecture) | Plugin structure, storage model, security design, shared library system, and service worker |

---

## What is a ware?

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

Build your app in React, Vue, Svelte, vanilla JS — anything that compiles to HTML/CSS/JS. Add a manifest. ZIP it. Rename to `.wp`. Upload it.

The minimal `manifest.json`:

```json
{
  "name": "Hello Ware",
  "slug": "hello-ware",
  "version": "1.0.0",
  "entry": "index.html",
  "menu": { "title": "Hello", "position": 99 }
}
```

---

## The 60-second start

**Option A — scaffold with the CLI (recommended):**

```bash
npm create ware@latest
```

The CLI asks for a name and stack (vanilla TS, React, or Vue), then generates a ready-to-go project with `manifest.json`, Vite config, and a `package` script that outputs a `.wp` file.

**Option B — do it manually:**

```bash
# Create manifest.json and index.html, then:
zip hello-ware.wp manifest.json index.html
# Upload in Bazaar → "Hello" appears in your wp-admin sidebar
```

See [Building a Ware](Building-a-Ware) for the complete guide.

---

## Key concepts

### Isolation

Each ware runs in a sandboxed `<iframe>`. Your app owns the full viewport inside it. No CSS bleed from wp-admin, no JavaScript collisions with other plugins or wares. Write your styles as if your app owns the whole page — because inside the iframe, it does.

### Same-origin auth

Wares are served on the same origin as WordPress. That means every `fetch()` call can carry a `X-WP-Nonce` header and talk directly to any WordPress REST API endpoint — posts, users, custom endpoints, anything. No CORS configuration. No external auth service. WordPress's existing permission system is your backend.

### Shared libraries

React and Vue are hosted once by the shell and shared across all ware iframes via `<importmap>`. A universal service worker caches every asset after the first load — on repeat visits, nothing hits the network. Wares opt in by declaring shared packages in their manifest and marking them as Rollup externals.

### Zero-trust network

The service worker intercepts every `fetch()` from inside a ware and enforces a `permissions.network` allowlist declared in `manifest.json`. Wares cannot make arbitrary outbound requests unless explicitly permitted. This keeps wares isolated from each other and from the outside web unless you specifically open a door.

### The `@bazaar/client` library

Bazaar ships a TypeScript client library — `@bazaar/client` — that gives your ware typed access to the WordPress REST API, a key-value store, event bus, and more without needing to wire up auth manually. Install it as a dev dependency and import what you need. See [Building a Ware](Building-a-Ware) for usage examples.

---

## Contributing

See [CONTRIBUTING.md](https://github.com/RegionallyFamous/bazaar/blob/main/CONTRIBUTING.md) in the main repo.
