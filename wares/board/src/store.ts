import type { BoardState } from './types.ts';
import { DEFAULT_BOARD }  from './types.ts';

const KEY     = 'bazaar-board-v1';
const KEY_OLD = 'bazaar-kanban-v1';

export function loadBoard(): BoardState {
  try {
    const raw = localStorage.getItem( KEY );
    if ( raw ) return JSON.parse( raw ) as BoardState;
    // Transparent migration from pre-rename key.
    const old = localStorage.getItem( KEY_OLD );
    if ( old ) {
      localStorage.setItem( KEY, old );
      localStorage.removeItem( KEY_OLD );
      return JSON.parse( old ) as BoardState;
    }
  } catch {
    // corrupt data — fall through to default
  }
  return structuredClone( DEFAULT_BOARD );
}

export function saveBoard( state: BoardState ): void {
  localStorage.setItem( KEY, JSON.stringify( state ) );
}

export function uid(): string {
  return `${Date.now().toString( 36 )}-${Math.random().toString( 36 ).slice( 2, 7 )}`;
}
