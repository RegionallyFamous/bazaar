import { describe, it, vi, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import App from '../App.tsx';

// Mock the audio engine — never needs a real AudioContext
vi.mock( '../audio/engine.ts', () => ( {
  engine: {
    noteOn:       vi.fn(),
    noteOff:      vi.fn(),
    triggerNote:  vi.fn(),
    applyParams:  vi.fn(),
    resume:       vi.fn(),
    currentTime:  0,
  },
  SynthEngine: vi.fn(),
} ) );

// Mock the sequencer — only needs a stub object
vi.mock( '../audio/sequencer.ts', () => ( {
  Sequencer: vi.fn().mockImplementation( () => ( {
    start:  vi.fn(),
    stop:   vi.fn(),
    update: vi.fn(),
  } ) ),
} ) );

// Mock sub-components to isolate App logic from their implementations
vi.mock( '../components/Keyboard.tsx', () => ( {
  default: ( { onNoteOn, onNoteOff }: { onNoteOn: () => void; onNoteOff: () => void } ) =>
    React.createElement( 'div', { 'data-testid': 'keyboard', onMouseDown: onNoteOn, onMouseUp: onNoteOff } ),
} ) );

vi.mock( '../components/Sequencer.tsx', () => ( {
  default: () => React.createElement( 'div', { 'data-testid': 'sequencer' } ),
} ) );

vi.mock( '../components/Knob.tsx', () => ( {
  default: ( { label }: { label: string } ) =>
    React.createElement( 'div', { 'data-testid': `knob-${ label.toLowerCase() }` } ),
} ) );

describe( 'App', () => {
  it( 'renders without crashing', () => {
    const { container } = render( <App /> );
    expect( container ).toBeTruthy();
    expect( container.firstChild ).toBeTruthy();
  } );

  it( 'renders the synth root element', () => {
    const { container } = render( <App /> );
    const synth = container.querySelector( '.synth' );
    expect( synth ).toBeTruthy();
  } );

  it( 'renders the SINE header logo', () => {
    render( <App /> );
    expect( screen.getByText( 'SINE' ) ).toBeTruthy();
  } );

  it( 'renders waveform selector buttons', () => {
    render( <App /> );
    const group = screen.getByRole( 'group', { name: /waveform/i } );
    expect( group ).toBeTruthy();
    const buttons = group.querySelectorAll( 'button' );
    expect( buttons.length ).toBe( 4 );
  } );

  it( 'renders section headings for modules', () => {
    render( <App /> );
    expect( screen.getByText( 'OSCILLATOR' ) ).toBeTruthy();
    expect( screen.getByText( 'ENVELOPE' ) ).toBeTruthy();
    expect( screen.getByText( 'FILTER' ) ).toBeTruthy();
  } );

  it( 'renders the keyboard component', () => {
    render( <App /> );
    expect( screen.getByTestId( 'keyboard' ) ).toBeTruthy();
  } );

  it( 'renders the sequencer component', () => {
    render( <App /> );
    expect( screen.getByTestId( 'sequencer' ) ).toBeTruthy();
  } );
} );
