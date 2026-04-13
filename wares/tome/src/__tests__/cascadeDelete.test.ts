import { describe, it, expect } from 'vitest';

// Local copy of getAllDescendantIds from App.tsx — pure function, no deps.
function getAllDescendantIds( id: string, pages: { id: string; parentId: string | null }[] ): string[] {
	const children = pages.filter( p => p.parentId === id ).map( p => p.id );
	return [ ...children, ...children.flatMap( cid => getAllDescendantIds( cid, pages ) ) ];
}

function p( id: string, parentId: string | null = null ) {
	return { id, parentId };
}

describe( 'getAllDescendantIds', () => {
	it( 'returns [] for a leaf page with no children', () => {
		const pages = [ p( 'a' ) ];
		expect( getAllDescendantIds( 'a', pages ) ).toEqual( [] );
	} );

	it( 'returns direct children', () => {
		const pages = [ p( 'a' ), p( 'b', 'a' ), p( 'c', 'a' ) ];
		const result = getAllDescendantIds( 'a', pages );
		expect( result.sort() ).toEqual( [ 'b', 'c' ] );
	} );

	it( 'returns grandchildren recursively', () => {
		const pages = [ p( 'a' ), p( 'b', 'a' ), p( 'c', 'b' ) ];
		const result = getAllDescendantIds( 'a', pages );
		expect( result.sort() ).toEqual( [ 'b', 'c' ] );
	} );

	it( 'returns all descendants in a 3-level tree', () => {
		const pages = [ p( 'root' ), p( 'child', 'root' ), p( 'grandchild', 'child' ), p( 'sibling', 'root' ) ];
		const result = getAllDescendantIds( 'root', pages );
		expect( result.sort() ).toEqual( [ 'child', 'grandchild', 'sibling' ] );
	} );

	it( 'deleting root removes all pages in hierarchy', () => {
		const pages = [ p( 'root' ), p( 'child', 'root' ), p( 'grandchild', 'child' ) ];
		const toRemove = new Set( [ 'root', ...getAllDescendantIds( 'root', pages ) ] );
		const remaining = pages.filter( pg => ! toRemove.has( pg.id ) );
		expect( remaining ).toHaveLength( 0 );
	} );

	it( 'does not include pages from unrelated subtrees', () => {
		const pages = [
			p( 'a' ), p( 'a1', 'a' ),
			p( 'b' ), p( 'b1', 'b' ),
		];
		const result = getAllDescendantIds( 'a', pages );
		expect( result ).not.toContain( 'b' );
		expect( result ).not.toContain( 'b1' );
	} );
} );
