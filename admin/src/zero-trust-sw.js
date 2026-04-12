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

const ASSET_CACHE_NAME = 'bazaar-ware-assets-v3';

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

	const { type, permissions, slug } = event.data ?? {};

	if ( type === 'bazaar:zt-init' ) {
		// Trust the verified event.origin, not the untrusted payload 'origin' field.
		siteOrigin = event.origin;
		for ( const [ s, allowed ] of Object.entries( permissions ?? {} ) ) {
			permissionsMap.set( s, allowed );
		}
	}

	// Shell sends this after a ware is installed or updated.  Evict every
	// cached entry whose URL contains `/wp-content/bazaar/{slug}/` so the
	// next load fetches the freshly-deployed assets from the network.
	if ( type === 'bazaar:cache-clear' && typeof slug === 'string' ) {
		const pattern = `/wp-content/bazaar/${ slug }/`;
		event.waitUntil(
			caches.open( ASSET_CACHE_NAME ).then( ( cache ) =>
				cache.keys().then( ( keys ) =>
					Promise.all(
						keys
							.filter( ( r ) => r.url.includes( pattern ) )
							.map( ( r ) => cache.delete( r ) )
					)
				)
			)
		);
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
	let slug = null;
	if ( referrer ) {
		try {
			slug = ( /\/serve\/([a-z0-9-]+)\//.exec( new URL( referrer ).pathname ) ?? [] )[ 1 ] ?? null;
		} catch {
			// Malformed referrer URL — treat as no slug (allow through).
		}
	}

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
							JSON.stringify( { error: 'blocked', origin: url.origin, slug } ),
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
					// cache.put rejection (quota etc.) must not fail the request.
					cache.put( req, response.clone() ).catch( () => {} );
				}
				return response;
			} ).catch( () => fetch( req ) )
		);
	}
	// All other requests fall through to the network unchanged.
} );

// ── Install / activate — skip waiting for immediate control ─────────────────

self.addEventListener( 'install', () => self.skipWaiting() );

// On activate, claim clients immediately AND delete every cache bucket that
// no longer matches ASSET_CACHE_NAME. This ensures that when the version
// constant is bumped (v2 → v3 etc.) the old bucket — which may contain
// stale JS pointing at removed or renamed REST routes — is evicted right away
// rather than lingering until the next browser cache-storage sweep.
self.addEventListener( 'activate', ( e ) => {
	e.waitUntil(
		Promise.all( [
			self.clients.claim(),
			caches.keys().then( ( names ) =>
				Promise.all(
					names
						.filter( ( n ) => n !== ASSET_CACHE_NAME )
						.map( ( n ) => caches.delete( n ) )
				)
			),
		] )
	);
} );
