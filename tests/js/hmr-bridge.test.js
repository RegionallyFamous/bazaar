/**
 * Tests for hmr-bridge.js
 *
 * Covers the regression where full-reload events were silently discarded
 * instead of triggering an iframe reload.
 */

import { connectHmr, disconnectHmr } from '../../admin/src/modules/hmr-bridge.js';

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

	/** Dispatch a synthetic event to registered listeners. */
	emit( type, payload = {} ) {
		( this._listeners[ type ] ?? [] ).forEach( ( fn ) => fn( payload ) );
	}

	close() {
		this.onclose?.();
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
