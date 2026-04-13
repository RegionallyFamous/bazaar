/**
 * Tests for packages/client/src/store.ts — createStore() error paths and happy paths.
 *
 * Mocks the global fetch to simulate network conditions.
 */

import { createStore } from '../../packages/client/src/store.ts';

const mockConfig = {
	restUrl: 'https://example.com/wp-json',
	nonce: 'test-nonce',
};

function makeFetch( responses: Array<{ ok: boolean; status?: number; body?: unknown }> ) {
	let callIndex = 0;
	return jest.fn( async () => {
		const r = responses[ callIndex++ ] ?? { ok: true, body: null };
		const body = r.body;
		return {
			ok: r.ok,
			status: r.status ?? ( r.ok ? 200 : 500 ),
			json: async () => body,
			text: async () => JSON.stringify( body ),
		} as unknown as Response;
	} );
}

describe( 'createStore', () => {
	let fetchMock: jest.Mock;

	beforeEach( () => {
		fetchMock = jest.fn();
		global.fetch = fetchMock;
	} );

	afterEach( () => {
		jest.restoreAllMocks();
	} );

	// ─── get() ───────────────────────────────────────────────────────────────

	describe( 'get()', () => {
		it( 'returns the stored value on success', async () => {
			fetchMock = makeFetch( [ { ok: true, body: { key: 'theme', value: 'dark' } } ] );
			global.fetch = fetchMock;

			const store = createStore( 'board', mockConfig );
			const result = await store.get<string>( 'theme' );

			expect( result ).toBe( 'dark' );
		} );

		it( 'returns undefined when the key is absent (value is null)', async () => {
			fetchMock = makeFetch( [ { ok: true, body: { key: 'theme', value: null } } ] );
			global.fetch = fetchMock;

			const store = createStore( 'board', mockConfig );
			const result = await store.get( 'theme' );

			expect( result ).toBeNull();
		} );

		it( 'returns undefined on network error (swallows to avoid crashing callers)', async () => {
			fetchMock = jest.fn().mockRejectedValue( new Error( 'Network error' ) );
			global.fetch = fetchMock;

			const store = createStore( 'board', mockConfig );
			const result = await store.get( 'theme' );

			expect( result ).toBeUndefined();
		} );

		it( 'returns undefined on non-2xx HTTP response', async () => {
			fetchMock = makeFetch( [ { ok: false, status: 500 } ] );
			global.fetch = fetchMock;

			const store = createStore( 'board', mockConfig );
			const result = await store.get( 'theme' );

			// The internal req() throws on non-ok, which get() catches and returns undefined.
			expect( result ).toBeUndefined();
		} );

		it( 'sends X-WP-Nonce header', async () => {
			fetchMock = makeFetch( [ { ok: true, body: { key: 'x', value: 1 } } ] );
			global.fetch = fetchMock;

			const store = createStore( 'board', mockConfig );
			await store.get( 'x' );

			const [ , opts ] = fetchMock.mock.calls[ 0 ];
			expect( opts.headers[ 'X-WP-Nonce' ] ).toBe( 'test-nonce' );
		} );
	} );

	// ─── set() ───────────────────────────────────────────────────────────────

	describe( 'set()', () => {
		it( 'sends PUT with the serialised value', async () => {
			fetchMock = makeFetch( [ { ok: true, body: { key: 'count', value: 42 } } ] );
			global.fetch = fetchMock;

			const store = createStore( 'board', mockConfig );
			await store.set( 'count', 42 );

			const [ url, opts ] = fetchMock.mock.calls[ 0 ];
			expect( opts.method ).toBe( 'PUT' );
			expect( JSON.parse( opts.body as string ) ).toEqual( { value: 42 } );
			expect( url ).toContain( '/count' );
		} );

		it( 'throws on non-2xx response', async () => {
			fetchMock = makeFetch( [ { ok: false, status: 413 } ] );
			global.fetch = fetchMock;

			const store = createStore( 'board', mockConfig );
			await expect( store.set( 'big', 'x'.repeat( 1000 ) ) ).rejects.toThrow( '413' );
		} );
	} );

	// ─── del() ───────────────────────────────────────────────────────────────

	describe( 'del()', () => {
		it( 'sends DELETE request', async () => {
			fetchMock = makeFetch( [ { ok: true, body: { deleted: true } } ] );
			global.fetch = fetchMock;

			const store = createStore( 'board', mockConfig );
			await store.del( 'theme' );

			const [ , opts ] = fetchMock.mock.calls[ 0 ];
			expect( opts.method ).toBe( 'DELETE' );
		} );

		it( 'throws on non-2xx response', async () => {
			fetchMock = makeFetch( [ { ok: false, status: 500 } ] );
			global.fetch = fetchMock;

			const store = createStore( 'board', mockConfig );
			await expect( store.del( 'x' ) ).rejects.toThrow( '500' );
		} );
	} );

	// ─── keys() ──────────────────────────────────────────────────────────────

	describe( 'keys()', () => {
		it( 'returns the list from the server', async () => {
			fetchMock = makeFetch( [ { ok: true, body: [ 'theme', 'state' ] } ] );
			global.fetch = fetchMock;

			const store = createStore( 'board', mockConfig );
			const result = await store.keys();

			expect( result ).toEqual( [ 'theme', 'state' ] );
		} );
	} );
} );
