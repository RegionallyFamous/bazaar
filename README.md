<div align="center">

# Bazaar

**Turn `wp-admin` into an app platform.**

![PHP](https://img.shields.io/badge/PHP-8.2%2B-777BB4?style=flat-square&logo=php&logoColor=white)
![WordPress](https://img.shields.io/badge/WordPress-6.6%2B-21759B?style=flat-square&logo=wordpress&logoColor=white)
![License](https://img.shields.io/badge/License-GPL--2.0--or--later-blue?style=flat-square)
![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen?style=flat-square)

Drop any web app into WordPress with a single file upload. It shows up in your sidebar. Done.

```
invoice-generator.wp   →   upload   →   "Invoices" appears in wp-admin
```

*No new servers. No new domains. No deploys. Your WordPress install is the platform.*

</div>

---

## The idea

We're living through a genuinely strange and exciting moment in software. AI has changed what it means to write code — the pace of ideas, the speed of prototypes, the sheer *fun* of it.

The problem I kept running into: every time I had a new idea, I'd spin up a new server. A new domain, a new deploy pipeline, a new VPS — just to run something I wanted to play with. Friction that didn't need to exist.

WordPress is my digital home. It's where I've lived on the web for years. And I started thinking — why isn't this my app platform too? I've already got a perfectly good authenticated, multi-user, extensible web application sitting right there.

**Bazaar is the answer.** Build something cool, package it, drop it into your WordPress admin. No new infrastructure. Your WordPress install becomes the platform for everything you're building.

---

## What is a ware?

A **ware** is a `.wp` file — a renamed ZIP archive containing a self-contained web app and a `manifest.json`. Think `.apk` for Android, but for WordPress.

```
invoice-generator.wp
├── manifest.json      ← name, slug, menu placement, permissions
├── icon.svg           ← sidebar icon
├── index.html         ← your app's entry point
└── assets/
    ├── app.js
    └── app.css
```

Build your app in React, Vue, Svelte, vanilla JS — anything that compiles to HTML/CSS/JS. Add a manifest. ZIP it. Rename it `.wp`. Upload it.

---

## Three things that make it work

### 1. Full isolation, no friction

Every ware gets its own **full-screen sandboxed iframe** as a WordPress admin page. Your app renders exactly as it would standalone — zero style bleed from wp-admin, zero JavaScript conflicts. Write CSS as if your app owns the whole page, because inside the iframe, it does.

### 2. Authenticated by default

Your ware runs on the **same origin** as WordPress. That means every `fetch()` call can carry a `_wpnonce` and talk to any WordPress REST API endpoint — posts, users, custom endpoints, anything. No CORS configuration. No external auth. WordPress's existing permission system is your backend.

### 3. Performance that scales

When multiple wares use the same framework, Bazaar avoids the obvious trap. React is loaded once via `<importmap>` and shared across all ware iframes using the V8 bytecode cache. A universal service worker caches every asset after the first visit — on repeat loads, nothing hits the network at all.

---

## Install

> **Requirements:** PHP 8.2+, WordPress 6.6+

**WordPress admin** → Plugins → Add New → Upload Plugin → select the release zip → Activate

**WP-CLI:**

```bash
wp plugin install bazaar.zip --activate
```

A **Bazaar** item appears at the top of your admin sidebar.

---

## Build your first ware in 60 seconds

```bash
# Scaffold a new ware project interactively
npm create ware@latest
```

The CLI asks for a name and stack (vanilla TS, React, or Vue), then generates a ready-to-go project with `manifest.json`, Vite config, and a `package` script that outputs a `.wp` file.

Or skip the scaffold entirely — any static HTML/CSS/JS app plus a `manifest.json` is a valid ware:

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
# Upload in the Bazaar page → "Hello" appears in your sidebar
```

---

## What can you build?

Anything that runs as a web app. Some ideas to make it concrete:

| Ware | What it does |
|:---|:---|
| Kanban Board | Drag-and-drop project management, persisted in `localStorage` |
| Invoice Generator | Create invoices, track payments, export PDFs — all in wp-admin |
| Pixel Art Editor | Full canvas editor with tools, palette, and PNG export |
| Retro Synthesizer | Web Audio API synth with sequencer, zero dependencies |
| Color Palette Studio | HSL editor, WCAG contrast checker, CSS/Tailwind export |
| Focus Timer | Pomodoro timer with ambient sounds and session history |
| CRM | Your own lightweight CRM backed by WordPress custom post types |
| Anything | Seriously — if it runs in a browser, it runs as a ware |

---

## The name

In 1997, Eric S. Raymond wrote *[The Cathedral and the Bazaar](http://www.catb.org/~esr/writings/cathedral-bazaar/)*. He described two models of building software:

> **The Cathedral** — code released on a controlled schedule by a small group, guarded closely between releases.
>
> **The Bazaar** — code released early and often, in the open, where a great babbling bazaar of differing agendas produces something no single team could plan.

`wp-admin` is a cathedral. Adding real functionality means navigating PHP templates, action hooks, capability checks, and menu registration APIs. The core team controls the architecture.

**This plugin is the bazaar.** Build your app however you want, in whatever stack you prefer. Package it. Upload it. It appears in the sidebar. The WordPress admin becomes a platform that anyone can extend with a single ZIP file.

---

## Documentation

The full technical reference lives in the [wiki](../../wiki):

| | |
|:---|:---|
| [**Building a Ware**](../../wiki/Building-a-Ware) | The complete development guide — from "Hello World" to framework recipes, shared libraries, and WordPress REST patterns |
| [**Manifest Reference**](../../wiki/Manifest-Reference) | Every `manifest.json` field with types, defaults, and validation rules |
| [**REST API**](../../wiki/REST-API) | All 35+ endpoints — request and response shapes, auth requirements, error codes |
| [**WP-CLI**](../../wiki/WP-CLI) | Full CLI reference with install, update, dev mode, signing, and scripting recipes |
| [**WordPress Shell**](../../wiki/WordPress-Shell) | Using `wp shell`, PsySH, `wp eval`, and automation patterns |
| [**Architecture**](../../wiki/Architecture) | How the plugin is structured, the security model, and how shared libraries work |

---

<div align="center">

GPL-2.0-or-later &nbsp;·&nbsp; Built on the shoulders of [The Cathedral and the Bazaar](http://www.catb.org/~esr/writings/cathedral-bazaar/)

</div>
