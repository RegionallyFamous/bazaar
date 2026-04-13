import { vi, describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock( '@bazaar/client', () => ( {
	createStore: vi.fn( () => ( {
		get:   vi.fn().mockResolvedValue( undefined ),
		set:   vi.fn().mockResolvedValue( undefined ),
		del:   vi.fn().mockResolvedValue( undefined ),
		keys:  vi.fn().mockResolvedValue( [] ),
		clear: vi.fn().mockResolvedValue( undefined ),
	} ) ),
	bzr: { toast: vi.fn(), on: vi.fn( () => vi.fn() ), emit: vi.fn() },
	getBazaarContext: vi.fn( () => { throw new Error( 'no context' ); } ),
	createWaredStore: vi.fn( () => ( {
		load: vi.fn().mockResolvedValue( undefined ),
		save: vi.fn().mockResolvedValue( undefined ),
	} ) ),
} ) );

// jsdom doesn't implement HTMLCanvasElement.prototype.getContext
beforeEach( () => {
	Object.defineProperty( HTMLCanvasElement.prototype, 'getContext', {
		value: vi.fn( () => ( {
			putImageData:    vi.fn(),
			createImageData: vi.fn( () => ( { data: new Uint8ClampedArray( 4 ) } ) ),
			drawImage:       vi.fn(),
			clearRect:       vi.fn(),
		} ) ),
		writable: true,
	} );
} );

import { usePixelEditor } from '../hooks/usePixelEditor.ts';

describe( 'usePixelEditor — initial state', () => {
	it( 'has default size of 32', () => {
		const { result } = renderHook( () => usePixelEditor() );
		expect( result.current.size ).toBe( 32 );
	} );

	it( 'has default tool of pencil', () => {
		const { result } = renderHook( () => usePixelEditor() );
		expect( result.current.tool ).toBe( 'pencil' );
	} );

	it( 'has default primaryColor of #000000', () => {
		const { result } = renderHook( () => usePixelEditor() );
		expect( result.current.primaryColor ).toBe( '#000000' );
	} );

	it( 'initial pixels length is 32 * 32 * 4', () => {
		const { result } = renderHook( () => usePixelEditor() );
		expect( result.current.pixels.length ).toBe( 32 * 32 * 4 );
	} );

	it( 'undoStack is empty initially', () => {
		const { result } = renderHook( () => usePixelEditor() );
		expect( result.current.undoStack.length ).toBe( 0 );
	} );

	it( 'canUndo is false initially', () => {
		const { result } = renderHook( () => usePixelEditor() );
		expect( result.current.canUndo ).toBe( false );
	} );
} );

describe( 'usePixelEditor — state mutations', () => {
	it( 'setTool updates the active tool', () => {
		const { result } = renderHook( () => usePixelEditor() );
		act( () => { result.current.setTool( 'eraser' ); } );
		expect( result.current.tool ).toBe( 'eraser' );
	} );

	it( 'setPrimaryColor updates the primary color', () => {
		const { result } = renderHook( () => usePixelEditor() );
		act( () => { result.current.setPrimaryColor( '#ff0000' ); } );
		expect( result.current.primaryColor ).toBe( '#ff0000' );
	} );
} );
