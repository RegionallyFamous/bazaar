# Building a Ware

A **ware** is any web app packaged as a `.wp` file (a renamed ZIP archive) with a `manifest.json`. Once uploaded to Bazaar, it appears as a full-screen menu page in `wp-admin` — completely isolated from WordPress's own styles and scripts.

---

## Table of Contents

- [The Mental Model](#the-mental-model)
- [Anatomy of a Ware](#anatomy-of-a-ware)
- [Quickstart: Vanilla JS](#quickstart-vanilla-js)
- [Building with a Framework](#building-with-a-framework)
- [Shared Libraries](#shared-libraries)
- [Communicating with WordPress](#communicating-with-wordpress)
- [Using @bazaar/client](#using-bazaarclient)
- [iframe Sandbox Capabilities](#iframe-sandbox-capabilities)
- [Updating a Ware](#updating-a-ware)
- [Debugging Tips](#debugging-tips)

---

## The Mental Model

Bazaar makes the admin a platform where anyone can contribute an app without understanding WordPress internals.

**Your ware is just a website.** It runs in a sandboxed `<iframe>` inside `wp-admin`. You have full control over HTML, CSS, and JS. The only WordPress knowledge you need is writing `manifest.json`.

```mermaid
flowchart LR
    A["Your app\n(React, Vue, vanilla…)"] --> B["manifest.json"]
    B --> C[".wp file\n(renamed ZIP)"]
    C --> D["Bazaar upload"]
    D --> E["Sidebar menu page"]
```

---

## Anatomy of a Ware

```
my-ware.wp                ← renamed .zip
├── manifest.json         ← REQUIRED — ware metadata
├── index.html            ← REQUIRED — entry point
├── icon.svg              ← optional sidebar icon (20×20 recommended)
└── assets/
    ├── app.js
    ├── app.css
    └── logo.png
```

> [!IMPORTANT]
> `manifest.json` must exist at the **root level** of the ZIP — not inside a subdirectory. The same applies to the entry HTML file unless you set a path in `manifest.json`.

---

## Quickstart: Vanilla JS

The fastest possible ware — no build step, no dependencies, no tooling.

**1. `manifest.json`**

```json
{
  "name": "Hello Ware",
  "slug": "hello-ware",
  "version": "1.0.0",
  "author": "Your Name",
  "entry": "index.html",
  "menu": {
    "title": "Hello",
    "position": 99
  }
}
```

**2. `index.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Hello Ware</title>
  <style>
    body {
      font-family: system-ui;
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100vh;
      margin: 0;
    }
    h1 { color: #2271b1; }
  </style>
</head>
<body>
  <h1>Hello from Bazaar!</h1>
</body>
</html>
```

**3. Package and upload**

```bash
zip hello-ware.wp manifest.json index.html
# Upload in the Bazaar admin page
```

**"Hello" now appears in your sidebar.** That's the entire workflow.

---

## Building with a Framework

Wares work with any framework that produces static output.

> [!TIP]
> The fastest way to start is `npm create ware@latest` — it scaffolds a complete project with the right Vite config, `manifest.json`, and a `package` script that outputs a `.wp` file. The React and Vue scaffolds include shared library optimisation out of the box (see [Shared Libraries](#shared-libraries) below).

<details>
<summary><strong>React (Vite) — recommended approach</strong></summary>

Use the Bazaar scaffold for the best out-of-the-box experience:

```bash
npm create ware@latest   # choose React when prompted
```

Or manually with shared-library support:

```bash
npm create vite@latest my-ware -- --template react
cd my-ware && npm install
```

`manifest.json`:
```json
{
  "name": "My Ware",
  "slug": "my-ware",
  "version": "1.0.0",
  "entry": "index.html",
  "menu": { "title": "My Ware" },
  "shared": ["react", "react-dom", "react/jsx-runtime"]
}
```

`vite.config.ts`:
```ts
build: {
  rollupOptions: {
    external: ['react', 'react-dom', 'react/jsx-runtime'],
  },
},
```

```bash
npm run build
cp manifest.json dist/
cd dist && zip -r ../../my-ware.wp . && cd ../..
```

</details>

<details>
<summary><strong>Vue — recommended approach</strong></summary>

```bash
npm create ware@latest   # choose Vue when prompted
```

Or manually with shared-library support:

```bash
npm create vue@latest my-ware
cd my-ware && npm install
```

`manifest.json`:
```json
{
  "name": "My Ware",
  "slug": "my-ware",
  "version": "1.0.0",
  "entry": "index.html",
  "menu": { "title": "My Ware" },
  "shared": ["vue"]
}
```

`vite.config.ts`:
```ts
build: {
  rollupOptions: {
    external: ['vue'],
  },
},
```

```bash
npm run build
cp manifest.json dist/
cd dist && zip -r ../../my-ware.wp . && cd ../..
```

</details>

<details>
<summary><strong>Svelte / SvelteKit (static adapter)</strong></summary>

```bash
npx sv create my-ware
cd my-ware && npm install && npm run build
cp manifest.json build/
cd build && zip -r ../../my-ware.wp . && cd ../..
```

Svelte compiles to vanilla JS so no shared library declaration is needed.

</details>

---

## Shared Libraries

When multiple wares use the same framework (React, Vue), each iframe would normally download and parse its own copy. Bazaar solves this with a two-layer approach:

**Layer 1 — Import Maps:** The shell hosts versioned, content-hashed bundles of React and Vue. Wares that declare `"shared": ["react", "react-dom"]` in their `manifest.json` have an `<importmap>` injected into their HTML, pointing those package names at the shared URLs. The browser downloads React once; every subsequent ware iframe loads the already-compiled bytecode from the V8 cache.

**Layer 2 — Service Worker Cache:** All ware assets under `wp-content/bazaar/` (and the shared bundles themselves) are cached by the Bazaar service worker after the first fetch. On subsequent page loads, nothing hits the network — not even a conditional request.

**Result:**

| Scenario | Without shared libs | With shared libs |
|:---|:---|:---|
| 3 React wares, first load | 3 × ~140 KB download + parse | 1 × ~140 KB download + cached bytecode |
| Any ware, repeat visit | ETag round-trip per asset | 0 network requests (SW cache) |

Opt in by adding `"shared"` to your `manifest.json` and marking the packages as `external` in your Vite config. The `create-ware` React and Vue scaffolds do both automatically.

---

### Add a `package` script

Save yourself the manual steps by adding a `package` script to your `package.json`:

```json
{
  "scripts": {
    "build": "vite build",
    "package": "npm run build && cp manifest.json dist/ && cd dist && zip -r ../../$(node -p \"require('../manifest.json').slug\").wp . && cd .."
  }
}
```

```bash
npm run package   # builds + zips in one step
```

---

## Communicating with WordPress

Your ware runs in a sandboxed iframe on the **same origin** as WordPress (served via the Bazaar REST endpoint). That means you can make authenticated requests to any WordPress REST API endpoint.

### Getting the nonce

The iframe `src` URL includes a `_wpnonce` query parameter. Read it from the URL:

```js
const nonce = new URLSearchParams( window.location.search ).get( '_wpnonce' );
```

### Querying WordPress data

```js
const nonce = new URLSearchParams( window.location.search ).get( '_wpnonce' );

// Fetch posts
const posts = await fetch( '/wp-json/wp/v2/posts', {
  headers: { 'X-WP-Nonce': nonce },
} ).then( r => r.json() );

// Get current user
const me = await fetch( '/wp-json/wp/v2/users/me', {
  headers: { 'X-WP-Nonce': nonce },
} ).then( r => r.json() );
```

### Writing data back to WordPress

```js
await fetch( '/wp-json/wp/v2/posts', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-WP-Nonce': nonce,
  },
  body: JSON.stringify({ title: 'My Post', status: 'publish' }),
} );
```

### Finding the REST base URL

> [!TIP]
> Don't hardcode `/wp-json/`. WordPress can be installed in a subdirectory. Extract the base URL from the iframe's `src` instead:

```js
// The iframe src is: https://example.com/wp-json/bazaar/v1/serve/my-ware/index.html
const wpRoot  = window.location.href.split( '/wp-json/' )[ 0 ];
const restBase = wpRoot + '/wp-json';
```

---

## iframe Sandbox Capabilities

Bazaar applies one of three sandbox policies depending on the ware's trust level:

**`standard` (default)**
```html
sandbox="allow-scripts allow-forms allow-same-origin allow-popups allow-downloads"
```

**`trusted`** — adds `allow-modals` (permits `alert()` / `confirm()`)
```html
sandbox="allow-scripts allow-forms allow-same-origin allow-popups allow-downloads allow-modals"
```

**`verified`** — adds `allow-modals` and `allow-popups-to-escape-sandbox`
```html
sandbox="allow-scripts allow-forms allow-same-origin allow-popups allow-downloads allow-popups-to-escape-sandbox allow-modals"
```

| Permission | What It Enables |
|:---|:---|
| `allow-scripts` | Run JavaScript |
| `allow-forms` | Submit HTML forms |
| `allow-same-origin` | Make authenticated `fetch` requests to WordPress |
| `allow-popups` | Open links in new tabs |
| `allow-downloads` | Trigger file downloads |
| `allow-modals` | `alert()` / `confirm()` (trusted and verified only) |
| `allow-popups-to-escape-sandbox` | Links that open a full page context (verified only) |

The trust level is set by the admin and stored in the ware registry, not declared in the manifest. `allow-top-navigation` is excluded at all trust levels. Wares cannot redirect the parent page.

---

## Updating a Ware

To upgrade an installed ware, use the `--force` flag:

```bash
wp bazaar install my-ware-v2.wp --force
```

Or from the admin UI: delete the old ware, then upload the new one.

> [!NOTE]
> A GUI update flow with version comparison is on the roadmap.

---

## Debugging Tips

- **DevTools work normally.** The ware iframe is fully inspectable — set breakpoints, inspect network requests, and read console output as you would any web app.
- **HTTP status codes are meaningful.** `401` = not logged in. `403` = insufficient capability or ware is disabled. `404` = file path wrong.
- **Inspect the registry** with `wp bazaar info <slug>` to see exactly what Bazaar has stored.
- **Disable asset caching** in development by setting `SCRIPT_DEBUG=true` and `WP_DEBUG=true` in `wp-config.php` (or use `.wp-env.json`).
- **Tail the debug log** with `wp eval 'echo WP_CONTENT_DIR;'` to find the path, then `tail -f <path>/debug.log`.

---

## Using @bazaar/client

`@bazaar/client` is a TypeScript library that handles WordPress plumbing so you can focus on your app.

```bash
npm install @bazaar/client
```

**Framework-agnostic core:**

```ts
import { getBazaarContext, wpJson } from '@bazaar/client';

const ctx = getBazaarContext();
// { nonce, restUrl, serveUrl, slug, adminColor }

// Authenticated fetch — nonce added automatically
const posts = await wpJson('/wp/v2/posts?per_page=5');
```

**React hooks:**

```tsx
import { useCurrentUser, useWpPosts } from '@bazaar/client/react';

function App() {
  const { user, loading: userLoading } = useCurrentUser();
  const { posts, loading } = useWpPosts({ per_page: 10 });

  if (loading || userLoading) return <p>Loading…</p>;
  return <div>{posts.map(p => <h2 key={p.id}>{p.title.rendered}</h2>)}</div>;
}
```

See the [`packages/client` README](https://github.com/RegionallyFamous/bazaar/blob/main/packages/client/README.md) for the full API reference.

---

## Next Steps

- [Manifest Reference](Manifest-Reference) — every `manifest.json` field explained
- [REST API](REST-API) — full endpoint docs and ware-to-WordPress patterns
- [WP-CLI](WP-CLI) — install and manage wares from the terminal
- [Architecture](Architecture) — how shared libraries and the service worker cache work
