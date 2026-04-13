import type { BoardState } from './types.ts';
import { DEFAULT_BOARD }  from './types.ts';

const KEY     = 'bazaar-board-v1';
const KEY_OLD = 'bazaar-kanban-v1';

function isValidBoardState( v: unknown ): v is BoardState {
  return (
    typeof v === 'object' &&
    v !== null &&
    'columns' in v &&
    Array.isArray( ( v as BoardState ).columns )
  );
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

export function saveBoard( state: BoardState ): void {
  try {
    localStorage.setItem( KEY, JSON.stringify( state ) );
  } catch { /* quota exceeded or storage unavailable — ignore */ }
}

export function uid(): string {
  return `${Date.now().toString( 36 )}-${Math.random().toString( 36 ).slice( 2, 7 )}`;
}
