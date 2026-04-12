import {
	showError,
	dismissError,
	dismissAll,
} from '../../admin/src/modules/errors.js';

let mainEl;
let reloadMock;

beforeEach( () => {
	mainEl = document.createElement( 'main' );
	mainEl.id = 'bsh-main';
	document.body.appendChild( mainEl );
	reloadMock = jest.fn();
} );

afterEach( () => {
	mainEl.remove();
} );

// ─── showError ───────────────────────────────────────────────────────────────

describe( 'showError', () => {
	test( 'appends an overlay element to the main container', () => {
		showError( 'crm', 'Something broke', null, mainEl, reloadMock );
		expect( mainEl.querySelectorAll( '.bsh-error-overlay' ) ).toHaveLength( 1 );
	} );

	test( 'overlay has role="alert"', () => {
		showError( 'crm', 'Something broke', null, mainEl, reloadMock );
		const overlay = mainEl.querySelector( '.bsh-error-overlay' );
		expect( overlay.getAttribute( 'role' ) ).toBe( 'alert' );
	} );

	test( 'overlay contains the error message', () => {
		showError( 'crm', 'Disk quota exceeded', null, mainEl, reloadMock );
		const msg = mainEl.querySelector( '.bsh-error-overlay__message' );
		expect( msg.textContent ).toBe( 'Disk quota exceeded' );
	} );

	test( 'overlay includes slug in title', () => {
		showError( 'crm', 'Error', null, mainEl, reloadMock );
		const title = mainEl.querySelector( '.bsh-error-overlay__title' );
		expect( title.textContent ).toContain( 'crm' );
	} );

	test( 'shows stack trace in <details> when stack is provided', () => {
		showError( 'crm', 'Error', 'at foo:1:1\nat bar:2:2', mainEl, reloadMock );
		const details = mainEl.querySelector( '.bsh-error-overlay__details' );
		expect( details ).not.toBeNull();
		const pre = details.querySelector( '.bsh-error-overlay__stack' );
		expect( pre.textContent ).toContain( 'at foo:1:1' );
	} );

	test( 'no stack trace section when stack is null', () => {
		showError( 'crm', 'Error', null, mainEl, reloadMock );
		expect( mainEl.querySelector( '.bsh-error-overlay__details' ) ).toBeNull();
	} );

	test( 'replaces existing overlay for the same slug', () => {
		showError( 'crm', 'First error', null, mainEl, reloadMock );
		showError( 'crm', 'Second error', null, mainEl, reloadMock );
		expect( mainEl.querySelectorAll( '.bsh-error-overlay' ) ).toHaveLength( 1 );
		expect(
			mainEl.querySelector( '.bsh-error-overlay__message' ).textContent
		).toBe( 'Second error' );
	} );

	test( 'dismiss button removes the overlay', () => {
		showError( 'crm', 'Error', null, mainEl, reloadMock );
		const dismissBtn = mainEl.querySelector(
			'.bsh-error-overlay__btn:not(.bsh-error-overlay__btn--primary)'
		);
		dismissBtn.click();
		expect( mainEl.querySelector( '.bsh-error-overlay' ) ).toBeNull();
	} );

	test( 'reload button calls onReload with the slug', () => {
		showError( 'crm', 'Error', null, mainEl, reloadMock );
		const reloadBtn = mainEl.querySelector(
			'.bsh-error-overlay__btn--primary'
		);
		reloadBtn.click();
		expect( reloadMock ).toHaveBeenCalledWith( 'crm' );
	} );

	test( 'reload button also dismisses the overlay', () => {
		showError( 'crm', 'Error', null, mainEl, reloadMock );
		const reloadBtn = mainEl.querySelector(
			'.bsh-error-overlay__btn--primary'
		);
		reloadBtn.click();
		expect( mainEl.querySelector( '.bsh-error-overlay' ) ).toBeNull();
	} );

	test( 'multiple slugs produce separate overlays', () => {
		showError( 'crm', 'Error A', null, mainEl, reloadMock );
		showError( 'board', 'Error B', null, mainEl, reloadMock );
		expect( mainEl.querySelectorAll( '.bsh-error-overlay' ) ).toHaveLength( 2 );
	} );

	test( 'falls back to "Unknown error" when message is null', () => {
		showError( 'crm', null, null, mainEl, reloadMock );
		const msg = mainEl.querySelector( '.bsh-error-overlay__message' );
		expect( msg.textContent ).toBe( 'Unknown error' );
	} );
} );

// ─── dismissError ────────────────────────────────────────────────────────────

describe( 'dismissError', () => {
	test( 'removes the overlay for the given slug', () => {
		showError( 'crm', 'Error', null, mainEl, reloadMock );
		dismissError( 'crm' );
		expect( mainEl.querySelector( '.bsh-error-overlay' ) ).toBeNull();
	} );

	test( 'only removes the overlay for the specified slug', () => {
		showError( 'crm', 'Error A', null, mainEl, reloadMock );
		showError( 'board', 'Error B', null, mainEl, reloadMock );
		dismissError( 'crm' );
		expect( mainEl.querySelector( '.bsh-error-overlay[data-slug="board"]' ) ).not.toBeNull();
		expect( mainEl.querySelector( '.bsh-error-overlay[data-slug="crm"]' ) ).toBeNull();
	} );

	test( 'is a no-op for an unknown slug', () => {
		expect( () => dismissError( 'nobody' ) ).not.toThrow();
	} );
} );

// ─── dismissAll ──────────────────────────────────────────────────────────────

describe( 'dismissAll', () => {
	test( 'removes all overlays', () => {
		showError( 'crm', 'Error A', null, mainEl, reloadMock );
		showError( 'board', 'Error B', null, mainEl, reloadMock );
		dismissAll();
		expect( mainEl.querySelectorAll( '.bsh-error-overlay' ) ).toHaveLength( 0 );
	} );

	test( 'is safe to call when no overlays are active', () => {
		expect( () => dismissAll() ).not.toThrow();
	} );
} );
