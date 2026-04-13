import type { Palette } from './types.ts';

const KEY    = 'bazaar-swatch-v1';
const HEX_RE = /^#[0-9a-fA-F]{6}$/;

function isValidSwatch( v: unknown ): boolean {
  if ( typeof v !== 'object' || v === null ) return false;
  const s = v as Record<string, unknown>;
  return (
    typeof s.id   === 'string' && s.id.length > 0 &&
    typeof s.hex  === 'string' && HEX_RE.test( s.hex ) &&
    typeof s.name === 'string'
  );
}

function isValidPalette( v: unknown ): v is Palette {
  return (
    typeof v === 'object' &&
    v !== null &&
    typeof ( v as Palette ).id === 'string' &&
    typeof ( v as Palette ).name === 'string' &&
    Array.isArray( ( v as Palette ).swatches ) &&
    ( v as Palette ).swatches.every( isValidSwatch )
  );
}

export function loadPalettes(): Palette[] {
  try {
    const raw = localStorage.getItem( KEY );
    if ( raw ) {
      const parsed: unknown = JSON.parse( raw );
      if ( Array.isArray( parsed ) && parsed.every( isValidPalette ) ) {
        return parsed;
      }
    }
  } catch {
    // corrupt or unavailable — fall through
  }
  return [ defaultPalette() ];
}

export function savePalettes( palettes: Palette[] ): void {
  try {
    localStorage.setItem( KEY, JSON.stringify( palettes ) );
  } catch { /* quota exceeded or storage unavailable — ignore */ }
}

export function uid(): string {
  return `${Date.now().toString( 36 )}-${Math.random().toString( 36 ).slice( 2, 7 )}`;
}

function defaultPalette(): Palette {
  return {
    id:   uid(),
    name: 'My Palette',
    swatches: [
      { id: uid(), hex: '#3b82f6', name: 'primary'   },
      { id: uid(), hex: '#8b5cf6', name: 'secondary' },
      { id: uid(), hex: '#10b981', name: 'success'   },
      { id: uid(), hex: '#f59e0b', name: 'warning'   },
      { id: uid(), hex: '#ef4444', name: 'danger'    },
    ],
  };
}
