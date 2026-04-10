/**
 * Bazaar Zero-Trust Service Worker.
 *
 * When `zero_trust` is enabled in a ware's manifest, this Service Worker
 * intercepts all fetch requests made from within the ware's iframe and
 * enforces the declared `permissions.network` allowlist.
 *
 * Ware manifests declare allowed origins:
 *   "permissions": {
 *     "network": ["https://api.example.com", "https://cdn.example.com"]
 *   }
 *
 * Any fetch to an origin not in the allowlist is blocked with a 403.
 * Requests to the WordPress origin are always allowed (REST API, media, etc.).
 *
 * Registration: shell.js registers this SW and passes the permissions map
 * via a postMessage after registration.
 *
 * NOTE: This SW runs in a separate global scope. The permissions map is sent
 * from shell.js after registration using `sw.postMessage()`.
 */

/* eslint-env serviceworker */

/** @type {Map<string, string[]>} slug → allowed origin list */
const permissionsMap = new Map();

/** The WordPress site origin — always allowed. */
let siteOrigin = '';

// ── Receive permissions map from shell.js ────────────────────────────────────

self.addEventListener('message', (event) => {
	const { type, permissions, origin } = event.data ?? {};
	if (type === 'bazaar:zt-init') {
		siteOrigin = origin ?? '';
		for (const [slug, allowed] of Object.entries(permissions ?? {})) {
			permissionsMap.set(slug, allowed);
		}
	}
});

// ── Fetch interception ───────────────────────────────────────────────────────

self.addEventListener('fetch', (event) => {
	const req = event.request;
	const url = new URL(req.url);

	// Determine which ware this request belongs to by inspecting the referrer.
	// Ware iframes are served under /bazaar-serve/{slug}/.
	const referrer = event.request.referrer;
	const slugMatch = referrer
		? /\/bazaar-serve\/([a-z0-9-]+)\//.exec(referrer)
		: null;
	const slug = slugMatch ? slugMatch[1] : null;

	if (!slug) {
		return;
	} // Not from a ware frame — let it pass.

	const allowed = permissionsMap.get(slug);
	if (!allowed) {
		return;
	} // Ware has no zero-trust constraint — let it pass.

	// Same-origin (WordPress site) is always allowed.
	if (url.origin === siteOrigin) {
		return;
	}

	// Check against the declared allow-list.
	const permitted = allowed.some((allowedOrigin) => {
		const ao = new URL(allowedOrigin);
		return url.origin === ao.origin;
	});

	if (!permitted) {
		event.respondWith(
			new Response(
				JSON.stringify({ error: 'blocked', url: req.url, slug }),
				{
					status: 403,
					headers: {
						'Content-Type': 'application/json',
						'X-Bazaar-ZT-Block': '1',
					},
				}
			)
		);
	}
	// Otherwise fall through to the network.
});

// ── Install / activate — skip waiting for immediate control ─────────────────

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
