import { describe, it, expect } from 'vitest';
import {
  isValidHex,
  hexToHsl,
  hslToHex,
  generateHarmony,
  contrastRatio,
  wcagLevel,
} from '../utils/color.ts';

// ── isValidHex ────────────────────────────────────────────────────────────────

describe( 'isValidHex', () => {
  it( 'accepts a valid lowercase 6-digit hex', () => {
    expect( isValidHex( '#ff0000' ) ).toBe( true );
  } );

  it( 'accepts a valid uppercase 6-digit hex', () => {
    expect( isValidHex( '#FFFFFF' ) ).toBe( true );
  } );

  it( 'rejects a 3-digit shorthand hex', () => {
    expect( isValidHex( '#000' ) ).toBe( false );
  } );

  it( 'rejects a hex without leading #', () => {
    expect( isValidHex( 'ff0000' ) ).toBe( false );
  } );

  it( 'rejects a hex with invalid characters', () => {
    expect( isValidHex( '#gggggg' ) ).toBe( false );
  } );

  it( 'rejects an empty string', () => {
    expect( isValidHex( '' ) ).toBe( false );
  } );
} );

// ── hexToHsl ──────────────────────────────────────────────────────────────────

describe( 'hexToHsl', () => {
  it( 'converts pure red to h=0, s=100, l=50', () => {
    expect( hexToHsl( '#ff0000' ) ).toEqual( { h: 0, s: 100, l: 50 } );
  } );

  it( 'converts white to h=0, s=0, l=100', () => {
    expect( hexToHsl( '#ffffff' ) ).toEqual( { h: 0, s: 0, l: 100 } );
  } );

  it( 'converts black to h=0, s=0, l=0', () => {
    expect( hexToHsl( '#000000' ) ).toEqual( { h: 0, s: 0, l: 0 } );
  } );

  it( 'converts pure blue to h=240, s=100, l=50', () => {
    expect( hexToHsl( '#0000ff' ) ).toEqual( { h: 240, s: 100, l: 50 } );
  } );

  it( 'returns fallback {h:0, s:0, l:0} for invalid hex', () => {
    expect( hexToHsl( 'invalid' ) ).toEqual( { h: 0, s: 0, l: 0 } );
  } );
} );

// ── hslToHex ──────────────────────────────────────────────────────────────────

describe( 'hslToHex', () => {
  it( 'round-trips #3b82f6 through HSL conversion', () => {
    const roundTripped = hslToHex( hexToHsl( '#3b82f6' ) );
    // Allow ±1 on each channel due to rounding
    const parse = ( h: string ) => [
      parseInt( h.slice( 1, 3 ), 16 ),
      parseInt( h.slice( 3, 5 ), 16 ),
      parseInt( h.slice( 5, 7 ), 16 ),
    ];
    const orig = parse( '#3b82f6' );
    const got  = parse( roundTripped );
    orig.forEach( ( v, i ) => {
      expect( Math.abs( v - ( got[ i ] ?? 0 ) ) ).toBeLessThanOrEqual( 1 );
    } );
  } );

  it( 'converts black HSL to #000000', () => {
    expect( hslToHex( { h: 0, s: 0, l: 0 } ) ).toBe( '#000000' );
  } );

  it( 'converts white HSL to #ffffff', () => {
    expect( hslToHex( { h: 0, s: 0, l: 100 } ) ).toBe( '#ffffff' );
  } );
} );

// ── generateHarmony ───────────────────────────────────────────────────────────

describe( 'generateHarmony', () => {
  const base = '#3b82f6';

  it( 'complementary returns 2 colors', () => {
    expect( generateHarmony( base, 'complementary' ) ).toHaveLength( 2 );
  } );

  it( 'triadic returns 3 colors', () => {
    expect( generateHarmony( base, 'triadic' ) ).toHaveLength( 3 );
  } );

  it( 'analogous returns 3 colors', () => {
    expect( generateHarmony( base, 'analogous' ) ).toHaveLength( 3 );
  } );

  it( 'split-complementary returns 3 colors', () => {
    expect( generateHarmony( base, 'split-complementary' ) ).toHaveLength( 3 );
  } );

  it( 'tetradic returns 4 colors', () => {
    expect( generateHarmony( base, 'tetradic' ) ).toHaveLength( 4 );
  } );

  it( 'all returned values are valid hex strings', () => {
    const types = [ 'complementary', 'triadic', 'analogous', 'split-complementary', 'tetradic' ] as const;
    for ( const type of types ) {
      const colors = generateHarmony( base, type );
      for ( const color of colors ) {
        expect( isValidHex( color ), `${ type } produced invalid hex: ${ color }` ).toBe( true );
      }
    }
  } );
} );

// ── contrastRatio ─────────────────────────────────────────────────────────────

describe( 'contrastRatio', () => {
  it( 'black vs white is approximately 21', () => {
    const ratio = contrastRatio( '#000000', '#ffffff' );
    expect( Math.abs( ratio - 21 ) ).toBeLessThan( 0.1 );
  } );

  it( 'same color vs itself is 1', () => {
    expect( contrastRatio( '#3b82f6', '#3b82f6' ) ).toBe( 1 );
  } );

  it( 'ratio is always ≥ 1', () => {
    const pairs: [ string, string ][] = [
      [ '#ff0000', '#00ff00' ],
      [ '#ffffff', '#000000' ],
      [ '#aabbcc', '#112233' ],
    ];
    for ( const [ a, b ] of pairs ) {
      expect( contrastRatio( a, b ) ).toBeGreaterThanOrEqual( 1 );
    }
  } );
} );

// ── wcagLevel ─────────────────────────────────────────────────────────────────

describe( 'wcagLevel', () => {
  it( 'ratio 21 → AAA', () => {
    expect( wcagLevel( 21 ) ).toBe( 'AAA' );
  } );

  it( 'ratio 5 → AA', () => {
    expect( wcagLevel( 5 ) ).toBe( 'AA' );
  } );

  it( 'ratio 3.5 → AA Large', () => {
    expect( wcagLevel( 3.5 ) ).toBe( 'AA Large' );
  } );

  it( 'ratio 2 → Fail', () => {
    expect( wcagLevel( 2 ) ).toBe( 'Fail' );
  } );

  it( 'exactly 7 → AAA', () => {
    expect( wcagLevel( 7 ) ).toBe( 'AAA' );
  } );

  it( 'exactly 4.5 → AA', () => {
    expect( wcagLevel( 4.5 ) ).toBe( 'AA' );
  } );
} );
