/**
 * Tests for admin/src/modules/home.js
 *
 * Covers:
 *  - First-run flow: welcome screen shown when bazaar.welcomed absent
 *  - Normal flow: home grid shown when bazaar.welcomed is set
 *  - recordOpen() milestone tracking (skips 'home' and 'manage')
 *  - addWidget() registers widget data and triggers a re-render
 *  - Getting Started card visibility rules (dismiss, auto-complete)
 */

import { HomeScreen } from '../../admin/src/modules/home.js';

// ─── localStorage reset between tests ─────────────────────────────────────────

const LS_WELCOMED = 'bazaar.welcomed';
const LS_GS_DONE  = 'bazaar.gs.done';
const LS_GS_OPENED = 'bazaar.gs.opened';

beforeEach( () => {
	localStorage.clear();
} );

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeWare( slug, overrides = {} ) {
	return { slug, name: slug, menu_title: slug, enabled: true, description: '', ...overrides };
}

function makeDeps( wareMap = new Map(), overrides = {} ) {
	return {
		wareMap,
		navigateTo:    jest.fn(),
		iconUrl:       jest.fn( () => '' ),
		sortedEnabled: jest.fn( ( map ) => [ ...map.values() ].filter( ( w ) => w.enabled ) ),
		badgeMap:      new Map(),
		pinnedSet:     new Set(),
		restUrl:       'http://example.com/wp-json/bazaar/v1',
		apiFetch:      jest.fn( () => Promise.resolve( { ok: false } ) ),
		onWareInstalled: jest.fn(),
		...overrides,
	};
}

function mountScreen( deps ) {
	const screen = new HomeScreen( deps );
	const panel = document.createElement( 'div' );
	screen.mount( panel );
	return { screen, panel };
}

// ─── Welcome screen ───────────────────────────────────────────────────────────

describe( 'HomeScreen — first-run welcome', () => {
	test( 'renders welcome wrapper when bazaar.welcomed is absent', () => {
		const { panel } = mountScreen( makeDeps() );
		expect( panel.querySelector( '.bsh-welcome' ) ).not.toBeNull();
	} );

	test( 'does NOT render home grid on first run', () => {
		const { panel } = mountScreen( makeDeps() );
		expect( panel.querySelector( '.bsh-home__section' ) ).toBeNull();
	} );

	test( 'skip button sets bazaar.welcomed and re-renders to home', () => {
		const { panel } = mountScreen( makeDeps() );
		const skip = panel.querySelector( '.bsh-welcome__skip' );
		expect( skip ).not.toBeNull();

		skip.click();

		expect( localStorage.getItem( LS_WELCOMED ) ).toBe( '1' );
		// After skip, the welcome wrapper should be gone.
		expect( panel.querySelector( '.bsh-welcome' ) ).toBeNull();
	} );
} );

// ─── Normal home screen ───────────────────────────────────────────────────────

describe( 'HomeScreen — normal home', () => {
	test( 'renders "All Wares" section when welcomed', () => {
		localStorage.setItem( LS_WELCOMED, '1' );
		const wareMap = new Map( [ [ 'crm', makeWare( 'crm' ) ] ] );
		const { panel } = mountScreen( makeDeps( wareMap ) );
		expect( panel.querySelector( '.bsh-home__section' ) ).not.toBeNull();
	} );

	test( 'renders empty state when no enabled wares', () => {
		localStorage.setItem( LS_WELCOMED, '1' );
		const { panel } = mountScreen( makeDeps() );
		expect( panel.querySelector( '.bsh-home__empty' ) ).not.toBeNull();
	} );

	test( 'empty state CTA navigates to manage', () => {
		localStorage.setItem( LS_WELCOMED, '1' );
		const deps = makeDeps();
		const { panel } = mountScreen( deps );
		const cta = panel.querySelector( '.bsh-home__empty-cta' );
		cta.click();
		expect( deps.navigateTo ).toHaveBeenCalledWith( 'manage' );
	} );

	test( 'renders one card per enabled ware', () => {
		localStorage.setItem( LS_WELCOMED, '1' );
		const wareMap = new Map( [
			[ 'crm',   makeWare( 'crm' ) ],
			[ 'board', makeWare( 'board' ) ],
			[ 'flow',  makeWare( 'flow', { enabled: false } ) ],
		] );
		const { panel } = mountScreen( makeDeps( wareMap ) );
		const cards = panel.querySelectorAll( '.bsh-home__card' );
		// Only two enabled wares.
		expect( cards ).toHaveLength( 2 );
	} );

	test( 'card click navigates to ware slug', () => {
		localStorage.setItem( LS_WELCOMED, '1' );
		const wareMap = new Map( [ [ 'crm', makeWare( 'crm' ) ] ] );
		const deps = makeDeps( wareMap );
		const { panel } = mountScreen( deps );
		panel.querySelector( '.bsh-home__card' ).click();
		expect( deps.navigateTo ).toHaveBeenCalledWith( 'crm' );
	} );

	test( 'renders pinned row when pinnedSet has an enabled ware', () => {
		localStorage.setItem( LS_WELCOMED, '1' );
		const wareMap = new Map( [ [ 'crm', makeWare( 'crm' ) ] ] );
		const deps = makeDeps( wareMap, { pinnedSet: new Set( [ 'crm' ] ) } );
		const { panel } = mountScreen( deps );
		expect( panel.querySelector( '.bsh-home__pinned' ) ).not.toBeNull();
	} );
} );

// ─── recordOpen ───────────────────────────────────────────────────────────────

describe( 'HomeScreen.recordOpen()', () => {
	test( 'sets bazaar.gs.opened for a normal ware slug', () => {
		localStorage.setItem( LS_WELCOMED, '1' );
		const { screen } = mountScreen( makeDeps() );

		screen.recordOpen( 'crm' );

		expect( localStorage.getItem( LS_GS_OPENED ) ).toBe( '1' );
	} );

	test( 'does not set bazaar.gs.opened for "home"', () => {
		const { screen } = mountScreen( makeDeps() );
		screen.recordOpen( 'home' );
		expect( localStorage.getItem( LS_GS_OPENED ) ).toBeNull();
	} );

	test( 'does not set bazaar.gs.opened for "manage"', () => {
		const { screen } = mountScreen( makeDeps() );
		screen.recordOpen( 'manage' );
		expect( localStorage.getItem( LS_GS_OPENED ) ).toBeNull();
	} );
} );

// ─── addWidget ────────────────────────────────────────────────────────────────

describe( 'HomeScreen.addWidget()', () => {
	test( 'stores widget data and triggers re-render', () => {
		localStorage.setItem( LS_WELCOMED, '1' );
		const wareMap = new Map( [ [ 'crm', makeWare( 'crm' ) ] ] );
		const deps = makeDeps( wareMap );
		const { screen, panel } = mountScreen( deps );

		// No widget tiles yet.
		expect( panel.querySelector( '.bsh-home__widgets' ) ).toBeNull();

		screen.addWidget( 'crm', { count: 5, label: 'tasks' } );

		// After addWidget the home should re-render with the widget row.
		expect( panel.querySelector( '.bsh-home__widgets' ) ).not.toBeNull();
		expect( panel.querySelector( '.bsh-home__widget-count' )?.textContent ).toBe( '5' );
		expect( panel.querySelector( '.bsh-home__widget-label' )?.textContent ).toBe( 'tasks' );
	} );

	test( 'truncates counts above 9999 to "9999+"', () => {
		localStorage.setItem( LS_WELCOMED, '1' );
		const wareMap = new Map( [ [ 'crm', makeWare( 'crm' ) ] ] );
		const { screen, panel } = mountScreen( makeDeps( wareMap ) );

		screen.addWidget( 'crm', { count: 10_000 } );

		expect( panel.querySelector( '.bsh-home__widget-count' )?.textContent ).toBe( '9999+' );
	} );

	test( 'ignores widgets for disabled wares', () => {
		localStorage.setItem( LS_WELCOMED, '1' );
		const wareMap = new Map( [ [ 'off', makeWare( 'off', { enabled: false } ) ] ] );
		const { screen, panel } = mountScreen( makeDeps( wareMap ) );

		screen.addWidget( 'off', { count: 3 } );

		expect( panel.querySelector( '.bsh-home__widgets' ) ).toBeNull();
	} );
} );

// ─── Getting Started card ─────────────────────────────────────────────────────

describe( 'HomeScreen — Getting Started card', () => {
	test( 'shown when no milestones are complete', () => {
		localStorage.setItem( LS_WELCOMED, '1' );
		const { panel } = mountScreen( makeDeps() );
		expect( panel.querySelector( '.bsh-gs' ) ).not.toBeNull();
	} );

	test( 'hidden when LS_GS_DONE is set', () => {
		localStorage.setItem( LS_WELCOMED, '1' );
		localStorage.setItem( LS_GS_DONE, '1' );
		const { panel } = mountScreen( makeDeps() );
		expect( panel.querySelector( '.bsh-gs' ) ).toBeNull();
	} );

	test( 'auto-dismissed when both milestones complete', () => {
		localStorage.setItem( LS_WELCOMED, '1' );
		localStorage.setItem( LS_GS_OPENED, '1' );
		const wareMap = new Map( [ [ 'crm', makeWare( 'crm' ) ] ] );
		const { panel } = mountScreen( makeDeps( wareMap ) );
		// Both hasWare and hasOpened are true — card should be absent.
		expect( panel.querySelector( '.bsh-gs' ) ).toBeNull();
		// And the done flag should now be persisted.
		expect( localStorage.getItem( LS_GS_DONE ) ).toBe( '1' );
	} );

	test( 'dismiss button sets LS_GS_DONE', () => {
		localStorage.setItem( LS_WELCOMED, '1' );
		const { panel } = mountScreen( makeDeps() );

		const dismiss = panel.querySelector( '.bsh-gs__dismiss' );
		expect( dismiss ).not.toBeNull();
		dismiss.click();

		expect( localStorage.getItem( LS_GS_DONE ) ).toBe( '1' );
	} );

	test( 'progress label reflects zero complete steps', () => {
		localStorage.setItem( LS_WELCOMED, '1' );
		const { panel } = mountScreen( makeDeps() );
		const label = panel.querySelector( '.bsh-gs__progress-label' );
		expect( label?.textContent ).toMatch( /0\s*\/\s*2/ );
	} );

	test( 'progress label reflects one complete step', () => {
		localStorage.setItem( LS_WELCOMED, '1' );
		const wareMap = new Map( [ [ 'crm', makeWare( 'crm' ) ] ] );
		const { panel } = mountScreen( makeDeps( wareMap ) );
		const label = panel.querySelector( '.bsh-gs__progress-label' );
		expect( label?.textContent ).toMatch( /1\s*\/\s*2/ );
	} );
} );

// ─── refresh ──────────────────────────────────────────────────────────────────

describe( 'HomeScreen.refresh()', () => {
	test( 'is a no-op before mount', () => {
		const screen = new HomeScreen( makeDeps() );
		expect( () => screen.refresh() ).not.toThrow();
	} );

	test( 're-renders after mount when wareMap changes externally', () => {
		localStorage.setItem( LS_WELCOMED, '1' );
		const wareMap = new Map();
		const deps = makeDeps( wareMap );
		const { screen, panel } = mountScreen( deps );

		// Initially no wares → empty state.
		expect( panel.querySelector( '.bsh-home__empty' ) ).not.toBeNull();

		// Simulate a ware being registered externally.
		wareMap.set( 'crm', makeWare( 'crm' ) );
		screen.refresh();

		// Now the grid should appear, empty state gone.
		expect( panel.querySelector( '.bsh-home__empty' ) ).toBeNull();
		expect( panel.querySelector( '.bsh-home__section' ) ).not.toBeNull();
	} );
} );
