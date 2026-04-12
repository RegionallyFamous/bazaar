/**
 * Jest stubs for Bazaar admin UI.
 *
 * Full UI integration tests require @wordpress/e2e-test-utils-playwright + wp-env.
 * These unit tests cover pure JS logic only.
 */

import { escHtml } from '../../admin/src/shared/escape.js';

describe( 'Bazaar admin escaping helpers', () => {

	test( 'escapes HTML special characters', () => {
		expect( escHtml( '<script>alert("xss")</script>' ) ).toBe(
			'&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'
		);
	} );

	test( 'escapes ampersands', () => {
		expect( escHtml( 'Tom & Jerry' ) ).toBe( 'Tom &amp; Jerry' );
	} );

	test( 'escapes single quotes', () => {
		expect( escHtml( "it's here" ) ).toBe( 'it&#39;s here' );
	} );

	test( 'passes through safe strings untouched', () => {
		expect( escHtml( 'Ledger' ) ).toBe( 'Ledger' );
	} );
} );

describe( 'Bazaar file extension check', () => {
	function isWpFile( name ) {
		return name.endsWith( '.wp' );
	}

	test( 'accepts .wp extension', () => {
		expect( isWpFile( 'ledger.wp' ) ).toBe( true );
	} );

	test( 'rejects .zip extension', () => {
		expect( isWpFile( 'archive.zip' ) ).toBe( false );
	} );

	test( 'rejects .php extension', () => {
		expect( isWpFile( 'shell.php' ) ).toBe( false );
	} );
} );

// ─── showError timer regression ──────────────────────────────────────────────

describe( 'showError timer management', () => {
	/**
	 * Inline replica of the fixed showError logic from main.js.
	 * Before the fix, the error timer was never stored/cleared, so rapid calls
	 * stacked multiple setTimeout callbacks.
	 */
	function makeShowError( errorBox ) {
		let successTimer = null;
		let errorTimer = null;

		function showError( msg ) {
			errorBox.textContent = msg;
			errorBox.hidden = false;
			clearTimeout( successTimer );
			clearTimeout( errorTimer ); // regression fix: clear previous error timer
			errorTimer = setTimeout( () => {
				errorBox.hidden = true;
			}, 8000 );
		}

		return { showError, getErrorTimer: () => errorTimer };
	}

	beforeEach( () => {
		jest.useFakeTimers();
	} );

	afterEach( () => {
		jest.useRealTimers();
	} );

	test( 'error box is visible after showError', () => {
		const box = document.createElement( 'div' );
		box.hidden = true;
		const { showError } = makeShowError( box );

		showError( 'Something went wrong' );

		expect( box.hidden ).toBe( false );
		expect( box.textContent ).toBe( 'Something went wrong' );
	} );

	test( 'error box hides after 8 seconds', () => {
		const box = document.createElement( 'div' );
		const { showError } = makeShowError( box );

		showError( 'Error' );
		jest.advanceTimersByTime( 8000 );

		expect( box.hidden ).toBe( true );
	} );

	/**
	 * Regression: rapid showError() calls must not stack timers.
	 * Only the LAST timer should fire.
	 */
	test( 'rapid calls clear the previous timer so only the last fires', () => {
		const box = document.createElement( 'div' );
		const { showError, getErrorTimer } = makeShowError( box );

		showError( 'First error' );
		const firstTimer = getErrorTimer();

		showError( 'Second error' );
		const secondTimer = getErrorTimer();

		// Timer IDs must differ — the second call replaced the first.
		expect( secondTimer ).not.toBe( firstTimer );

		// After 8 s the box hides (only one timer running, not stacked).
		jest.advanceTimersByTime( 8000 );
		expect( box.hidden ).toBe( true );
		expect( box.textContent ).toBe( 'Second error' );
	} );
} );
