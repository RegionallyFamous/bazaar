/**
 * Bazaar ware service worker — cache-first for static assets.
 *
 * Scope: /wp-content/bazaar/{slug}/ (set by the <base href> injected by Bazaar).
 *
 * Strategy
 * ─────────
 * - Assets in /assets/ → cache-first (content-hashed filenames, safe to cache forever)
 * - Everything else    → network-first (manifest.json, index.html served via PHP)
 *
 * The cache is keyed by CACHE_VERSION. Bump it in your build pipeline to
 * invalidate stale assets across all users on the next SW activation.
 */

const CACHE_VERSION = '__WARE_VERSION__';
const CACHE_NAME    = `bazaar-ware-${ CACHE_VERSION }`;

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

self.addEventListener( 'install', () => {
	// Take control immediately — don't wait for existing tabs to close.
	self.skipWaiting();
} );

self.addEventListener( 'activate', event => {
	event.waitUntil(
		caches.keys().then( keys =>
			Promise.all(
				keys
					.filter( key => key !== CACHE_NAME )
					.map( key => caches.delete( key ) ),
			),
		),
	);
	self.clients.claim();
} );

// ---------------------------------------------------------------------------
// Fetch
// ---------------------------------------------------------------------------

self.addEventListener( 'fetch', event => {
	if ( event.request.method !== 'GET' ) return;

	const url = new URL( event.request.url );
	const isAsset = url.pathname.includes( '/assets/' );

	if ( isAsset ) {
		// Cache-first: assets have content-hash filenames and are immutable.
		event.respondWith( cacheFirst( event.request ) );
	}
	// Non-assets fall through to the browser's normal fetch (network).
} );

async function cacheFirst( request ) {
	const cached = await caches.match( request );
	if ( cached ) return cached;

	const response = await fetch( request );
	if ( response.ok ) {
		const cache = await caches.open( CACHE_NAME );
		cache.put( request, response.clone() );
	}
	return response;
}
