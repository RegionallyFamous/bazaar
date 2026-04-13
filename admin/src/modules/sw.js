/**
 * Service worker registration and zero-trust permission bootstrapping.
 *
 * Extracted from shell.js so the SW lifecycle is co-located with other
 * browser-feature modules and independently testable.
 *
 * @module sw
 */

/**
 * Register the Bazaar service worker and send zero-trust network permissions
 * for any installed wares that require them.
 *
 * Registration failure is non-fatal — the shell works without a SW, it just
 * won't benefit from asset caching or zero-trust network enforcement.
 *
 * @param {{
 *   swUrl:    string|null,
 *   wareMap:  Map<string, Object>,
 * }} deps
 * @return {Promise<void>}
 */
export async function initServiceWorker( { swUrl, wareMap } ) {
	if ( ! ( 'serviceWorker' in navigator ) ) {
		return;
	}

	try {
		await navigator.serviceWorker.register(
			swUrl ?? `${ window.location.origin }/wp-json/bazaar/v1/sw`,
			{ scope: '/' }
		);

		// Send zero-trust permissions for wares that require network enforcement.
		const ztWares = [ ...wareMap.values() ].filter(
			( w ) => w.zero_trust && w.permissions_network
		);
		if ( ! ztWares.length ) {
			return;
		}

		// Await the service worker being fully active before sending zt-init
		// to eliminate the race condition where the SW is still installing.
		const activeSw = await navigator.serviceWorker.ready;
		const permissions = Object.fromEntries(
			ztWares.map( ( w ) => [ w.slug, w.permissions_network ] )
		);
		activeSw.active?.postMessage( {
			type: 'bazaar:zt-init',
			permissions,
			origin: window.location.origin,
		} );
	} catch {
		// SW registration failure is non-fatal.
	}
}
