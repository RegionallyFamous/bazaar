import type { HSL, HarmonyType } from '../types.ts';

// ── Conversion ────────────────────────────────────────────────────────────────

export function hexToHsl( hex: string ): HSL {
  const r = parseInt( hex.slice( 1, 3 ), 16 ) / 255;
  const g = parseInt( hex.slice( 3, 5 ), 16 ) / 255;
  const b = parseInt( hex.slice( 5, 7 ), 16 ) / 255;
  const max = Math.max( r, g, b );
  const min = Math.min( r, g, b );
  const l   = ( max + min ) / 2;
  let h = 0;
  let s = 0;
  if ( max !== min ) {
    const d = max - min;
    s = l > 0.5 ? d / ( 2 - max - min ) : d / ( max + min );
    switch ( max ) {
      case r: h = ( ( g - b ) / d + ( g < b ? 6 : 0 ) ) / 6; break;
      case g: h = ( ( b - r ) / d + 2 ) / 6;                  break;
      case b: h = ( ( r - g ) / d + 4 ) / 6;                  break;
    }
  }
  return {
    h: Math.round( h * 360 ),
    s: Math.round( s * 100 ),
    l: Math.round( l * 100 ),
  };
}

export function hslToHex( { h, s, l }: HSL ): string {
  const hn = h / 360;
  const sn = s / 100;
  const ln = l / 100;
  function hue2rgb( p: number, q: number, t: number ) {
    const nt = ( ( t % 1 ) + 1 ) % 1;
    if ( nt < 1 / 6 ) return p + ( q - p ) * 6 * nt;
    if ( nt < 1 / 2 ) return q;
    if ( nt < 2 / 3 ) return p + ( q - p ) * ( 2 / 3 - nt ) * 6;
    return p;
  }
  let r: number, g: number, b: number;
  if ( sn === 0 ) {
    r = g = b = ln;
  } else {
    const q = ln < 0.5 ? ln * ( 1 + sn ) : ln + sn - ln * sn;
    const p = 2 * ln - q;
    r = hue2rgb( p, q, hn + 1 / 3 );
    g = hue2rgb( p, q, hn );
    b = hue2rgb( p, q, hn - 1 / 3 );
  }
  return '#' + [ r, g, b ].map( v => Math.round( v * 255 ).toString( 16 ).padStart( 2, '0' ) ).join( '' );
}

export function isValidHex( hex: string ): boolean {
  return /^#[0-9a-fA-F]{6}$/.test( hex );
}

// ── Harmonies ─────────────────────────────────────────────────────────────────

function rotate( hsl: HSL, deg: number ): string {
  return hslToHex( { ...hsl, h: ( hsl.h + deg + 360 ) % 360 } );
}

export function generateHarmony( hex: string, type: HarmonyType ): string[] {
  const hsl = hexToHsl( hex );
  switch ( type ) {
    case 'complementary':
      return [ hex, rotate( hsl, 180 ) ];
    case 'triadic':
      return [ hex, rotate( hsl, 120 ), rotate( hsl, 240 ) ];
    case 'analogous':
      return [ rotate( hsl, -30 ), hex, rotate( hsl, 30 ) ];
    case 'split-complementary':
      return [ hex, rotate( hsl, 150 ), rotate( hsl, 210 ) ];
    case 'tetradic':
      return [ hex, rotate( hsl, 90 ), rotate( hsl, 180 ), rotate( hsl, 270 ) ];
  }
}

// ── WCAG contrast ─────────────────────────────────────────────────────────────

function relativeLuminance( hex: string ): number {
  const [ r, g, b ] = [ hex.slice( 1, 3 ), hex.slice( 3, 5 ), hex.slice( 5, 7 ) ]
    .map( c => {
      const v = parseInt( c, 16 ) / 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow( ( v + 0.055 ) / 1.055, 2.4 );
    } );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio( hex1: string, hex2: string ): number {
  const l1 = relativeLuminance( hex1 );
  const l2 = relativeLuminance( hex2 );
  const lighter = Math.max( l1, l2 );
  const darker  = Math.min( l1, l2 );
  return ( lighter + 0.05 ) / ( darker + 0.05 );
}

export function wcagLevel( ratio: number ): 'AAA' | 'AA' | 'AA Large' | 'Fail' {
  if ( ratio >= 7 )   return 'AAA';
  if ( ratio >= 4.5 ) return 'AA';
  if ( ratio >= 3 )   return 'AA Large';
  return 'Fail';
}
