=== Bazaar ===
Contributors: nickhblair
Tags: admin, apps, marketplace, tools, dashboard
Requires at least: 6.6
Tested up to: 6.7
Requires PHP: 8.1
Stable tag: 1.1.1
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Turn wp-admin into an app marketplace. Install .wp ware packages and they appear instantly as menu pages in your sidebar.

== Description ==

**Bazaar** is a WordPress plugin that transforms your admin dashboard into a personal app marketplace.

Developers package any HTML/CSS/JS application as a `.wp` file (a renamed ZIP archive called a **ware**). Upload it through the Bazaar page and it immediately appears as a new menu item in your WordPress sidebar — no theme changes, no shortcodes, no page templates.

Think `.apk` for Android, but for WordPress.

= Key Features =

* **One-click install** — drag-and-drop or browse to upload a `.wp` ware file
* **Instant sidebar integration** — each ware gets its own admin menu page
* **Complete CSS/JS isolation** — wares render inside a sandboxed iframe; zero style conflicts with wp-admin
* **Authentication baked in** — ware files are served through an authenticated REST endpoint; no anonymous access
* **Security-first** — PHP files are rejected at upload time; `.htaccess` disables PHP execution in the wares directory
* **Enable/disable/delete** — manage installed wares from the Bazaar page without losing data

= Building a Ware =

A ware is a ZIP archive renamed to `.wp`. The minimum structure:

`
my-app.wp
├── manifest.json
├── index.html
└── assets/
    ├── app.js
    └── app.css
`

**manifest.json** example:

`
{
  "name": "Ledger",
  "slug": "ledger",
  "version": "1.0.0",
  "author": "Regionally Famous",
  "description": "Send invoices, track clients, and log payments.",
  "icon": "icon.svg",
  "entry": "index.html",
  "menu": {
    "title": "Invoices",
    "position": 30,
    "capability": "manage_options"
  }
}
`

Build your app with any framework (React, Vue, Svelte, vanilla JS), add a manifest, ZIP it, rename to `.wp`, and upload through the Bazaar.

= REST API Endpoints =

Bazaar registers the following REST routes under `bazaar/v1`:

* `GET  /serve/{slug}/{file}` — authenticated static file server for ware assets
* `POST /wares` — upload a new `.wp` ware (requires `manage_options`)
* `PATCH /wares/{slug}` — enable or disable a ware (requires `manage_options`)
* `DELETE /wares/{slug}` — delete a ware and its files (requires `manage_options`)

== Installation ==

1. Upload the `bazaar` directory to `/wp-content/plugins/bazaar/`, or install through the WordPress Plugins screen.
2. Activate the plugin through the **Plugins** screen.
3. A **Bazaar** menu item will appear at the top of your WordPress admin sidebar.
4. Upload a `.wp` ware file to install your first app.

== Frequently Asked Questions ==

= Can wares run PHP? =

No. PHP files are rejected during the upload validation step. The `wp-content/bazaar/` directory also has an `.htaccess` that disables PHP execution as a second layer of defence.

= Where are ware files stored? =

In `wp-content/bazaar/{slug}/` — outside the plugin directory so wares survive plugin updates.

= What happens if I deactivate the plugin? =

Wares and their data are preserved. Re-activating the plugin restores everything.

= Can wares communicate with the WordPress REST API? =

Yes. Wares run in an iframe with `allow-same-origin` in the sandbox, so they can make authenticated requests to the WordPress REST API (with `X-WP-Nonce`).

= What is the maximum ware size? =

50 MB uncompressed by default. This can be changed by updating the `bazaar_max_ware_size` WordPress option.

== Screenshots ==

1. The Bazaar page — browse installed wares, upload new ones
2. An installed ware rendered as a full-bleed iframe in wp-admin

== Changelog ==

= 1.0.0 =
* Initial release

== Upgrade Notice ==

= 1.0.0 =
Initial release.
