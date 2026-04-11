import {
	LruIframeManager,
	TrustAwareLruManager,
} from '../../admin/src/modules/lru.js';

let container;

beforeEach( () => {
	container = document.createElement( 'div' );
	document.body.appendChild( container );
} );

afterEach( () => {
	container.remove();
} );

describe( 'LruIframeManager', () => {
	describe( 'activate — new iframe', () => {
		test( 'creates and appends an iframe to the container', () => {
			const mgr = new LruIframeManager( container, 3 );
			mgr.activate( 'crm', 'http://localhost/crm' );
			expect( container.querySelectorAll( 'iframe' ).length ).toBe( 1 );
		} );

		test( 'sets the expected attributes on the iframe', () => {
			const mgr = new LruIframeManager( container, 3 );
			mgr.activate( 'crm', 'http://localhost/crm' );
			const iframe = container.querySelector( '#bsh-frame-crm' );
			expect( iframe ).not.toBeNull();
			expect( iframe.title ).toBe( 'crm' );
			expect( iframe.src ).toBe( 'http://localhost/crm' );
			expect( iframe.referrerPolicy ).toBe( 'same-origin' );
			expect( iframe.getAttribute( 'aria-hidden' ) ).toBe( 'true' );
		} );

		test( 'returns the created iframe element', () => {
			const mgr = new LruIframeManager( container, 3 );
			const f = mgr.activate( 'crm', 'http://localhost/crm' );
			expect( f ).toBeInstanceOf( HTMLIFrameElement );
			expect( f.title ).toBe( 'crm' );
		} );
	} );

	describe( 'activate — existing iframe', () => {
		test( 'returns the existing iframe without creating a new one', () => {
			const mgr = new LruIframeManager( container, 3 );
			mgr.activate( 'crm', 'http://localhost/crm' );
			mgr.activate( 'crm', 'http://localhost/crm' );
			expect( container.querySelectorAll( 'iframe' ).length ).toBe( 1 );
		} );

		test( 'hides all other iframes when re-activating', () => {
			const mgr = new LruIframeManager( container, 3 );
			mgr.activate( 'crm', 'http://localhost/crm' );
			mgr.activate( 'kanban', 'http://localhost/kanban' );
			// Activate crm again — kanban should become hidden.
			mgr.activate( 'crm', 'http://localhost/crm' );
			const kanban = container.querySelector( '#bsh-frame-kanban' );
			expect( kanban.classList.contains( 'bsh-iframe--visible' ) ).toBe(
				false
			);
		} );
	} );

	describe( 'LRU eviction', () => {
		test( 'evicts the least-recently-used iframe when at capacity', () => {
			const mgr = new LruIframeManager( container, 2 );
			mgr.activate( 'a', 'http://localhost/a' );
			mgr.activate( 'b', 'http://localhost/b' );
			// 'a' is LRU — adding 'c' should evict it.
			mgr.activate( 'c', 'http://localhost/c' );
			expect( container.querySelector( '#bsh-frame-a' ) ).toBeNull();
			expect( container.querySelector( '#bsh-frame-b' ) ).not.toBeNull();
			expect( container.querySelector( '#bsh-frame-c' ) ).not.toBeNull();
		} );

		test( 'touching an existing iframe updates its LRU position', () => {
			const mgr = new LruIframeManager( container, 2 );
			mgr.activate( 'a', 'http://localhost/a' );
			mgr.activate( 'b', 'http://localhost/b' );
			// Re-activate 'a' → now 'b' is the LRU.
			mgr.activate( 'a', 'http://localhost/a' );
			mgr.activate( 'c', 'http://localhost/c' );
			// 'b' should be evicted, not 'a'.
			expect( container.querySelector( '#bsh-frame-b' ) ).toBeNull();
			expect( container.querySelector( '#bsh-frame-a' ) ).not.toBeNull();
		} );
	} );

	describe( 'destroy', () => {
		test( 'removes the iframe from the DOM', () => {
			const mgr = new LruIframeManager( container, 3 );
			mgr.activate( 'crm', 'http://localhost/crm' );
			mgr.destroy( 'crm' );
			expect( container.querySelector( '#bsh-frame-crm' ) ).toBeNull();
		} );

		test( 'is a no-op for an unknown slug', () => {
			const mgr = new LruIframeManager( container, 3 );
			expect( () => mgr.destroy( 'nobody' ) ).not.toThrow();
		} );
	} );

	describe( 'reload', () => {
		test( 'resets iframe src to trigger a reload', () => {
			const mgr = new LruIframeManager( container, 3 );
			mgr.activate( 'crm', 'http://localhost/crm' );
			const iframe = container.querySelector( '#bsh-frame-crm' );
			mgr.reload( 'crm' );
			// After reload, src should be restored.
			expect( iframe.src ).toBe( 'http://localhost/crm' );
		} );

		test( 'is a no-op for an unknown slug', () => {
			const mgr = new LruIframeManager( container, 3 );
			expect( () => mgr.reload( 'nobody' ) ).not.toThrow();
		} );
	} );
} );

describe( 'TrustAwareLruManager sandbox attributes', () => {
	function sandboxFor( trust ) {
		const wareMap = new Map( [ [ 'test', { trust } ] ] );
		const mgr = new TrustAwareLruManager( container, 3, wareMap );
		mgr.activate( 'test', 'http://localhost/test' );
		return container.querySelector( '#bsh-frame-test' ).getAttribute( 'sandbox' );
	}

	test( 'standard trust includes allow-same-origin but not popup-escape', () => {
		const s = sandboxFor( 'standard' );
		expect( s ).toContain( 'allow-same-origin' );
		expect( s ).toContain( 'allow-scripts' );
		expect( s ).not.toContain( 'allow-popups-to-escape-sandbox' );
	} );

	test( 'verified trust includes allow-popups-to-escape-sandbox', () => {
		const s = sandboxFor( 'verified' );
		expect( s ).toContain( 'allow-popups-to-escape-sandbox' );
		expect( s ).toContain( 'allow-modals' );
	} );

	test( 'standard (default) trust includes allow-same-origin', () => {
		const s = sandboxFor( 'standard' );
		expect( s ).toContain( 'allow-same-origin' );
		expect( s ).not.toContain( 'allow-popups-to-escape-sandbox' );
	} );

	test( 'unknown trust level falls back to standard sandbox', () => {
		const s = sandboxFor( 'unknown-level' );
		expect( s ).toContain( 'allow-same-origin' );
	} );
} );
