/**
 * Tests for packages/client/src/bus.ts — subscriber isolation, broadcast, and unsubscribe.
 *
 * The bus module registers a window.message listener at import time. Tests
 * simulate shell → ware messages by dispatching MessageEvents on window.
 */

import { bzr } from '../../packages/client/src/bus.ts';

/** Dispatch a fake shell→ware message. */
function dispatchShellMessage( payload: Record<string, unknown> ) {
	const event = new MessageEvent( 'message', {
		data: payload,
		origin: window.location.origin,
		source: window.parent as WindowProxy,
	} );
	window.dispatchEvent( event );
}

describe( 'bzr.on / subscriber isolation', () => {
	afterEach( () => {
		// Clean up any subscriptions added during the test by unsubscribing.
		// Each bzr.on() call returns an unsubscribe fn.
	} );

	it( 'subscriber receives event data', () => {
		const received: unknown[] = [];
		const unsub = bzr.on( 'test:ping', ( data ) => received.push( data ) );

		dispatchShellMessage( { type: 'bazaar:event', event: 'test:ping', data: { n: 1 } } );

		expect( received ).toEqual( [ { n: 1 } ] );
		unsub();
	} );

	it( 'one subscriber throwing must not prevent others from receiving the event', () => {
		const received: number[] = [];

		const unsub1 = bzr.on( 'test:multi', () => {
			throw new Error( 'subscriber 1 explodes' );
		} );
		const unsub2 = bzr.on( 'test:multi', () => received.push( 2 ) );
		const unsub3 = bzr.on( 'test:multi', () => received.push( 3 ) );

		// Should not throw even though subscriber 1 does.
		expect( () => {
			dispatchShellMessage( { type: 'bazaar:event', event: 'test:multi', data: null } );
		} ).not.toThrow();

		// Subscribers 2 and 3 must have received the event.
		expect( received ).toContain( 2 );
		expect( received ).toContain( 3 );

		unsub1();
		unsub2();
		unsub3();
	} );

	it( 'unsubscribe() removes the handler from future events', () => {
		const calls: number[] = [];
		const unsub = bzr.on( 'test:unsub', () => calls.push( 1 ) );

		dispatchShellMessage( { type: 'bazaar:event', event: 'test:unsub', data: null } );
		expect( calls ).toHaveLength( 1 );

		unsub();
		dispatchShellMessage( { type: 'bazaar:event', event: 'test:unsub', data: null } );
		expect( calls ).toHaveLength( 1 ); // No new call after unsub.
	} );

	it( 'multiple independent subscribers all receive the same event', () => {
		const a: unknown[] = [];
		const b: unknown[] = [];

		const unsubA = bzr.on( 'test:broadcast', ( d ) => a.push( d ) );
		const unsubB = bzr.on( 'test:broadcast', ( d ) => b.push( d ) );

		dispatchShellMessage( { type: 'bazaar:event', event: 'test:broadcast', data: 'hello' } );

		expect( a ).toEqual( [ 'hello' ] );
		expect( b ).toEqual( [ 'hello' ] );

		unsubA();
		unsubB();
	} );

	it( 'ignores messages from different origins', () => {
		const received: unknown[] = [];
		const unsub = bzr.on( 'test:origin', ( d ) => received.push( d ) );

		const event = new MessageEvent( 'message', {
			data: { type: 'bazaar:event', event: 'test:origin', data: 'bad' },
			origin: 'https://evil.example.com',
			source: window.parent as WindowProxy,
		} );
		window.dispatchEvent( event );

		expect( received ).toHaveLength( 0 );
		unsub();
	} );

	it( 'route events are dispatched via the __route__ handler', () => {
		const routes: unknown[] = [];
		const unsub = bzr.on( '__route__', ( r ) => routes.push( r ) );

		dispatchShellMessage( { type: 'bazaar:route', data: '/some/path' } );

		expect( routes ).toEqual( [ '/some/path' ] );
		unsub();
	} );
} );
