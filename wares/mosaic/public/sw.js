const CACHE_VERSION = '1.0.0';
const CACHE_NAME    = `bazaar-ware-${ CACHE_VERSION }`;

self.addEventListener( 'install', () => { self.skipWaiting(); } );

self.addEventListener( 'activate', event => {
	event.waitUntil(
		caches.keys().then( keys =>
			Promise.all( keys.filter( k => k !== CACHE_NAME ).map( k => caches.delete( k ) ) ),
		),
	);
	self.clients.claim();
} );

self.addEventListener( 'fetch', event => {
	if ( event.request.method !== 'GET' ) return;
	if ( new URL( event.request.url ).pathname.includes( '/assets/' ) ) {
		event.respondWith( cacheFirst( event.request ) );
	}
} );

async function cacheFirst( request ) {
	const cached = await caches.match( request );
	if ( cached ) return cached;
	const response = await fetch( request );
	if ( response.ok ) ( await caches.open( CACHE_NAME ) ).put( request, response.clone() );
	return response;
}
