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

/** Active EventSource instance — null when disconnected. */
let _es = null;

/** Pending reconnect timer id — cleared before scheduling a new one. */
let _reconnectTimer = null;

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
	// Singleton guard — do not open a second connection while one is alive.
	if ( _es && _es.readyState !== EventSource.CLOSED ) {
		return;
	}

	const { restUrl, nonce, onBadge, onToast, onWareInstalled, onWareDeleted, onWareToggled, onHealthUpdate } = deps;

	const u = new URL( `${ restUrl }/stream` );
	u.searchParams.set( '_wpnonce', nonce );
	const src = new EventSource( u.toString(), { withCredentials: true } );
	_es = src;

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
		_es = null;
		// Clear any existing reconnect timer before scheduling a new one to
		// prevent stacked timers from rapid error events.
		clearTimeout( _reconnectTimer );
		_reconnectTimer = setTimeout( () => connectSSE( deps ), _sseDelay );
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
let _badgePollInFlight = false;

export async function pollBadges( { restUrl, nonce, badgeMap, onDirty } ) {
	if ( _badgePollInFlight ) {
		return;
	}
	_badgePollInFlight = true;
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
	} finally {
		_badgePollInFlight = false;
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
/**
 * Create a polling fallback that fires badge and health polls on separate
 * intervals only when the SSE connection is not active.
 *
 * The returned object exposes `start()` and `stop()` so the caller can
 * pause polling while the browser tab is hidden and resume on visibility
 * restore, without leaving orphaned timers in the background.
 *
 * @param {{
 *   badgePollDeps:          Object,
 *   healthPollDeps:         Object,
 *   BADGE_POLL_INTERVAL_MS:  number,
 *   HEALTH_POLL_INTERVAL_MS: number,
 * }} deps
 * @return {{ start: () => void, stop: () => void }} Object with start/stop methods to control the polling intervals.
 */
export function createPollingFallback( {
	badgePollDeps,
	healthPollDeps,
	BADGE_POLL_INTERVAL_MS,
	HEALTH_POLL_INTERVAL_MS,
} ) {
	let _badgeTimer;
	let _healthTimer;

	function stop() {
		clearInterval( _badgeTimer );
		clearInterval( _healthTimer );
	}

	function start() {
		// Clear any existing intervals before creating new ones so that calling
		// start() more than once (e.g. initial load + visibilitychange)
		// never leaves orphaned timers running in the background.
		stop();
		_badgeTimer = setInterval( () => {
			if ( ! sseConnected ) {
				void pollBadges( badgePollDeps );
			}
		}, BADGE_POLL_INTERVAL_MS );
		_healthTimer = setInterval( () => {
			if ( ! sseConnected ) {
				void pollHealth( healthPollDeps );
			}
		}, HEALTH_POLL_INTERVAL_MS );
	}

	return { start, stop };
}

let _healthPollInFlight = false;

export async function pollHealth( { restUrl, nonce, healthMap, onDirty } ) {
	if ( _healthPollInFlight ) {
		return;
	}
	_healthPollInFlight = true;
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
	} finally {
		_healthPollInFlight = false;
	}
}
