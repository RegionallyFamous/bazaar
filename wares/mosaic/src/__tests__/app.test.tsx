import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import App from '../App.tsx';

vi.mock( '@bazaar/client', () => ( {
	createStore: vi.fn( () => ( {
		get:   vi.fn().mockResolvedValue( undefined ),
		set:   vi.fn().mockResolvedValue( undefined ),
		del:   vi.fn().mockResolvedValue( undefined ),
		keys:  vi.fn().mockResolvedValue( [] ),
		clear: vi.fn().mockResolvedValue( undefined ),
	} ) ),
	bzr: {
		toast:    vi.fn(),
		on:       vi.fn( () => vi.fn() ),
		emit:     vi.fn(),
		navigate: vi.fn(),
	},
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
			createImageData: vi.fn( ( w: number, h: number ) => ( {
				data: new Uint8ClampedArray( w * h * 4 ),
			} ) ),
			drawImage:    vi.fn(),
			clearRect:    vi.fn(),
			fillRect:     vi.fn(),
			getImageData: vi.fn( () => ( { data: new Uint8ClampedArray( 4 ) } ) ),
		} ) ),
		writable: true,
	} );
} );

describe( 'App', () => {
	it( 'renders without crashing', () => {
		const { container } = render( <App /> );
		expect( container ).toBeTruthy();
	} );

	it( 'renders the Mosaic title', () => {
		const { getByText } = render( <App /> );
		expect( getByText( 'Mosaic' ) ).toBeInTheDocument();
	} );
} );
