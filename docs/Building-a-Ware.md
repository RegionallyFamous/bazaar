# Building a Ware

A **ware** is any web app packaged as a `.wp` file (a renamed ZIP archive) with a `manifest.json`. Once uploaded to Bazaar, it appears as a full-screen menu page in `wp-admin` — completely isolated from WordPress's own styles and scripts.

This guide walks you through building one from scratch.

---

## The Mental Model

Your ware is just a website. It runs in a sandboxed `<iframe>` inside `wp-admin`. You have full control over the HTML, CSS, and JS — there's nothing WordPress-specific about your app at all. The only WordPress knowledge you need is writing the `manifest.json`.

```
Your app  →  manifest.json  →  .wp file  →  Bazaar upload  →  sidebar page
```

---

## Anatomy of a Ware

```
my-ware.wp            ← renamed .zip
├── manifest.json     ← REQUIRED: ware metadata
├── index.html        ← REQUIRED: entry point (or whatever entry= points to)
├── icon.svg          ← optional sidebar icon (20×20 recommended)
└── assets/
    ├── app.js
    ├── app.css
    └── logo.png
```

The ZIP must contain `manifest.json` at the **root level** (not inside a subdirectory). The entry HTML file must also be at the root or referenced by a path in `manifest.json`.

---

## Quickstart: Vanilla JS Ware

The fastest possible ware — no build step required.

**1. Create `manifest.json`:**

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

**2. Create `index.html`:**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Hello Ware</title>
  <style>
    body { font-family: system-ui; display: flex; align-items: center;
           justify-content: center; height: 100vh; margin: 0; }
    h1 { color: #2271b1; }
  </style>
</head>
<body>
  <h1>Hello from Bazaar!</h1>
</body>
</html>
```

**3. Package it:**

```bash
zip -r hello-ware.wp manifest.json index.html
```

**4. Upload** it in the Bazaar admin page. Done — "Hello" appears in your sidebar.

---

## Building with a Framework

Wares work with any framework that produces static output.

### React (Create React App / Vite)

```bash
# Create app
npm create vite@latest my-ware -- --template react
cd my-ware
npm install
npm run build

# Add manifest to the build output
cp manifest.json dist/

# Package
cd dist && zip -r ../../my-ware.wp . && cd ../..
```

### Vue

```bash
npm create vue@latest my-ware
cd my-ware && npm install && npm run build
cp manifest.json dist/
cd dist && zip -r ../../my-ware.wp . && cd ../..
```

### Svelte / SvelteKit (static adapter)

```bash
npx sv create my-ware
cd my-ware && npm install && npm run build
cp manifest.json build/
cd build && zip -r ../../my-ware.wp . && cd ../..
```

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

Then just run:

```bash
npm run package
```

---

## Communicating with WordPress

Your ware runs in a sandboxed iframe on the same origin as WordPress (served via the Bazaar REST endpoint). That means you can make authenticated requests to the WordPress REST API.

### Getting the Nonce

The iframe `src` URL already includes a `_wpnonce` query parameter, but for fetch requests you need the nonce in a header. The cleanest approach is to pass it through your `index.html` via a meta tag or a small inline script that you inject at build time, or store it in `localStorage` from a parent-frame postMessage.

The simplest pattern — read the nonce from the URL:

```js
const params = new URLSearchParams( window.location.search );
const nonce  = params.get( '_wpnonce' );

const response = await fetch( '/wp-json/wp/v2/posts', {
  headers: {
    'X-WP-Nonce': nonce,
  },
} );
```

### Posting Data Back to WordPress

```js
const response = await fetch( '/wp-json/wp/v2/posts', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-WP-Nonce': nonce,
  },
  body: JSON.stringify({
    title: 'My Post',
    status: 'publish',
  }),
} );
```

### Determining the WordPress REST Base URL

Don't hardcode `/wp-json/`. The REST base can change. Instead, read it from `window.location`:

```js
const restBase = window.location.origin + '/wp-json';
```

Or if the WordPress install is in a subdirectory, extract it from the iframe URL:

```js
// The iframe src is: /wp-json/bazaar/v1/serve/my-ware/index.html
// Strip the bazaar path prefix to get the WP root
const wpRoot = window.location.href.split( '/wp-json/' )[ 0 ];
const restBase = wpRoot + '/wp-json';
```

---

## iframe Sandbox Capabilities

Bazaar renders wares with this sandbox policy:

```html
sandbox="allow-scripts allow-forms allow-same-origin allow-popups allow-downloads"
```

| Permission | What It Allows |
|---|---|
| `allow-scripts` | Run JavaScript |
| `allow-forms` | Submit forms |
| `allow-same-origin` | Make authenticated fetch requests to WordPress |
| `allow-popups` | Open new windows/tabs |
| `allow-downloads` | Trigger file downloads |

**Not allowed** (intentional): `allow-top-navigation` (wares can't redirect the whole page), `allow-modals` (no `alert()`/`confirm()`).

---

## Updating a Ware

To update an installed ware, use the `--force` flag with WP-CLI:

```bash
wp bazaar install my-ware-v2.wp --force
```

Or from the admin UI: delete the old ware and upload the new one. (A GUI update flow is on the roadmap.)

---

## Debugging Tips

- Open your browser's DevTools. The ware iframe is inspectable — you can set breakpoints, inspect network requests, and view console output normally.
- The REST file-serving endpoint returns standard HTTP status codes. A 403 means the user lacks the required capability; 404 means the file path is wrong.
- Run `wp bazaar info <slug>` to inspect what Bazaar has stored for your ware.
- Use `SCRIPT_DEBUG=true` in your WordPress config to disable asset caching.

---

## Next Steps

- [Manifest Reference](Manifest-Reference.md) — every field explained
- [REST API](REST-API.md) — how wares communicate with WordPress
- [WP-CLI](WP-CLI.md) — install and manage wares from the terminal
