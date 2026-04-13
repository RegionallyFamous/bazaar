import { vi, describe, it, expect } from 'vitest';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import App from '../App.tsx';

vi.mock( '@bazaar/client', () => ( {
  createWaredStore: () => ( {
    load: vi.fn().mockResolvedValue( undefined ),
    save: vi.fn().mockResolvedValue( undefined ),
  } ),
  bzr: { toast: vi.fn(), on: vi.fn( () => vi.fn() ), emit: vi.fn(), navigate: vi.fn() },
  getBazaarContext: vi.fn( () => { throw new Error( 'no context' ); } ),
} ) );

vi.mock( '@bazaar/design', () => ( {
  ErrorBoundary: ( { children }: { children: React.ReactNode } ) => <>{ children }</>,
  Toast: () => null,
} ) );

vi.mock( '../views/Dashboard.tsx', () => ( {
  default: () => <div data-testid="dashboard">Dashboard</div>,
} ) );

vi.mock( '../views/InvoiceList.tsx', () => ( {
  default: () => <div data-testid="invoice-list">Invoices</div>,
} ) );

vi.mock( '../views/InvoiceEditor.tsx', () => ( {
  default: () => <div data-testid="invoice-editor">Invoice Editor</div>,
} ) );

vi.mock( '../views/ClientList.tsx', () => ( {
  default: () => <div data-testid="client-list">Clients</div>,
} ) );

vi.mock( '../App.css', () => ( {} ) );

describe( 'App', () => {
  it( 'renders without crashing', async () => {
    render( <App /> );
    await waitFor( () => {
      expect( screen.queryByText( 'Loading…' ) ).toBeNull();
    } );
  } );

  it( 'shows navigation links after loading', async () => {
    render( <App /> );
    await waitFor( () => {
      expect( screen.getByRole( 'button', { name: 'Dashboard' } ) ).toBeInTheDocument();
      expect( screen.getByRole( 'button', { name: 'Invoices' } ) ).toBeInTheDocument();
      expect( screen.getByRole( 'button', { name: 'Clients' } ) ).toBeInTheDocument();
    } );
  } );
} );
