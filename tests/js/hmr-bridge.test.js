/**
 * Tests for hmr-bridge.js
 *
 * Covers the regression where full-reload events were silently discarded
 * instead of triggering an iframe reload.
 */

import { connectHmr, disconnectHmr, disconnectAll } from '../../admin/src/modules/hmr-bridge.js';

// ─── WebSocket mock ──────────────────────────────────────────────────────────

/** Capture the last constructed WS so tests can dispatch synthetic events. */
let lastWs = null;

class MockWebSocket {
	constructor( url ) {
		this.url = url;
		this._listeners = {};
		this.onclose = null;
		lastWs = this;
	}

	addEventListener( type, fn ) {
		if ( ! this._listeners[ type ] ) this._listeners[ type ] = [];
		this._listeners[ type ].push( fn );
	}

	removeEventListener( type, fn ) {
		if ( ! this._listeners[ type ] ) return;
		this._listeners[ type ] = this._listeners[ type ].filter( ( h ) => h !== fn );
	}

	/** Dispatch a synthetic event to registered listeners. */
	emit( type, payload = {} ) {
		( this._listeners[ type ] ?? [] ).forEach( ( fn ) => fn( payload ) );
	}

	close() {
		// Invoke listeners registered via addEventListener (not onclose).
		this.emit( 'close' );
	}
}

beforeEach( () => {
	lastWs = null;
	global.WebSocket = MockWebSocket;
} );

afterEach( () => {
	disconnectHmr( 'test-ware' );
} );

// ─── connectHmr ─────────────────────────────────────────────────────────────

describe( 'connectHmr', () => {
	test( 'opens a WebSocket to the Vite HMR endpoint', () => {
		connectHmr( 'test-ware', 'http://localhost:5173', jest.fn() );
		expect( lastWs ).not.toBeNull();
		expect( lastWs.url ).toBe( 'ws://localhost:5173/__vite_hmr' );
	} );

	test( '"update" message triggers onReload', () => {
		const onReload = jest.fn();
		connectHmr( 'test-ware', 'http://localhost:5173', onReload );

		lastWs.emit( 'message', { data: JSON.stringify( { type: 'update' } ) } );

		expect( onReload ).toHaveBeenCalledWith( 'test-ware' );
	} );

	// ─── Regression: full-reload was silently discarded ─────────────────────
	test( '"full-reload" message triggers onReload', () => {
		const onReload = jest.fn();
		connectHmr( 'test-ware', 'http://localhost:5173', onReload );

		lastWs.emit( 'message', { data: JSON.stringify( { type: 'full-reload' } ) } );

		expect( onReload ).toHaveBeenCalledWith( 'test-ware' );
	} );

	test( '"connected" message does NOT trigger onReload', () => {
		const onReload = jest.fn();
		connectHmr( 'test-ware', 'http://localhost:5173', onReload );

		lastWs.emit( 'message', { data: JSON.stringify( { type: 'connected' } ) } );

		expect( onReload ).not.toHaveBeenCalled();
	} );

	test( 'unknown message type does NOT trigger onReload', () => {
		const onReload = jest.fn();
		connectHmr( 'test-ware', 'http://localhost:5173', onReload );

		lastWs.emit( 'message', { data: JSON.stringify( { type: 'ping' } ) } );

		expect( onReload ).not.toHaveBeenCalled();
	} );

	test( 'malformed JSON does NOT throw', () => {
		const onReload = jest.fn();
		connectHmr( 'test-ware', 'http://localhost:5173', onReload );

		expect( () => {
			lastWs.emit( 'message', { data: 'not-json{{{' } );
		} ).not.toThrow();
	} );
} );

// ─── disconnectHmr ───────────────────────────────────────────────────────────

/**
 * Regression: before the fix, disconnectHmr() set ws.onclose = null but did
 * not remove the listener registered via addEventListener('close', ...).  This
 * meant ws.close() would still fire the handler, schedule a setTimeout, and
 * open a new WebSocket after an explicit disconnect.
 */
describe( 'disconnectHmr', () => {
	test( 'does not trigger reconnect after explicit disconnect', () => {
		jest.useFakeTimers();
		const constructedUrls = [];
		const OriginalMock = global.WebSocket;

		global.WebSocket = class TrackingWebSocket extends MockWebSocket {
			constructor( url ) {
				super( url );
				constructedUrls.push( url );
			}
		};

		connectHmr( 'test-ware', 'http://localhost:5173', jest.fn() );
		const wsBeforeDisconnect = lastWs;

		// Disconnect explicitly before the socket closes.
		disconnectHmr( 'test-ware' );

		// Simulate the socket closing after disconnect (e.g. network drop).
		wsBeforeDisconnect.emit( 'close' );

		// Advance all timers — no reconnect should have been scheduled.
		jest.runAllTimers();

		// Only the original WebSocket should have been constructed.
		expect( constructedUrls ).toHaveLength( 1 );

		jest.useRealTimers();
		global.WebSocket = OriginalMock;
	} );

	test( 'allows reconnection after an unintended close (not disconnected)', () => {
		jest.useFakeTimers();
		const constructedCount = { value: 0 };
		const OriginalMock = global.WebSocket;

		global.WebSocket = class CountingWebSocket extends MockWebSocket {
			constructor( url ) {
				super( url );
				constructedCount.value++;
			}
		};

		connectHmr( 'test-ware', 'http://localhost:5173', jest.fn() );
		const wsRef = lastWs;

		// Close fires without an explicit disconnectHmr — should schedule reconnect.
		wsRef.emit( 'close' );
		jest.runAllTimers();

		expect( constructedCount.value ).toBeGreaterThan( 1 );

		disconnectHmr( 'test-ware' );
		jest.useRealTimers();
		global.WebSocket = OriginalMock;
	} );
} );
