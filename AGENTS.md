# Bazaar — Agent Guide

> Read this file first. Everything an AI agent needs to build, run, and ship a Bazaar ware is here or linked from here.

---

## What is Bazaar?

Bazaar is a WordPress plugin that lets you ship mini web apps ("wares") directly inside `wp-admin`. Each ware is a sandboxed `<iframe>` — a fully self-contained Vite/React/Vue/Vanilla app bundled into a `.wp` ZIP archive. The Bazaar plugin installs, serves, and manages those archives. `@bazaar/client` is the TypeScript SDK that connects a ware to WordPress APIs.

```
┌─────────────────── wp-admin ────────────────────────┐
│  Bazaar Shell (PHP + admin JS)                       │
│  ┌─────────────────────────────────────────────────┐ │
│  │  <iframe src="/wp-json/bazaar/v1/serve/my-ware"> │ │
│  │  ┌────────────────────────────────────────────┐  │ │
│  │  │  Your Vite app (React / Vue / Vanilla)     │  │ │
│  │  │  ↕  @bazaar/client                         │  │ │
│  │  │  ↕  X-WP-Nonce → WordPress REST API        │  │ │
│  │  └────────────────────────────────────────────┘  │ │
│  └─────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────┘
```

---

## Quickstart — build a ware in 5 steps

```bash
# 1. Scaffold (interactive)
npm create ware@latest my-ware

# OR non-interactive (agent-friendly)
npm create ware@latest my-ware -- --framework react --author "Acme" --description "My ware" --yes

# 2. Install dependencies
cd my-ware && npm install

# 3. Dev server (outside WP)
npm run dev

# 4. Connect to WordPress (in another terminal)
wp bazaar dev start my-ware http://localhost:5173

# 5. Package and install
npm run package                              # outputs my-ware.wp
wp bazaar install ../my-ware.wp
```

---

## `manifest.json` — the only WordPress-specific file

Place it at the **root** of your `.wp` archive. Minimal required fields:

```json
{
  "$schema": "../../manifest.schema.json",
  "name": "My Ware",
  "slug": "my-ware",
  "version": "1.0.0"
}
```

Full example with every field:

```json
{
  "$schema": "../../manifest.schema.json",
  "name": "My Ware",
  "slug": "my-ware",
  "version": "1.0.0",
  "author": "Acme Corp",
  "description": "One punchy sentence describing what this does.",
  "icon": "icon.svg",
  "entry": "index.html",
  "menu": {
    "title": "My Ware",
    "position": 26,
    "capability": "manage_options",
    "parent": null,
    "group": "tools"
  },
  "permissions": ["read:posts", "write:posts"],
  "permissions_network": ["https://api.example.com"],
  "shared": ["react", "react-dom", "react/jsx-runtime"],
  "health_check": "https://api.example.com/health",
  "jobs": [
    {
      "id": "sync_data",
      "label": "Sync data from API",
      "interval": "hourly",
      "endpoint": "/wp-json/bazaar/v1/jobs/my-ware/sync_data"
    }
  ],
  "license": {
    "type": "key",
    "url": "https://example.com/api/validate-license",
    "required": true
  },
  "registry": {
    "updateUrl": "https://registry.example.com/wares/my-ware.json",
    "homepage": "https://example.com/wares/my-ware"
  }
}
```

Valid `permissions` tokens: `read:posts`, `write:posts`, `delete:posts`, `read:users`, `write:users`, `read:options`, `write:options`, `read:media`, `write:media`, `read:comments`, `write:comments`, `moderate:comments`, `manage:plugins`, `manage:themes`, `read:analytics`.

The JSON Schema is at [`manifest.schema.json`](manifest.schema.json) — add a `$schema` reference and your IDE (and any JSON-aware agent) will validate and autocomplete the manifest.

---

## `vite.config.ts` — canonical template

Copy this exactly. The alias map resolves monorepo packages from source so TypeScript and Vite see the same types.

```ts
import { defineConfig } from 'vite';
import react            from '@vitejs/plugin-react';
import { resolve }      from 'path';

export default defineConfig( {
  plugins: [ react() ],
  base: './',
  resolve: {
    alias: {
      '@bazaar/client':       resolve( __dirname, '../../packages/client/src/index.ts' ),
      '@bazaar/client/react': resolve( __dirname, '../../packages/client/src/hooks.ts' ),
      '@bazaar/design/theme': resolve( __dirname, '../../packages/design/src/theme/adminColor.ts' ),
      '@bazaar/design/css':   resolve( __dirname, '../../packages/design/src/css/index.css' ),
      '@bazaar/design':       resolve( __dirname, '../../packages/design/src/index.ts' ),
    },
  },
  build: {
    outDir:      'dist',
    emptyOutDir: true,
    assetsDir:   'assets',
    rollupOptions: {
      // Must match the "shared" array in manifest.json.
      // Shell provides these via import map — do not bundle them.
      external: [ 'react', 'react-dom', 'react/jsx-runtime' ],
    },
  },
  server: { cors: true },
} );
```

---

## `main.tsx` — required boilerplate

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { setBazaarContext } from '@bazaar/client';
import { ErrorBoundary }    from '@bazaar/design';
import '@bazaar/design/css';
import App from './App';

// Dev-only: seed context so @bazaar/client works outside the WP iframe.
// Copy a fresh nonce with: wp eval 'echo wp_create_nonce("wp_rest");'
if ( import.meta.env.DEV ) {
  setBazaarContext( {
    nonce:   import.meta.env.VITE_WP_NONCE    ?? '',
    restUrl: import.meta.env.VITE_WP_REST_URL ?? 'http://localhost/wp-json',
    slug:    'my-ware',
  } );
}

ReactDOM.createRoot( document.getElementById( 'root' )! ).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
```

---

## `@bazaar/client` — the essential API

```ts
import { getBazaarContext, wpJson, wpFetch } from '@bazaar/client';
import { useCurrentUser, useWpPosts, useWpFetch } from '@bazaar/client/react';
import { bzr, onShellRoute }                 from '@bazaar/client/bus';
import { createStore, createWaredStore }     from '@bazaar/client';

// Context (auto-extracted from iframe URL, or seeded via setBazaarContext in dev)
const ctx = getBazaarContext();
// → { nonce, restUrl, serveUrl, slug, adminColor }

// Authenticated REST fetch
const posts = await wpJson<WpPost[]>( '/wp/v2/posts?per_page=5' );

// React hooks
const { user, loading, error } = useCurrentUser();
const { posts, loading }       = useWpPosts( { per_page: 10, status: 'publish' } );
const { data, loading }        = useWpFetch<MyType>( '/bazaar/v1/my-endpoint' );

// Ware-local persistence (server-backed, per-user key-value)
const store = createStore( ctx.slug, ctx );

// Shell event bus
bzr.emit( 'my-ware:event', { payload } );
bzr.on( 'my-ware:event', handler );
onShellRoute( ( path ) => console.log( 'shell navigated to', path ) );
```

Full API reference: [`packages/client/README.md`](packages/client/README.md).

---

## `@bazaar/design` — UI components

```tsx
import {
  Button, Input, Textarea, Select,
  Modal, Badge, Spinner,
  ToastProvider, useToast,
  ErrorBoundary,
} from '@bazaar/design';
import '@bazaar/design/css';   // activates --bw-* token layer

// Use CSS tokens, not hardcoded hex:
// var(--bw-bg), var(--bw-surface), var(--bw-accent), var(--bw-text), var(--bw-border)
```

Tokens reference: [`packages/design/src/css/tokens.css`](packages/design/src/css/tokens.css).
Component props: [`packages/design/src/index.ts`](packages/design/src/index.ts).

---

## Sandbox constraints — things that DO NOT work inside a ware

| Banned | Reason |
|--------|--------|
| `window.parent` / `window.top` | Blocked by iframe sandbox + CSP |
| `window.wp`, `@wordpress/*` packages | Not available in the ware context |
| Google Fonts `@import`, CDN `<link>` | CSP blocks third-party origins |
| `confirm()`, `alert()`, `prompt()` | Blocked in cross-origin sandboxed iframes |
| Outbound fetch to unlisted origins | Blocked by zero-trust service worker unless listed in `permissions_network` |

---

## `localStorage` key convention

```ts
// Pattern: bazaar-{ware-slug}-v{n}
localStorage.setItem( 'bazaar-my-ware-v1', JSON.stringify( state ) );

// Always wrap in try/catch
try {
  const raw = localStorage.getItem( 'bazaar-my-ware-v1' );
  return raw ? JSON.parse( raw ) : defaultState;
} catch {
  return defaultState;
}
```

Bump the `v{n}` suffix whenever the stored shape changes — don't try to migrate old data.

---

## Package script — how to build and ship

```json
{
  "scripts": {
    "dev":     "vite",
    "build":   "tsc -b && vite build",
    "preview": "vite preview",
    "package": "npm run build && cp manifest.json dist/ && cd dist && zip -r ../../my-ware.wp . && echo 'Packaged: my-ware.wp'"
  }
}
```

---

## Verification — definition of done

Run these from inside the ware directory before declaring any task complete:

```bash
npm run build        # must exit 0
tsc --noEmit         # zero TypeScript errors
npm run package      # .wp archive produced
```

---

## WP-CLI reference (key commands)

```bash
wp bazaar install my-ware.wp               # install from .wp file
wp bazaar install my-ware.wp --force       # overwrite existing version
wp bazaar list-wares                       # list installed wares
wp bazaar dev start my-ware http://localhost:5173  # proxy dev server
wp bazaar dev stop my-ware
wp bazaar scaffold endpoint MyEndpoint     # generate PHP REST endpoint stubs
wp bazaar types my-ware                   # emit TypeScript types from manifest
wp bazaar doctor                           # diagnose common issues
```

Full CLI reference: [`docs/WP-CLI.md`](docs/WP-CLI.md).

---

## Cursor rules — what applies where

| File | Applies to | What it governs |
|------|-----------|-----------------|
| `wordpress-core.mdc` | Always | Plugin PHP + admin JS: security, perf, structure, verification loop |
| `quality.mdc` | Always | No linter suppressions, classmap autoload, CSP/zip rules |
| `wares-build-system.mdc` | `wares/**` | Canonical `vite.config.ts`, `package` script, CI, new-ware checklist |
| `wares-react-css.mdc` | `wares/**/*.{ts,tsx,css,json}` | React 19, TypeScript strict, CSS tokens, a11y, sandbox rules |
| `rest-api.mdc` | API/endpoint files | Route registration, permission callbacks, schemas |
| `i18n.mdc` | PHP/JS files (description-triggered) | Text domains, `__()` / `_n()` patterns, JS pipeline |
| `testing.mdc` | Test files | PHPUnit, Vitest, Playwright |

---

## Docs index

| File | Contents |
|------|----------|
| [`docs/Building-a-Ware.md`](docs/Building-a-Ware.md) | Full ware development guide |
| [`docs/Manifest-Reference.md`](docs/Manifest-Reference.md) | Every manifest field explained |
| [`docs/REST-API.md`](docs/REST-API.md) | All 35+ Bazaar REST endpoints |
| [`docs/WP-CLI.md`](docs/WP-CLI.md) | All `wp bazaar` commands |
| [`docs/Architecture.md`](docs/Architecture.md) | Plugin internals, storage, service worker, security |
| [`docs/Recipes.md`](docs/Recipes.md) | Copy-paste code patterns for common ware tasks |
| [`manifest.schema.json`](manifest.schema.json) | JSON Schema for manifest.json (machine-readable) |
| [`packages/client/README.md`](packages/client/README.md) | `@bazaar/client` API reference |
| [`wares/hello/`](wares/hello/) | Minimal reference ware — read this before building your first ware |

---

## Common gotchas

1. **`shared` + `rollupOptions.external` must match.** If you list `react` in `manifest.json` `shared`, you must also list it in `vite.config.ts` `rollupOptions.external`. Mismatch = two React instances = broken hooks.

2. **`$schema` path is relative to the manifest file.** For wares in `wares/my-ware/manifest.json` use `../../manifest.schema.json`. For standalone projects outside the monorepo, point to the published URL: `https://raw.githubusercontent.com/RegionallyFamous/bazaar/main/manifest.schema.json`.

3. **Nonce expires.** The `_wpnonce` injected into the iframe URL is valid for ~12 hours. For long-lived apps, call `refreshNonce()` from `@bazaar/client` periodically or handle 401 responses.

4. **No PHP files in the archive.** Bazaar rejects `.wp` archives containing `.php`, `.phtml`, or `.phar` files. Server-side logic goes in a companion WordPress plugin — scaffold it with `wp bazaar scaffold endpoint MyEndpoint`.

5. **`manifest.json` must be at the archive root.** If you zip from `dist/`, copy `manifest.json` into `dist/` first (the `package` script does this).

6. **`slug` is permanent.** Changing it after install requires deleting and re-installing. Choose carefully.
