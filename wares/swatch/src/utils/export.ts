import type { Palette } from '../types.ts';
import { isValidHex } from './color.ts';

function safeHex( hex: string ): string {
  return isValidHex( hex ) ? hex : '#000000';
}

function sanitizeCssName( raw: string ): string {
  return raw.replace( /[^a-zA-Z0-9-_]/g, '-' ).replace( /^-+/, '' ) || 'color';
}

export function toCssVars( palette: Palette ): string {
  const name  = sanitizeCssName( palette.name.toLowerCase().replace( /\s+/g, '-' ) );
  const lines = palette.swatches.map( ( s, i ) => {
    const key = s.name
      ? sanitizeCssName( s.name.toLowerCase().replace( /\s+/g, '-' ) )
      : `color-${ i + 1 }`;
    return `  --${ name }-${ key }: ${ safeHex( s.hex ) };`;
  } );
  return `:root {\n${ lines.join( '\n' ) }\n}`;
}

export function toTailwind( palette: Palette ): string {
  const name    = sanitizeCssName( palette.name.toLowerCase().replace( /\s+/g, '-' ) );
  const entries = palette.swatches.map( ( s, i ) => {
    const key = s.name
      ? sanitizeCssName( s.name.toLowerCase().replace( /\s+/g, '-' ) )
      : String( ( i + 1 ) * 100 );
    return `      '${ key }': '${ safeHex( s.hex ) }',`;
  } );
  return `// tailwind.config.js\ncolors: {\n  '${ name }': {\n${ entries.join( '\n' ) }\n  },\n}`;
}

export function toHexList( palette: Palette ): string {
  return palette.swatches.map( s => safeHex( s.hex ) ).join( '\n' );
}

export function toSvg( palette: Palette ): string {
  const size   = 80;
  const gap    = 8;
  const cols   = Math.min( palette.swatches.length, 6 );
  const rows   = Math.ceil( palette.swatches.length / cols );
  const width  = cols * ( size + gap ) - gap;
  const height = rows * ( size + gap ) - gap;

  const rects = palette.swatches.map( ( s, i ) => {
    const col  = i % cols;
    const row  = Math.floor( i / cols );
    const x    = col * ( size + gap );
    const y    = row * ( size + gap );
    return `  <rect x="${ x }" y="${ y }" width="${ size }" height="${ size }" rx="8" fill="${ safeHex( s.hex ) }"/>`;
  } );

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${ width } ${ height }" width="${ width }" height="${ height }">\n${ rects.join( '\n' ) }\n</svg>`;
}

export function download( content: string, filename: string, mime = 'text/plain' ) {
  const blob = new Blob( [ content ], { type: mime } );
  const url  = URL.createObjectURL( blob );
  const a    = Object.assign( document.createElement( 'a' ), { href: url, download: filename } );
  a.click();
  URL.revokeObjectURL( url );
}
