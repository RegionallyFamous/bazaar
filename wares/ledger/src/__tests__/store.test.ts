import { vi, describe, it, expect, beforeEach } from 'vitest';
import type { Client, Invoice } from '../types.ts';

const memStore = new Map<string, unknown>();

vi.mock( '@bazaar/client', () => ( {
  createWaredStore: () => ( {
    async load<T>( key: string ): Promise<T | undefined> {
      return memStore.get( key ) as T | undefined;
    },
    async save( key: string, value: unknown ): Promise<void> {
      memStore.set( key, value );
    },
  } ),
  bzr: { toast: vi.fn(), on: vi.fn( () => vi.fn() ), emit: vi.fn() },
  getBazaarContext: vi.fn( () => { throw new Error( 'no context' ); } ),
} ) );

beforeEach( () => memStore.clear() );

import {
  loadClients,
  saveClients,
  loadInvoices,
  saveInvoices,
  loadNextNumber,
  saveNextNumber,
} from '../store.ts';

function makeClient( overrides: Partial<Client> = {} ): Client {
  return {
    id:        'c-1',
    name:      'Acme Corp',
    email:     'acme@example.com',
    address:   '123 Main St',
    notes:     '',
    createdAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeInvoice( overrides: Partial<Invoice> = {} ): Invoice {
  return {
    id:              'inv-1',
    number:          'INV-001',
    clientId:        'c-1',
    status:          'draft',
    lineItems:       [],
    taxPercent:      0,
    discountPercent: 0,
    issueDate:       '2024-01-01',
    dueDate:         '2024-01-31',
    notes:           '',
    createdAt:       '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe( 'loadClients', () => {
  it( 'returns [] when nothing is stored', async () => {
    expect( await loadClients() ).toEqual( [] );
  } );
} );

describe( 'saveClients / loadClients', () => {
  it( 'round-trips a list of clients', async () => {
    const clients = [ makeClient( { id: 'c-1', name: 'Acme' } ), makeClient( { id: 'c-2', name: 'Beta' } ) ];
    await saveClients( clients );
    expect( await loadClients() ).toEqual( clients );
  } );

  it( 'second save replaces the first', async () => {
    const first  = [ makeClient( { id: 'c-1', name: 'First' } ) ];
    const second = [ makeClient( { id: 'c-2', name: 'Second' } ) ];
    await saveClients( first );
    await saveClients( second );
    expect( await loadClients() ).toEqual( second );
  } );
} );

describe( 'loadInvoices', () => {
  it( 'returns [] when nothing is stored', async () => {
    expect( await loadInvoices() ).toEqual( [] );
  } );
} );

describe( 'saveInvoices / loadInvoices', () => {
  it( 'round-trips a list of invoices', async () => {
    const invoices = [ makeInvoice( { id: 'inv-1' } ), makeInvoice( { id: 'inv-2', number: 'INV-002' } ) ];
    await saveInvoices( invoices );
    expect( await loadInvoices() ).toEqual( invoices );
  } );
} );

describe( 'loadNextNumber', () => {
  it( 'returns 1 when nothing is stored', async () => {
    expect( await loadNextNumber() ).toBe( 1 );
  } );
} );

describe( 'saveNextNumber / loadNextNumber', () => {
  it( 'round-trips the next number', async () => {
    await saveNextNumber( 5 );
    expect( await loadNextNumber() ).toBe( 5 );
  } );
} );
