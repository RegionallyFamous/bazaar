import { createWaredStore } from '@bazaar/client';
import type { Client, Invoice } from './types.ts';

const store = createWaredStore( { slug: 'ledger', lsPrefix: 'bzr-ledger-', lsPrefixOld: 'bzr-inv-' } );

export async function loadClients(): Promise<Client[]> {
	return ( await store.load<Client[]>( 'clients' ) ) ?? [];
}
export function saveClients( clients: Client[] ): Promise<void> {
	return store.save( 'clients', clients );
}

export async function loadInvoices(): Promise<Invoice[]> {
	return ( await store.load<Invoice[]>( 'invoices' ) ) ?? [];
}
export function saveInvoices( invoices: Invoice[] ): Promise<void> {
	return store.save( 'invoices', invoices );
}

export async function loadNextNumber(): Promise<number> {
	return ( await store.load<number>( 'nextNum' ) ) ?? 1;
}
export function saveNextNumber( n: number ): Promise<void> {
	return store.save( 'nextNum', n );
}
