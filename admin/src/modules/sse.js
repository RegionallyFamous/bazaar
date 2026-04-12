/**
 * Bazaar Shell — SSE connection + badge/health polling.
 *
 * All functions accept a `deps` object so they can be unit-tested without a
 * live WordPress back-end.
 */

/** Initial and minimum SSE reconnect delay (ms). */
const SSE_INITIAL_DELAY = 5_000;

/** Maximum SSE reconnect backoff (ms) — caps at 5 minutes. */
const SSE_MAX_DELAY = 5 * 60_000;

let _sseDelay = SSE_INITIAL_DELAY;

/**
 * True while an SSE connection is open and delivering events.
 * Exported as a live binding so shell.js can skip redundant poll requests
 * while SSE is healthy.
 */
export let sseConnected = false;

/**
 * Open an SSE connection to the Bazaar stream endpoint and dispatch incoming
 * events to the provided handlers.
 *
 * Reconnects with exponential backoff on error.
 *
 * @param {{
 *   restUrl:          string,
 *   nonce:            string,
 *   onBadge:          (slug: string, count: number) => void,
 *   onToast:          (message: string, level: string) => void,
 *   onWareInstalled:  (ware: Object) => void,
 *   onWareDeleted:    (slug: string) => void,
 *   onWareToggled:    (slug: string, enabled: boolean) => void,
 *   onHealthUpdate:   (slug: string, status: string) => void,
 * }} deps
 */
export function connectSSE( deps ) {
	const { restUrl, nonce, onBadge, onToast, onWareInstalled, onWareDeleted, onWareToggled, onHealthUpdate } = deps;

	const u = new URL( `${ restUrl }/stream` );
	u.searchParams.set( '_wpnonce', nonce );
	const src = new EventSource( u.toString(), { withCredentials: true } );

	src.addEventListener( 'open', () => {
		_sseDelay = SSE_INITIAL_DELAY; // Reset backoff after a clean connection.
		sseConnected = true;
	} );

	src.addEventListener( 'badge', ( e ) => {
		try {
			const { slug, count } = JSON.parse( e.data );
			onBadge( slug, count );
		} catch { /* malformed SSE payload — skip */ }
	} );

	src.addEventListener( 'toast', ( e ) => {
		try {
			const { message, level } = JSON.parse( e.data );
			onToast( message, level );
		} catch { /* malformed SSE payload — skip */ }
	} );

	src.addEventListener( 'ware-installed', ( e ) => {
		try {
			onWareInstalled( JSON.parse( e.data ) );
		} catch { /* malformed SSE payload — skip */ }
	} );

	src.addEventListener( 'ware-deleted', ( e ) => {
		try {
			onWareDeleted( JSON.parse( e.data ).slug );
		} catch { /* malformed SSE payload — skip */ }
	} );

	src.addEventListener( 'ware-toggled', ( e ) => {
		try {
			const { slug, enabled } = JSON.parse( e.data );
			onWareToggled( slug, enabled );
		} catch { /* malformed SSE payload — skip */ }
	} );

	src.addEventListener( 'health', ( e ) => {
		try {
			const { slug, status } = JSON.parse( e.data );
			onHealthUpdate( slug, status );
		} catch { /* malformed SSE payload — skip */ }
	} );

	src.onerror = () => {
		sseConnected = false;
		src.close();
		setTimeout( () => connectSSE( deps ), _sseDelay );
		_sseDelay = Math.min( _sseDelay * 2, SSE_MAX_DELAY );
	};
}

/**
 * Fetch and apply current badge counts.
 *
 * @param {{
 *   restUrl:   string,
 *   nonce:     string,
 *   badgeMap:  Map<string, number>,
 *   onDirty:   () => void,
 * }} deps
 */
export async function pollBadges( { restUrl, nonce, badgeMap, onDirty } ) {
	try {
		const r = await fetch( `${ restUrl }/badges`, {
			headers: { 'X-WP-Nonce': nonce },
		} );
		if ( ! r.ok ) {
			return;
		}
		const badges = await r.json();
		if ( ! Array.isArray( badges ) ) {
			return;
		}
		let dirty = false;
		for ( const { slug, count } of badges ) {
			if ( badgeMap.get( slug ) !== count ) {
				badgeMap.set( slug, count );
				dirty = true;
			}
		}
		if ( dirty ) {
			onDirty();
		}
	} catch {
		/* non-fatal */
	}
}

/**
 * Fetch and apply the latest health status for each ware.
 *
 * @param {{
 *   restUrl:   string,
 *   nonce:     string,
 *   healthMap: Map<string, string>,
 *   onDirty:   () => void,
 * }} deps
 */
export async function pollHealth( { restUrl, nonce, healthMap, onDirty } ) {
	try {
		const r = await fetch( `${ restUrl }/health`, {
			headers: { 'X-WP-Nonce': nonce },
		} );
		if ( ! r.ok ) {
			return;
		}
		const list = await r.json();
		if ( ! Array.isArray( list ) ) {
			return;
		}
		let dirty = false;
		for ( const { slug, status } of list ) {
			if ( healthMap.get( slug ) !== status ) {
				healthMap.set( slug, status );
				dirty = true;
			}
		}
		if ( dirty ) {
			onDirty();
		}
	} catch {
		/* non-fatal */
	}
}
