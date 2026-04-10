import {
	sortedEnabled,
	navOrder,
	pinnedSet,
	recentList,
	pushRecent,
	buildItem,
	buildGroupHeader,
	buildDivider,
	buildSectionLabel,
	healthMap,
} from '../../admin/src/modules/nav.js';

// Reset shared module-level state before every test so tests are isolated.
beforeEach( () => {
	navOrder.length = 0;
	pinnedSet.clear();
	recentList.length = 0;
	healthMap.clear();
} );

// ─── sortedEnabled ────────────────────────────────────────────────────────────

describe( 'sortedEnabled', () => {
	function makeMap( wares ) {
		return new Map( wares.map( ( w ) => [ w.slug, w ] ) );
	}

	test( 'returns only enabled wares', () => {
		const map = makeMap( [
			{ slug: 'crm', name: 'CRM', enabled: true },
			{ slug: 'kanban', name: 'Kanban', enabled: false },
		] );
		const result = sortedEnabled( map );
		expect( result ).toHaveLength( 1 );
		expect( result[ 0 ].slug ).toBe( 'crm' );
	} );

	test( 'sorts unpinned wares alphabetically by name', () => {
		const map = makeMap( [
			{ slug: 'zebra', name: 'Zebra App', enabled: true },
			{ slug: 'alpha', name: 'Alpha App', enabled: true },
			{ slug: 'mid', name: 'Mid App', enabled: true },
		] );
		const result = sortedEnabled( map );
		expect( result.map( ( w ) => w.slug ) ).toEqual( [
			'alpha',
			'mid',
			'zebra',
		] );
	} );

	test( 'places pinned wares before unpinned wares', () => {
		pinnedSet.add( 'zebra' );
		const map = makeMap( [
			{ slug: 'alpha', name: 'Alpha App', enabled: true },
			{ slug: 'zebra', name: 'Zebra App', enabled: true },
		] );
		const result = sortedEnabled( map );
		expect( result[ 0 ].slug ).toBe( 'zebra' );
		expect( result[ 1 ].slug ).toBe( 'alpha' );
	} );

	test( 'respects navOrder within unpinned group', () => {
		navOrder.push( 'crm', 'kanban', 'billing' );
		const map = makeMap( [
			{ slug: 'billing', name: 'Billing', enabled: true },
			{ slug: 'crm', name: 'CRM', enabled: true },
			{ slug: 'kanban', name: 'Kanban', enabled: true },
		] );
		const result = sortedEnabled( map );
		expect( result.map( ( w ) => w.slug ) ).toEqual( [
			'crm',
			'kanban',
			'billing',
		] );
	} );

	test( 'wares absent from navOrder come after ordered ones, sorted by name', () => {
		navOrder.push( 'crm' );
		const map = makeMap( [
			{ slug: 'zebra', name: 'Zebra', enabled: true },
			{ slug: 'alpha', name: 'Alpha', enabled: true },
			{ slug: 'crm', name: 'CRM', enabled: true },
		] );
		const result = sortedEnabled( map );
		expect( result[ 0 ].slug ).toBe( 'crm' );
		expect( result[ 1 ].slug ).toBe( 'alpha' );
		expect( result[ 2 ].slug ).toBe( 'zebra' );
	} );

	test( 'returns empty array when no enabled wares exist', () => {
		const map = makeMap( [ { slug: 'crm', name: 'CRM', enabled: false } ] );
		expect( sortedEnabled( map ) ).toHaveLength( 0 );
	} );
} );

// ─── pushRecent ───────────────────────────────────────────────────────────────

describe( 'pushRecent', () => {
	test( 'adds a slug to the front of the recent list', () => {
		pushRecent( 'crm' );
		expect( recentList[ 0 ] ).toBe( 'crm' );
	} );

	test( 'does not add the "manage" sentinel slug', () => {
		pushRecent( 'manage' );
		expect( recentList ).toHaveLength( 0 );
	} );

	test( 'deduplicates: moves existing slug to front', () => {
		pushRecent( 'a' );
		pushRecent( 'b' );
		pushRecent( 'a' );
		expect( recentList ).toEqual( [ 'a', 'b' ] );
	} );

	test( 'caps the list at 5 entries', () => {
		for ( let i = 0; i < 7; i++ ) {
			pushRecent( `ware-${ i }` );
		}
		expect( recentList ).toHaveLength( 5 );
		// Newest entry should be at the front.
		expect( recentList[ 0 ] ).toBe( 'ware-6' );
	} );
} );

// ─── buildItem ────────────────────────────────────────────────────────────────

describe( 'buildItem', () => {
	const badgeMap = new Map();

	test( 'returns an <li> with the ware slug in data-slug', () => {
		const li = buildItem(
			'crm',
			{ label: 'CRM' },
			null,
			badgeMap
		);
		expect( li.tagName ).toBe( 'LI' );
		expect( li.dataset.slug ).toBe( 'crm' );
	} );

	test( 'button inside li has data-slug attribute', () => {
		const li = buildItem( 'crm', { label: 'CRM' }, null, badgeMap );
		const btn = li.querySelector( 'button.bsh-nav__btn' );
		expect( btn ).not.toBeNull();
		expect( btn.dataset.slug ).toBe( 'crm' );
	} );

	test( 'active slug gets aria-current="page" on the button', () => {
		const li = buildItem( 'crm', { label: 'CRM' }, 'crm', badgeMap );
		const btn = li.querySelector( 'button.bsh-nav__btn' );
		expect( btn.getAttribute( 'aria-current' ) ).toBe( 'page' );
		expect( btn.classList.contains( 'bsh-nav__btn--active' ) ).toBe( true );
	} );

	test( 'inactive slug does not get aria-current', () => {
		const li = buildItem( 'kanban', { label: 'Kanban' }, 'crm', badgeMap );
		const btn = li.querySelector( 'button.bsh-nav__btn' );
		expect( btn.getAttribute( 'aria-current' ) ).toBeNull();
	} );

	test( 'label text is set on the label span', () => {
		const li = buildItem( 'crm', { label: 'My CRM' }, null, badgeMap );
		const lbl = li.querySelector( '.bsh-nav__label' );
		expect( lbl.textContent ).toBe( 'My CRM' );
	} );

	test( 'dev dot is added when devMode is true', () => {
		const li = buildItem( 'crm', { label: 'CRM', devMode: true }, null, badgeMap );
		expect( li.querySelector( '.bsh-nav__dev-dot' ) ).not.toBeNull();
	} );

	test( 'dev dot is absent when devMode is false', () => {
		const li = buildItem( 'crm', { label: 'CRM', devMode: false }, null, badgeMap );
		expect( li.querySelector( '.bsh-nav__dev-dot' ) ).toBeNull();
	} );

	test( 'badge is rendered for positive badge count', () => {
		const bm = new Map( [ [ 'crm', 5 ] ] );
		const li = buildItem( 'crm', { label: 'CRM' }, null, bm );
		const badge = li.querySelector( '.bsh-nav__badge' );
		expect( badge ).not.toBeNull();
		expect( badge.textContent ).toBe( '5' );
	} );

	test( 'badge shows "99+" for counts above 99', () => {
		const bm = new Map( [ [ 'crm', 150 ] ] );
		const li = buildItem( 'crm', { label: 'CRM' }, null, bm );
		expect( li.querySelector( '.bsh-nav__badge' ).textContent ).toBe( '99+' );
	} );

	test( 'no badge element when count is 0', () => {
		const bm = new Map( [ [ 'crm', 0 ] ] );
		const li = buildItem( 'crm', { label: 'CRM' }, null, bm );
		expect( li.querySelector( '.bsh-nav__badge' ) ).toBeNull();
	} );

	test( 'grouped modifier class is added when grouped is true', () => {
		const li = buildItem( 'crm', { label: 'CRM', grouped: true }, null, badgeMap );
		expect( li.classList.contains( 'bsh-nav__item--grouped' ) ).toBe( true );
	} );

	test( 'health dot is rendered for known health statuses', () => {
		healthMap.set( 'crm', 'warn' );
		const li = buildItem( 'crm', { label: 'CRM' }, null, badgeMap );
		const dot = li.querySelector( '.bsh-nav__health--warn' );
		expect( dot ).not.toBeNull();
	} );

	test( 'no health dot for "unknown" status', () => {
		healthMap.set( 'crm', 'unknown' );
		const li = buildItem( 'crm', { label: 'CRM' }, null, badgeMap );
		expect( li.querySelector( '[class*="bsh-nav__health"]' ) ).toBeNull();
	} );
} );

// ─── buildGroupHeader ────────────────────────────────────────────────────────

describe( 'buildGroupHeader', () => {
	test( 'creates an <li> containing a button with the group name', () => {
		const li = buildGroupHeader( 'Finance' );
		expect( li.tagName ).toBe( 'LI' );
		const btn = li.querySelector( 'button' );
		expect( btn ).not.toBeNull();
		expect( btn.querySelector( '.bsh-nav__group-name' ).textContent ).toBe(
			'Finance'
		);
	} );

	test( 'escapes HTML in the group name', () => {
		const li = buildGroupHeader( '<script>alert(1)</script>' );
		const btn = li.querySelector( 'button' );
		expect( btn.innerHTML ).not.toContain( '<script>' );
	} );
} );

// ─── buildDivider / buildSectionLabel ────────────────────────────────────────

describe( 'buildDivider', () => {
	test( 'creates an <li> with role="separator"', () => {
		const li = buildDivider();
		expect( li.tagName ).toBe( 'LI' );
		expect( li.getAttribute( 'role' ) ).toBe( 'separator' );
	} );
} );

describe( 'buildSectionLabel', () => {
	test( 'creates an <li> with the correct text content', () => {
		const li = buildSectionLabel( 'Recently Visited' );
		expect( li.textContent ).toBe( 'Recently Visited' );
		expect( li.getAttribute( 'role' ) ).toBe( 'presentation' );
	} );
} );
