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

/** @type {Map<string, WebSocket>} slug → Vite WS */
const _sockets = new Map();

/**
 * Connect to a ware's Vite dev server WebSocket.
 *
 * @param {string}                 slug
 * @param {string}                 devUrl   Base URL of the Vite dev server (e.g. "http://localhost:5173")
 * @param {(slug: string) => void} onReload Callback to reload the ware's iframe.
 */
export function connectHmr(slug, devUrl, onReload) {
	disconnectHmr(slug);

	const wsUrl = devUrl.replace(/^http/, 'ws') + '/__vite_hmr';

	let ws;
	let reconnectDelay = 1000;

	const connect = () => {
		ws = new WebSocket(wsUrl);

		ws.addEventListener('open', () => {
			reconnectDelay = 1000;
		});

		ws.addEventListener('message', (evt) => {
			let msg;
			try {
				msg = JSON.parse(evt.data);
			} catch {
				return;
			}

			if (msg.type === 'full-reload' || msg.type === 'connected') {
				return;
			}

			if (msg.type === 'update' || msg.type === 'full-reload') {
				onReload(slug);
			}
		});

		ws.addEventListener('close', () => {
			reconnectDelay = Math.min(reconnectDelay * 2, 30_000);
			setTimeout(connect, reconnectDelay);
		});

		ws.addEventListener('error', () => ws.close());
		_sockets.set(slug, ws);
	};

	connect();
}

/**
 * Disconnect from a ware's Vite HMR WebSocket.
 * @param {string} slug
 */
export function disconnectHmr(slug) {
	const ws = _sockets.get(slug);
	if (ws) {
		ws.onclose = null;
		ws.close();
		_sockets.delete(slug);
	}
}

/** Disconnect all HMR sockets (e.g. on shell teardown). */
export function disconnectAll() {
	for (const slug of _sockets.keys()) {
		disconnectHmr(slug);
	}
}
