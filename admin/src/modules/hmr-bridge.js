/**
 * HMR Bridge — connects Vite's dev server WebSocket to the Bazaar shell.
 *
 * In dev mode (`ware.dev_url` is set), the shell opens a WebSocket to the
 * Vite dev server. When Vite signals a full-page reload (type="full-reload")
 * or a hot-update (type="update"), the shell reloads only the affected ware's
 * iframe — the rest of the shell and other wares are untouched.
 *
 * This dramatically speeds up the dev loop: you save a file in your ware's
 * codebase, Vite rebuilds, the shell reloads just that frame.
 */

/**
 * @typedef {{ ws: WebSocket, closeHandler: () => void }} HmrEntry
 */

/** @type {Map<string, HmrEntry>} slug → active socket + its close handler */
const _sockets = new Map();

/**
 * Connect to a ware's Vite dev server WebSocket.
 *
 * @param {string}                 slug
 * @param {string}                 devUrl   Base URL of the Vite dev server (e.g. "http://localhost:5173")
 * @param {(slug: string) => void} onReload Callback to reload the ware's iframe.
 */
export function connectHmr( slug, devUrl, onReload ) {
	disconnectHmr( slug );

	const wsUrl = devUrl.replace( /^http/, 'ws' ) + '/__vite_hmr';

	let ws;
	let reconnectDelay = 1000;
	// Keep a stable reference so we can removeEventListener on disconnect.
	let closeHandler;

	const connect = () => {
		try {
			ws = new WebSocket( wsUrl );
		} catch {
			// Invalid wsUrl (e.g. non-ws scheme) — back off and retry.
			reconnectDelay = Math.min( reconnectDelay * 2, 30_000 );
			setTimeout( connect, reconnectDelay );
			return;
		}

		ws.addEventListener( 'open', () => {
			reconnectDelay = 1000;
		} );

		ws.addEventListener( 'message', ( evt ) => {
			let msg;
			try {
				msg = JSON.parse( evt.data );
			} catch {
				return;
			}

			// 'connected' is an informational ping — nothing to do.
			if ( msg.type === 'connected' ) {
				return;
			}

			// Both 'update' (HMR patch) and 'full-reload' (no HMR possible)
			// should trigger an iframe reload.
			if ( msg.type === 'update' || msg.type === 'full-reload' ) {
				onReload( slug );
			}
		} );

		// Store a named handler so disconnectHmr() can remove it via
		// removeEventListener — setting ws.onclose = null would not remove
		// listeners registered with addEventListener.
		closeHandler = () => {
			reconnectDelay = Math.min( reconnectDelay * 2, 30_000 );
			setTimeout( connect, reconnectDelay );
		};
		ws.addEventListener( 'close', closeHandler );

		ws.addEventListener( 'error', () => ws.close() );
		_sockets.set( slug, { ws, closeHandler } );
	};

	connect();
}

/**
 * Disconnect from a ware's Vite HMR WebSocket.
 * Removes the close handler before closing so no reconnect is scheduled.
 * @param {string} slug
 */
export function disconnectHmr( slug ) {
	const entry = _sockets.get( slug );
	if ( entry ) {
		// Remove the close listener first — prevents reconnect after explicit
		// disconnect.  Setting ws.onclose = null does not remove listeners that
		// were registered with addEventListener.
		entry.ws.removeEventListener( 'close', entry.closeHandler );
		entry.ws.close();
		_sockets.delete( slug );
	}
}

/** Disconnect all HMR sockets (e.g. on shell teardown). */
export function disconnectAll() {
	for ( const slug of _sockets.keys() ) {
		disconnectHmr( slug );
	}
}
