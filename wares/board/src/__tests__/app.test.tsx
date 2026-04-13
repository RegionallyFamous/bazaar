import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import App from '../App.tsx';

vi.mock( '@bazaar/design', () => ( {
  ErrorBoundary: ( { children }: { children: React.ReactNode } ) => <>{ children }</>,
  Toast: () => null,
  Modal: ( {
    children,
    onClose: _onClose,
    title: _title,
  }: {
    children: React.ReactNode;
    onClose: () => void;
    title: string;
  } ) => <div>{ children }</div>,
} ) );

vi.mock( '@bazaar/client', () => ( {
  bzr: {
    on:       vi.fn( () => vi.fn() ),
    emit:     vi.fn(),
    toast:    vi.fn(),
    navigate: vi.fn(),
    badge:    vi.fn(),
  },
  getBazaarContext: vi.fn( () => { throw new Error( 'no context' ); } ),
  createStore:      vi.fn(),
  createWaredStore: vi.fn( () => ( {
    load: vi.fn().mockResolvedValue( undefined ),
    save: vi.fn().mockResolvedValue( undefined ),
  } ) ),
} ) );

beforeEach( () => localStorage.clear() );

describe( 'App', () => {
  it( 'renders without crashing', () => {
    const { container } = render( <App /> );
    expect( container ).toBeTruthy();
  } );

  it( 'shows column headings', () => {
    const { getByText } = render( <App /> );
    expect( getByText( 'Backlog' ) ).toBeInTheDocument();
    expect( getByText( 'To Do' ) ).toBeInTheDocument();
  } );
} );
