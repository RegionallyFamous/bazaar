import { describe, it, expect, beforeEach } from 'vitest';
import { loadBoard, saveBoard, uid } from '../store.ts';
import { DEFAULT_BOARD } from '../types.ts';

const KEY     = 'bazaar-board-v1';
const KEY_OLD = 'bazaar-kanban-v1';

beforeEach( () => {
  localStorage.clear();
} );

describe( 'loadBoard', () => {
  it( 'returns DEFAULT_BOARD when localStorage is empty', () => {
    const board = loadBoard();
    expect( board ).toEqual( DEFAULT_BOARD );
  } );

  it( 'returns DEFAULT_BOARD when localStorage contains invalid JSON', () => {
    localStorage.setItem( KEY, 'not-valid-json{{' );
    const board = loadBoard();
    expect( board ).toEqual( DEFAULT_BOARD );
  } );

  it( 'returns DEFAULT_BOARD when localStorage contains valid JSON with wrong shape', () => {
    localStorage.setItem( KEY, JSON.stringify( { notColumns: [] } ) );
    const board = loadBoard();
    expect( board ).toEqual( DEFAULT_BOARD );
  } );

  it( 'migrates from old key bazaar-kanban-v1', () => {
    const oldBoard = {
      columns: [
        { id: 'backlog', title: 'Backlog', cards: [] },
        { id: 'todo', title: 'To Do', cards: [] },
      ],
    };
    localStorage.setItem( KEY_OLD, JSON.stringify( oldBoard ) );

    const board = loadBoard();

    expect( board ).toEqual( oldBoard );
    expect( localStorage.getItem( KEY ) ).toBe( JSON.stringify( oldBoard ) );
    expect( localStorage.getItem( KEY_OLD ) ).toBeNull();
  } );
} );

describe( 'saveBoard + loadBoard round-trip', () => {
  it( 'saves and reloads the same board state', () => {
    const board = {
      columns: [
        {
          id: 'backlog',
          title: 'Backlog',
          cards: [
            {
              id: 'card-1',
              title: 'Test Card',
              description: 'desc',
              label: 'red' as const,
              dueDate: '2026-01-01',
              createdAt: 1700000000000,
            },
          ],
        },
      ],
    };

    saveBoard( board );
    const loaded = loadBoard();

    expect( loaded ).toEqual( board );
  } );
} );

describe( 'saveBoard', () => {
  it( 'returns true on success', () => {
    const result = saveBoard( DEFAULT_BOARD );
    expect( result ).toBe( true );
  } );
} );

describe( 'uid', () => {
  it( 'returns a non-empty string', () => {
    const id = uid();
    expect( typeof id ).toBe( 'string' );
    expect( id.length ).toBeGreaterThan( 0 );
  } );

  it( 'returns different values on successive calls', () => {
    const a = uid();
    const b = uid();
    expect( a ).not.toBe( b );
  } );
} );
