import { describe, it, expect } from 'vitest';
import { makeBlankPixels, rgbaToHex } from '../hooks/usePixelEditor.ts';

describe( 'makeBlankPixels', () => {
	it( 'returns a Uint8Array', () => {
		const result = makeBlankPixels( 8 );
		expect( result ).toBeInstanceOf( Uint8Array );
	} );

	it( 'has length size * size * 4 for size 8', () => {
		expect( makeBlankPixels( 8 ).length ).toBe( 256 );
	} );

	it( 'has length size * size * 4 for size 32', () => {
		expect( makeBlankPixels( 32 ).length ).toBe( 4096 );
	} );

	it( 'fills all pixels with white (R=255 G=255 B=255) and alpha=0', () => {
		const pixels = makeBlankPixels( 8 );
		for ( let i = 0; i < 8 * 8; i++ ) {
			expect( pixels[ i * 4 ] ).toBe( 255 );      // R
			expect( pixels[ i * 4 + 1 ] ).toBe( 255 );  // G
			expect( pixels[ i * 4 + 2 ] ).toBe( 255 );  // B
			expect( pixels[ i * 4 + 3 ] ).toBe( 0 );    // A
		}
	} );
} );

describe( 'rgbaToHex', () => {
	it( 'converts black (0,0,0) to #000000', () => {
		expect( rgbaToHex( 0, 0, 0 ) ).toBe( '#000000' );
	} );

	it( 'converts white (255,255,255) to #ffffff', () => {
		expect( rgbaToHex( 255, 255, 255 ) ).toBe( '#ffffff' );
	} );

	it( 'converts red (255,0,0) to #ff0000', () => {
		expect( rgbaToHex( 255, 0, 0 ) ).toBe( '#ff0000' );
	} );

	it( 'converts (16,32,48) to the correct hex string', () => {
		expect( rgbaToHex( 16, 32, 48 ) ).toBe( '#102030' );
	} );

	it( 'clamps out-of-range values without crashing', () => {
		const result = rgbaToHex( -1, 256, 127 );
		expect( result ).toMatch( /^#[0-9a-f]{6}$/ );
		// -1 clamps to 0, 256 clamps to 255, 127 stays 127
		expect( result ).toBe( '#00ff7f' );
	} );
} );
