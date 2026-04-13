import { describe, it, expect } from 'vitest';

// Local copy of buildTree from Sidebar.tsx — tests the algorithm in isolation.
interface Page { id: string; title: string; content: string; parentId: string | null; createdAt: string; updatedAt: string; }
interface TreeNode { page: Page; children: TreeNode[]; }

function buildTree( pages: Page[] ): TreeNode[] {
	const map   = new Map<string, TreeNode>();
	const roots: TreeNode[] = [];

	for ( const page of pages ) {
		map.set( page.id, { page, children: [] } );
	}

	const isAncestor = ( ancestorId: string, nodeId: string ): boolean => {
		let current: string | null = nodeId;
		const visited              = new Set<string>();
		while ( current !== null ) {
			if ( visited.has( current ) ) return false;
			visited.add( current );
			if ( current === ancestorId ) return true;
			current = map.get( current )?.page.parentId ?? null;
		}
		return false;
	};

	for ( const page of pages ) {
		const node = map.get( page.id )!;
		if ( page.parentId && map.has( page.parentId ) ) {
			if ( isAncestor( page.id, page.parentId ) ) {
				roots.push( node );
			} else {
				map.get( page.parentId )!.children.push( node );
			}
		} else {
			roots.push( node );
		}
	}

	return roots;
}

const now = new Date().toISOString();
function p( id: string, parentId: string | null = null ): Page {
	return { id, title: id, content: '', parentId, createdAt: now, updatedAt: now };
}

describe( 'buildTree', () => {
	it( 'returns empty array for empty input', () => {
		expect( buildTree( [] ) ).toEqual( [] );
	} );

	it( 'puts a page with parentId null at the root', () => {
		const roots = buildTree( [ p( 'a' ) ] );
		expect( roots ).toHaveLength( 1 );
		expect( roots[ 0 ]?.page.id ).toBe( 'a' );
	} );

	it( 'nests a child under its parent', () => {
		const roots = buildTree( [ p( 'a' ), p( 'b', 'a' ) ] );
		expect( roots ).toHaveLength( 1 );
		expect( roots[ 0 ]?.page.id ).toBe( 'a' );
		expect( roots[ 0 ]?.children ).toHaveLength( 1 );
		expect( roots[ 0 ]?.children[ 0 ]?.page.id ).toBe( 'b' );
	} );

	it( 'treats an orphan (parentId points to missing page) as a root', () => {
		const roots = buildTree( [ p( 'a', 'nonexistent' ) ] );
		expect( roots ).toHaveLength( 1 );
		expect( roots[ 0 ]?.page.id ).toBe( 'a' );
	} );

	it( 'handles a three-level hierarchy A → B → C', () => {
		const roots = buildTree( [ p( 'a' ), p( 'b', 'a' ), p( 'c', 'b' ) ] );
		expect( roots ).toHaveLength( 1 );
		expect( roots[ 0 ]?.page.id ).toBe( 'a' );
		expect( roots[ 0 ]?.children ).toHaveLength( 1 );
		expect( roots[ 0 ]?.children[ 0 ]?.page.id ).toBe( 'b' );
		expect( roots[ 0 ]?.children[ 0 ]?.children ).toHaveLength( 1 );
		expect( roots[ 0 ]?.children[ 0 ]?.children[ 0 ]?.page.id ).toBe( 'c' );
	} );

	it( 'handles two independent root pages each with a child', () => {
		const pages = [ p( 'r1' ), p( 'r2' ), p( 'c1', 'r1' ), p( 'c2', 'r2' ) ];
		const roots = buildTree( pages );
		expect( roots ).toHaveLength( 2 );
		const r1 = roots.find( n => n.page.id === 'r1' )!;
		const r2 = roots.find( n => n.page.id === 'r2' )!;
		expect( r1.children ).toHaveLength( 1 );
		expect( r2.children ).toHaveLength( 1 );
	} );

	it( 'CRITICAL: detects a 2-node cycle A→B→A and makes both roots', () => {
		// a.parentId = b, b.parentId = a — mutual cycle
		const a = { ...p( 'a' ), parentId: 'b' };
		const b = { ...p( 'b' ), parentId: 'a' };
		const roots = buildTree( [ a, b ] );
		expect( roots ).toHaveLength( 2 );
		const ids = roots.map( n => n.page.id ).sort();
		expect( ids ).toEqual( [ 'a', 'b' ] );
	} );

	it( 'CRITICAL: detects a 3-node cycle A→B→C→A and makes all three roots', () => {
		const a = { ...p( 'a' ), parentId: 'c' };
		const b = { ...p( 'b' ), parentId: 'a' };
		const c = { ...p( 'c' ), parentId: 'b' };
		const roots = buildTree( [ a, b, c ] );
		expect( roots ).toHaveLength( 3 );
		const ids = roots.map( n => n.page.id ).sort();
		expect( ids ).toEqual( [ 'a', 'b', 'c' ] );
	} );

	it( 'CRITICAL: self-cycle (parentId === own id) becomes root', () => {
		const a = { ...p( 'a' ), parentId: 'a' };
		const roots = buildTree( [ a ] );
		expect( roots ).toHaveLength( 1 );
		expect( roots[ 0 ]?.page.id ).toBe( 'a' );
	} );

	it( 'does not hang or throw on any cycle variant', () => {
		// Stress: long cycle of 10 nodes
		const nodes = Array.from( { length: 10 }, ( _, i ) => ( {
			...p( `n${ i }` ),
			parentId: `n${ ( i + 1 ) % 10 }`,
		} ) );
		expect( () => buildTree( nodes ) ).not.toThrow();
	} );
} );
