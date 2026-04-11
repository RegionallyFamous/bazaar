/**
 * Bazaar Service Worker.
 *
 * Two responsibilities:
 *
 * 1. ZERO-TRUST NETWORK ENFORCEMENT
 *    When `zero_trust` is enabled in a ware's manifest, fetch requests from
 *    that ware's iframe are checked against its declared `permissions.network`
 *    allowlist. Any request to an unlisted origin is blocked with a 403.
 *    Requests to the WordPress origin are always allowed.
 *
 * 2. UNIVERSAL WARE ASSET CACHE
 *    All static assets served from wp-content/bazaar/** are cached after the
 *    first fetch (cache-first strategy). Content-hashed filenames mean a cache
 *    entry is valid forever; the browser never re-downloads the same bytes.
 *    This also covers the shared library bundles at admin/dist/shared/**, so
 *    React / Vue is downloaded exactly once regardless of how many ware iframes
 *    open.
 *
 * Registration: shell.js registers this SW unconditionally (asset caching) and
 * sends permissions via postMessage when zero-trust wares are present.
 */

/* eslint-env serviceworker */

// ── Asset cache ──────────────────────────────────────────────────────────────

const ASSET_CACHE_NAME = 'bazaar-ware-assets-v1';

/**
 * Matches both ware static files (wp-content/bazaar/**) and the shell's
 * shared library bundles (wp-content/plugins/bazaar/admin/dist/shared/**).
 */
const CACHEABLE_RE = /\/wp-content\/bazaar\/|\/admin\/dist\/shared\//;

// ── Zero-trust state ─────────────────────────────────────────────────────────

/** @type {Map<string, string[]>} slug → allowed origin list */
const permissionsMap = new Map();

/** The WordPress site origin — always allowed. */
let siteOrigin = '';

// ── Receive permissions map from shell.js ────────────────────────────────────

self.addEventListener( 'message', ( event ) => {
	// Reject messages from unexpected origins once we have established the site
	// origin. Before the first zt-init the SW doesn't know the site origin yet,
	// so we accept it but then lock it in — subsequent inits must match.
	if ( siteOrigin && event.origin !== siteOrigin ) {
		return;
	}

	const { type, permissions } = event.data ?? {};
	if ( type === 'bazaar:zt-init' ) {
		// Trust the verified event.origin, not the untrusted payload 'origin' field.
		siteOrigin = event.origin;
		for ( const [ slug, allowed ] of Object.entries( permissions ?? {} ) ) {
			permissionsMap.set( slug, allowed );
		}
	}
} );

// ── Fetch interception ───────────────────────────────────────────────────────

self.addEventListener( 'fetch', ( event ) => {
	const req = event.request;

	// Only handle GET requests; leave mutations to the network.
	if ( req.method !== 'GET' ) {
		return;
	}

	const url = new URL( req.url );

	// ── Zero-trust enforcement (ware iframes only) ──────────────────────────

	const referrer = req.referrer;
	const slugMatch = referrer
		? /\/serve\/([a-z0-9-]+)\//.exec( new URL( referrer ).pathname )
		: null;
	const slug = slugMatch ? slugMatch[ 1 ] : null;

	if ( slug ) {
		const allowed = permissionsMap.get( slug );
		if ( allowed ) {
			// Same-origin (WordPress site) is always allowed.
			if ( url.origin !== siteOrigin ) {
				const permitted = allowed.some( ( allowedOrigin ) => {
					try {
						const ao = new URL( allowedOrigin );
						return url.origin === ao.origin;
					} catch {
						// Malformed entry in permissions list — treat as not permitted.
						return false;
					}
				} );

				if ( ! permitted ) {
					event.respondWith(
						new Response(
							JSON.stringify( { error: 'blocked', url: req.url, slug } ),
							{
								status: 403,
								headers: {
									'Content-Type': 'application/json',
									'X-Bazaar-ZT-Block': '1',
								},
							}
						)
					);
					return;
				}
			}
		}
	}

	// ── Universal ware asset cache (cache-first) ────────────────────────────
	// Covers: wp-content/bazaar/{slug}/assets/** and admin/dist/shared/**
	// Both use content-hashed filenames → safe to cache indefinitely.

	if ( CACHEABLE_RE.test( url.pathname ) ) {
		event.respondWith(
			caches.open( ASSET_CACHE_NAME ).then( async ( cache ) => {
				const cached = await cache.match( req );
				if ( cached ) {
					return cached;
				}
				const response = await fetch( req );
				if ( response.ok ) {
					cache.put( req, response.clone() );
				}
				return response;
			} )
		);
	}
	// All other requests fall through to the network unchanged.
} );

// ── Install / activate — skip waiting for immediate control ─────────────────

self.addEventListener( 'install', () => self.skipWaiting() );
self.addEventListener( 'activate', ( e ) => e.waitUntil( self.clients.claim() ) );
