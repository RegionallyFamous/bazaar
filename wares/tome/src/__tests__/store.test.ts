import { vi, describe, it, expect, beforeEach } from 'vitest';

const memStore = vi.hoisted( () => new Map<string, unknown>() );

vi.mock( '@bazaar/client', () => ( {
	createWaredStore: () => ( {
		async load<T>( key: string ): Promise<T | undefined> {
			return memStore.get( key ) as T | undefined;
		},
		async save( key: string, value: unknown ): Promise<void> {
			memStore.set( key, value );
		},
	} ),
	bzr:             { toast: vi.fn(), on: vi.fn( () => vi.fn() ), emit: vi.fn() },
	getBazaarContext: vi.fn( () => { throw new Error( 'no context' ); } ),
} ) );

beforeEach( () => memStore.clear() );

import { loadPages, savePages, newPage } from '../store.ts';
import type { Page } from '../types.ts';

function makePage( overrides: Partial<Page> = {} ): Page {
	const now = new Date().toISOString();
	return {
		id:        'p_test',
		title:     'Test Page',
		content:   '# Hello',
		parentId:  null,
		createdAt: now,
		updatedAt: now,
		...overrides,
	};
}

describe( 'loadPages', () => {
	it( 'returns [] when the store is empty', async () => {
		const pages = await loadPages();
		expect( pages ).toEqual( [] );
	} );

	it( 'filters out entries missing id', async () => {
		memStore.set( 'pages', [ { title: 'no id', content: '', parentId: null } ] );
		const pages = await loadPages();
		expect( pages ).toHaveLength( 0 );
	} );

	it( 'filters out entries missing title', async () => {
		memStore.set( 'pages', [ { id: 'p_1', content: '', parentId: null } ] );
		const pages = await loadPages();
		expect( pages ).toHaveLength( 0 );
	} );

	it( 'filters out entries missing parentId key', async () => {
		memStore.set( 'pages', [ { id: 'p_1', title: 'No parentId' } ] );
		const pages = await loadPages();
		expect( pages ).toHaveLength( 0 );
	} );

	it( 'passes through a valid page', async () => {
		const page = makePage( { id: 'p_valid' } );
		memStore.set( 'pages', [ page ] );
		const pages = await loadPages();
		expect( pages ).toHaveLength( 1 );
		expect( pages[ 0 ]?.id ).toBe( 'p_valid' );
	} );
} );

describe( 'savePages + loadPages round-trip', () => {
	it( 'stores and retrieves the same pages', async () => {
		const page = makePage( { id: 'p_rt', title: 'Round-trip' } );
		await savePages( [ page ] );
		const loaded = await loadPages();
		expect( loaded ).toHaveLength( 1 );
		expect( loaded[ 0 ] ).toEqual( page );
	} );

	it( 'preserves multiple pages in order', async () => {
		const a = makePage( { id: 'p_a', title: 'A' } );
		const b = makePage( { id: 'p_b', title: 'B', parentId: 'p_a' } );
		await savePages( [ a, b ] );
		const loaded = await loadPages();
		expect( loaded ).toHaveLength( 2 );
		expect( loaded[ 0 ]?.id ).toBe( 'p_a' );
		expect( loaded[ 1 ]?.id ).toBe( 'p_b' );
	} );
} );

describe( 'newPage', () => {
	it( 'returns a page with parentId null by default', () => {
		const page = newPage();
		expect( page.parentId ).toBeNull();
	} );

	it( 'returns a page with parentId null when explicitly passed null', () => {
		const page = newPage( null );
		expect( page.parentId ).toBeNull();
	} );

	it( 'returns a page with the given parentId', () => {
		const page = newPage( 'p_123' );
		expect( page.parentId ).toBe( 'p_123' );
	} );

	it( 'sets title to "Untitled"', () => {
		const page = newPage();
		expect( page.title ).toBe( 'Untitled' );
	} );

	it( 'sets content to an empty string', () => {
		const page = newPage();
		expect( page.content ).toBe( '' );
	} );

	it( 'sets a non-empty id starting with "p_"', () => {
		const page = newPage();
		expect( page.id ).toMatch( /^p_/ );
	} );

	it( 'returns unique ids on successive calls', () => {
		let t = 1_000_000;
		vi.spyOn( Date, 'now' ).mockImplementation( () => t++ );
		const ids = new Set( Array.from( { length: 10 }, () => newPage().id ) );
		vi.restoreAllMocks();
		expect( ids.size ).toBe( 10 );
	} );
} );
