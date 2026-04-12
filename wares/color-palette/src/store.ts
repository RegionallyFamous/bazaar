import type { Palette } from './types.ts';

const KEY = 'bazaar-color-palette-v1';

export function loadPalettes(): Palette[] {
  try {
    const raw = localStorage.getItem( KEY );
    if ( raw ) return JSON.parse( raw ) as Palette[];
  } catch {
    // corrupt — fall through
  }
  return [ defaultPalette() ];
}

export function savePalettes( palettes: Palette[] ): void {
  localStorage.setItem( KEY, JSON.stringify( palettes ) );
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
