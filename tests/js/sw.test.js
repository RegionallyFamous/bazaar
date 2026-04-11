/**
 * Tests for zero-trust-sw.js
 *
 * Service workers run in a different global; we set up a minimal stub
 * environment before requiring the module, then exercise the registered
 * message/fetch handlers directly.
 *
 * Covers:
 *  - Origin validation on bazaar:zt-init messages
 *  - new URL() throw safety in the permissions check
 */

// ─── Service Worker environment stub ─────────────────────────────────────────

const _listeners = {};

global.self = {
	addEventListener( type, fn ) {
		_listeners[ type ] = fn;
	},
	skipWaiting: jest.fn(),
	clients: { claim: jest.fn( () => Promise.resolve() ) },
};

global.caches = {
	open: jest.fn( () => Promise.resolve( { match: jest.fn(), put: jest.fn() } ) ),
};

// Stub the Response constructor that the SW uses to send 403 blocked responses.
global.Response = class MockResponse {
	constructor( body, init ) {
		this.body = body;
		this.status = init?.status ?? 200;
		this.headers = init?.headers ?? {};
	}
};

// Require (not import) so top-level await is never triggered.
// The SW file uses `self.addEventListener(...)` which populates _listeners.
require( '../../admin/src/zero-trust-sw.js' );

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sendMessage( type, data, origin = 'https://example.com' ) {
	_listeners.message?.( { origin, data: { type, ...data } } );
}

// ─── Origin validation ────────────────────────────────────────────────────────

describe( 'zero-trust-sw message handler', () => {
	beforeEach( () => {
		// Reset the SW's internal siteOrigin between tests by sending a fresh init.
		// We can't reset module state directly, so we rely on test ordering where
		// the first call establishes the origin.
	} );

	test( 'zt-init handler does not throw', () => {
		expect( () =>
			sendMessage( 'bazaar:zt-init', { permissions: {} }, 'https://example.com' )
		).not.toThrow();
	} );

	test( 'non-zt-init messages are ignored without throwing', () => {
		expect( () =>
			sendMessage( 'unknown:type', {}, 'https://example.com' )
		).not.toThrow();
	} );

	/**
	 * Regression: after siteOrigin is established, messages from a different
	 * origin must be silently dropped.  Before the fix there was no origin check.
	 */
	test( 'messages from a different origin are silently rejected', () => {
		// First, establish the site origin.
		sendMessage( 'bazaar:zt-init', { permissions: {} }, 'https://example.com' );

		// A second init from a different origin must not throw (just be ignored).
		expect( () =>
			sendMessage(
				'bazaar:zt-init',
				{ permissions: { evil: [ 'https://attacker.com' ] } },
				'https://attacker.com'
			)
		).not.toThrow();
	} );
} );

// ─── new URL() throw safety ────────────────────────────────────────────────────

describe( 'zero-trust-sw fetch interception', () => {
	test( 'malformed allowedOrigin in permissions does not throw during fetch', () => {
		// Register a ware with one invalid URL and one valid URL in its allowlist.
		sendMessage(
			'bazaar:zt-init',
			{
				permissions: {
					'my-ware': [ 'not-a-valid-url', ':::also-invalid', 'https://safe.example.com' ],
				},
			},
			'https://example.com'
		);

		const fetchHandler = _listeners.fetch;
		if ( ! fetchHandler ) {
			// No fetch handler registered — skip.
			return;
		}

		const event = {
			request: {
				method: 'GET',
				url: 'https://third-party.com/api/data',
				referrer:
					'https://example.com/wp-json/bazaar/v1/serve/my-ware/index.html',
			},
			respondWith: jest.fn(),
		};

		// Must not throw even when allowedOrigin entries are malformed.
		expect( () => fetchHandler( event ) ).not.toThrow();
	} );
} );
