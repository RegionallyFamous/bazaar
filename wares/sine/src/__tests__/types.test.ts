import { describe, it, expect } from 'vitest';
import { noteToFreq, KEYBOARD_NOTES, KEY_MAP, DEFAULT_PARAMS, DEFAULT_STEPS } from '../types.ts';

describe( 'noteToFreq', () => {
  it( 'converts A4 to 440 Hz', () => {
    expect( noteToFreq( 'A4' ) ).toBeCloseTo( 440, 2 );
  } );

  it( 'converts C4 to ~261.63 Hz', () => {
    expect( noteToFreq( 'C4' ) ).toBeCloseTo( 261.63, 0 );
  } );

  it( 'converts A3 to ~220 Hz', () => {
    expect( noteToFreq( 'A3' ) ).toBeCloseTo( 220, 1 );
  } );

  it( 'returns 440 as fallback for empty string', () => {
    expect( () => noteToFreq( '' ) ).not.toThrow();
    expect( noteToFreq( '' ) ).toBe( 440 );
  } );

  it( 'returns 440 as fallback for invalid note', () => {
    expect( () => noteToFreq( 'Z9' ) ).not.toThrow();
    expect( noteToFreq( 'Z9' ) ).toBe( 440 );
  } );
} );

describe( 'KEYBOARD_NOTES', () => {
  it( 'has exactly 13 notes', () => {
    expect( KEYBOARD_NOTES ).toHaveLength( 13 );
  } );

  it( 'starts with C3 and ends with C4', () => {
    expect( KEYBOARD_NOTES[0] ).toBe( 'C3' );
    expect( KEYBOARD_NOTES[KEYBOARD_NOTES.length - 1] ).toBe( 'C4' );
  } );
} );

describe( 'KEY_MAP', () => {
  it( 'maps "a" to "C3"', () => {
    expect( KEY_MAP['a'] ).toBe( 'C3' );
  } );

  it( 'has at least 13 entries', () => {
    expect( Object.keys( KEY_MAP ).length ).toBeGreaterThanOrEqual( 13 );
  } );
} );

describe( 'DEFAULT_PARAMS', () => {
  it( 'has a valid waveform string', () => {
    const valid = [ 'sine', 'square', 'sawtooth', 'triangle' ];
    expect( valid ).toContain( DEFAULT_PARAMS.waveform );
  } );

  it( 'has volume between 0 and 1', () => {
    expect( DEFAULT_PARAMS.volume ).toBeGreaterThanOrEqual( 0 );
    expect( DEFAULT_PARAMS.volume ).toBeLessThanOrEqual( 1 );
  } );

  it( 'has adsr.sustain between 0 and 1', () => {
    expect( DEFAULT_PARAMS.adsr.sustain ).toBeGreaterThanOrEqual( 0 );
    expect( DEFAULT_PARAMS.adsr.sustain ).toBeLessThanOrEqual( 1 );
  } );
} );

describe( 'DEFAULT_STEPS', () => {
  it( 'has exactly 16 steps', () => {
    expect( DEFAULT_STEPS ).toHaveLength( 16 );
  } );

  it( 'has beats 0, 4, 8, 12 active and all others inactive', () => {
    DEFAULT_STEPS.forEach( ( step, i ) => {
      if ( [ 0, 4, 8, 12 ].includes( i ) ) {
        expect( step.active ).toBe( true );
      } else {
        expect( step.active ).toBe( false );
      }
    } );
  } );
} );
