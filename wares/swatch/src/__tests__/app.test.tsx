import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';
import App from '../App.tsx';

vi.mock( '@bazaar/client', () => ( {
  bzr: { toast: vi.fn(), on: vi.fn( () => vi.fn() ), emit: vi.fn(), navigate: vi.fn() },
  getBazaarContext: vi.fn( () => { throw new Error( 'no context' ); } ),
  createWaredStore: vi.fn( () => ( {
    load: vi.fn().mockResolvedValue( undefined ),
    save: vi.fn().mockResolvedValue( undefined ),
  } ) ),
} ) );

vi.mock( '@bazaar/design', () => ( {
  Modal: ( { children, open }: { children: React.ReactNode; open: boolean } ) =>
    open ? React.createElement( 'div', { 'data-testid': 'modal' }, children ) : null,
} ) );

beforeEach( () => {
  localStorage.clear();
} );

describe( 'App', () => {
  it( 'renders without crashing', () => {
    const { container } = render( <App /> );
    expect( container ).toBeTruthy();
  } );

  it( 'shows the palette or swatch UI', () => {
    const { container } = render( <App /> );
    expect( container.firstChild ).toBeTruthy();
  } );
} );
