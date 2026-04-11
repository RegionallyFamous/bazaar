/**
 * Tests for inspector.js
 *
 * Covers XSS-prevention regressions: all dynamic values must be set via
 * textContent or safe DOM APIs, never via innerHTML interpolation.
 */

import { WareInspector } from '../../admin/src/modules/inspector.js';

let inspector;

beforeEach( () => {
	inspector = new WareInspector();
} );

afterEach( () => {
	inspector.panel.remove();
} );

// ─── Helpers ─────────────────────────────────────────────────────────────────

const XSS_PAYLOAD = '<img src=x onerror="window.__xss=1">';
const SCRIPT_PAYLOAD = '<script>window.__xss=1</script>';

function getPanel() {
	return inspector.panel;
}

// ─── Context section XSS ─────────────────────────────────────────────────────

describe( '_renderContext XSS prevention', () => {
	test( 'slug containing HTML is rendered as text, not markup', () => {
		inspector.show( XSS_PAYLOAD, {} );
		const text = getPanel().textContent;
		expect( text ).toContain( XSS_PAYLOAD );
		expect( getPanel().querySelector( 'img[onerror]' ) ).toBeNull();
		expect( window.__xss ).toBeUndefined();
	} );

	test( 'restUrl containing HTML is rendered as text', () => {
		inspector.show( 'safe-slug', { restUrl: XSS_PAYLOAD } );
		const text = getPanel().textContent;
		expect( text ).toContain( XSS_PAYLOAD );
		expect( getPanel().querySelector( 'img[onerror]' ) ).toBeNull();
	} );

	test( 'adminColor containing HTML is rendered as text', () => {
		inspector.show( 'safe-slug', { adminColor: XSS_PAYLOAD } );
		const text = getPanel().textContent;
		expect( text ).toContain( XSS_PAYLOAD );
		expect( getPanel().querySelector( 'img[onerror]' ) ).toBeNull();
	} );

	test( 'devUrl with https scheme produces a safe anchor', () => {
		inspector.show( 'safe-slug', { devUrl: 'https://localhost:5173' } );
		const a = getPanel().querySelector( 'a[href]' );
		expect( a ).not.toBeNull();
		expect( a.href ).toContain( 'localhost:5173' );
		expect( a.rel ).toContain( 'noopener' );
	} );

	test( 'devUrl with javascript: scheme is NOT rendered as an anchor', () => {
		inspector.show( 'safe-slug', { devUrl: 'javascript:alert(1)' } );
		// Must not create a clickable javascript: link.
		const a = getPanel().querySelector( 'a[href^="javascript:"]' );
		expect( a ).toBeNull();
	} );

	test( 'devUrl with data: scheme is NOT rendered as an anchor', () => {
		inspector.show( 'safe-slug', { devUrl: 'data:text/html,<h1>pwned</h1>' } );
		const a = getPanel().querySelector( 'a[href^="data:"]' );
		expect( a ).toBeNull();
	} );

	test( 'devUrl with HTML payload is rendered as text only', () => {
		inspector.show( 'safe-slug', { devUrl: SCRIPT_PAYLOAD } );
		// No script element should be injected into the DOM.
		expect( getPanel().querySelector( 'script' ) ).toBeNull();
		// The raw text should be visible as content.
		expect( getPanel().textContent ).toContain( SCRIPT_PAYLOAD );
	} );
} );

// ─── API calls section XSS ────────────────────────────────────────────────────

describe( '_renderApiCalls XSS prevention', () => {
	test( 'method field containing HTML is rendered as text', () => {
		inspector.show( 'slug', {} );
		inspector.onApiCall( {
			ts: Date.now(),
			method: XSS_PAYLOAD,
			path: '/wp-json/bazaar/v1/wares',
			status: 200,
		} );
		const panel = getPanel();
		expect( panel.querySelector( 'img[onerror]' ) ).toBeNull();
		expect( panel.textContent ).toContain( XSS_PAYLOAD );
	} );

	test( 'path field containing HTML is rendered as text', () => {
		inspector.show( 'slug', {} );
		inspector.onApiCall( {
			ts: Date.now(),
			method: 'GET',
			path: XSS_PAYLOAD,
			status: 200,
		} );
		const panel = getPanel();
		expect( panel.querySelector( 'img[onerror]' ) ).toBeNull();
	} );

	test( 'empty call list shows placeholder text', () => {
		inspector.show( 'slug', {} );
		const empty = getPanel().querySelector( '.bsh-inspector__empty' );
		expect( empty ).not.toBeNull();
		expect( empty.textContent ).toContain( 'No calls' );
	} );
} );

// ─── Bus logs section XSS ────────────────────────────────────────────────────

describe( '_renderBusLogs XSS prevention', () => {
	test( 'event name containing HTML is rendered as text', () => {
		inspector.show( 'slug', {} );
		inspector.onBusLog( {
			ts: Date.now(),
			dir: 'emit',
			event: XSS_PAYLOAD,
			data: null,
		} );
		const panel = getPanel();
		expect( panel.querySelector( 'img[onerror]' ) ).toBeNull();
		expect( panel.textContent ).toContain( XSS_PAYLOAD );
	} );

	test( 'emit direction shows up-arrow indicator', () => {
		inspector.show( 'slug', {} );
		inspector.onBusLog( { ts: Date.now(), dir: 'emit', event: 'my:event', data: null } );
		const code = getPanel().querySelector( '.bsh-inspector__log code' );
		expect( code?.textContent ).toContain( '\u2191' );
	} );

	test( 'recv direction shows down-arrow indicator', () => {
		inspector.show( 'slug', {} );
		inspector.onBusLog( { ts: Date.now(), dir: 'recv', event: 'my:event', data: null } );
		const code = getPanel().querySelector( '.bsh-inspector__log code' );
		expect( code?.textContent ).toContain( '\u2193' );
	} );
} );
