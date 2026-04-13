import type { BoardState } from './types.ts';
import { DEFAULT_BOARD }  from './types.ts';

const KEY     = 'bazaar-board-v1';
const KEY_OLD = 'bazaar-kanban-v1';

function isValidBoardState( v: unknown ): v is BoardState {
  if (
    typeof v !== 'object' ||
    v === null ||
    ! ( 'columns' in v ) ||
    ! Array.isArray( ( v as { columns: unknown } ).columns )
  ) return false;

  return ( v as { columns: unknown[] } ).columns.every( col => {
    if ( typeof col !== 'object' || col === null ) return false;
    const c = col as Record<string, unknown>;
    if (
      typeof c['id'] !== 'string' ||
      typeof c['title'] !== 'string' ||
      ! Array.isArray( c['cards'] )
    ) return false;
    return ( c['cards'] as unknown[] ).every( card => {
      if ( typeof card !== 'object' || card === null ) return false;
      const k = card as Record<string, unknown>;
      return typeof k['id'] === 'string' && typeof k['title'] === 'string';
    } );
  } );
}

function parseBoard( raw: string ): BoardState | null {
  try {
    const parsed: unknown = JSON.parse( raw );
    return isValidBoardState( parsed ) ? parsed : null;
  } catch {
    return null;
  }
}

export function loadBoard(): BoardState {
  try {
    const raw = localStorage.getItem( KEY );
    if ( raw ) {
      const board = parseBoard( raw );
      if ( board ) return board;
    }
    // Transparent migration from pre-rename key.
    const old = localStorage.getItem( KEY_OLD );
    if ( old ) {
      const board = parseBoard( old );
      if ( board ) {
        localStorage.setItem( KEY, old );
        localStorage.removeItem( KEY_OLD );
        return board;
      }
    }
  } catch {
    // storage unavailable — fall through to default
  }
  return structuredClone( DEFAULT_BOARD );
}

export function saveBoard( state: BoardState ): boolean {
  try {
    localStorage.setItem( KEY, JSON.stringify( state ) );
    return true;
  } catch ( err ) {
    console.error( 'saveBoard failed:', err );
    return false;
  }
}

export function uid(): string {
  return `${Date.now().toString( 36 )}-${Math.random().toString( 36 ).slice( 2, 7 )}`;
}
