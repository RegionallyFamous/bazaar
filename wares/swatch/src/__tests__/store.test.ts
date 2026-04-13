import { describe, it, expect, beforeEach } from 'vitest';
import { loadPalettes, savePalettes, uid } from '../store.ts';

beforeEach( () => {
  localStorage.clear();
} );

describe( 'loadPalettes', () => {
  it( 'returns an array with at least one palette when localStorage is empty', () => {
    const palettes = loadPalettes();
    expect( Array.isArray( palettes ) ).toBe( true );
    expect( palettes.length ).toBeGreaterThanOrEqual( 1 );
  } );

  it( 'default palette contains valid swatch objects', () => {
    const [ palette ] = loadPalettes();
    expect( palette ).toBeDefined();
    expect( Array.isArray( palette!.swatches ) ).toBe( true );
    expect( palette!.swatches.length ).toBeGreaterThan( 0 );
    for ( const swatch of palette!.swatches ) {
      expect( typeof swatch!.id ).toBe( 'string' );
      expect( swatch!.id.length ).toBeGreaterThan( 0 );
      expect( typeof swatch!.hex ).toBe( 'string' );
      expect( /^#[0-9a-fA-F]{6}$/.test( swatch!.hex ) ).toBe( true );
      expect( typeof swatch!.name ).toBe( 'string' );
    }
  } );

  it( 'round-trips saved palettes back through loadPalettes', () => {
    const original = loadPalettes();
    savePalettes( original );
    const restored = loadPalettes();
    expect( restored ).toEqual( original );
  } );

  it( 'returns default palette when localStorage contains invalid JSON', () => {
    localStorage.setItem( 'bazaar-swatch-v1', '{not valid json' );
    const palettes = loadPalettes();
    expect( palettes.length ).toBeGreaterThanOrEqual( 1 );
    expect( palettes[ 0 ]?.name ).toBe( 'My Palette' );
  } );

  it( 'returns default palette when localStorage value is not an array', () => {
    localStorage.setItem( 'bazaar-swatch-v1', JSON.stringify( { id: '1', name: 'x', swatches: [] } ) );
    const palettes = loadPalettes();
    expect( palettes.length ).toBeGreaterThanOrEqual( 1 );
    expect( palettes[ 0 ]?.name ).toBe( 'My Palette' );
  } );

  it( 'returns default when stored palettes contain invalid swatches', () => {
    const bad = [
      {
        id: 'p1',
        name: 'Bad',
        swatches: [ { id: 's1', hex: 'notahex', name: 'broken' } ],
      },
    ];
    localStorage.setItem( 'bazaar-swatch-v1', JSON.stringify( bad ) );
    const palettes = loadPalettes();
    expect( palettes[ 0 ]?.name ).toBe( 'My Palette' );
  } );
} );

describe( 'uid', () => {
  it( 'returns a non-empty string', () => {
    expect( typeof uid() ).toBe( 'string' );
    expect( uid().length ).toBeGreaterThan( 0 );
  } );

  it( 'two consecutive calls return different strings', () => {
    expect( uid() ).not.toBe( uid() );
  } );
} );
