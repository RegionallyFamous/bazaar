import { describe, it, expect } from 'vitest';
import { LABEL_COLORS, DEFAULT_BOARD } from '../types.ts';
import type { CardLabel } from '../types.ts';

describe( 'LABEL_COLORS', () => {
  it( 'has entries for all 7 label types including none', () => {
    const expected: CardLabel[] = [ 'red', 'orange', 'yellow', 'green', 'blue', 'purple', 'none' ];
    for ( const label of expected ) {
      expect( LABEL_COLORS ).toHaveProperty( label );
      expect( typeof LABEL_COLORS[ label ] ).toBe( 'string' );
    }
    expect( Object.keys( LABEL_COLORS ) ).toHaveLength( 7 );
  } );
} );

describe( 'DEFAULT_BOARD', () => {
  it( 'has exactly 4 columns', () => {
    expect( DEFAULT_BOARD.columns ).toHaveLength( 4 );
  } );

  it( 'has columns with ids backlog, todo, in-progress, done', () => {
    const ids = DEFAULT_BOARD.columns.map( c => c.id );
    expect( ids ).toEqual( [ 'backlog', 'todo', 'in-progress', 'done' ] );
  } );

  it( 'has the done column with id done', () => {
    const doneCol = DEFAULT_BOARD.columns.find( c => c.id === 'done' );
    expect( doneCol ).toBeDefined();
    expect( doneCol?.id ).toBe( 'done' );
  } );
} );
