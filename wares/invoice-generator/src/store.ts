import { getBazaarContext, createStore } from '@bazaar/client';
import type { Client, Invoice }          from './types.ts';

let _store: ReturnType<typeof createStore> | null = null;

function getStore() {
	if ( ! _store ) {
		try {
			const ctx = getBazaarContext();
			_store    = createStore( 'invoice-generator', ctx );
		} catch {
			// Dev mode without Bazaar context — use localStorage fallback
			return null;
		}
	}
	return _store;
}

function lsGet<T>( key: string ): T | undefined {
	try {
		const v = localStorage.getItem( `bzr-inv-${ key }` );
		return v ? ( JSON.parse( v ) as T ) : undefined;
	} catch { return undefined; }
}

function lsSet( key: string, value: unknown ): void {
	try { localStorage.setItem( `bzr-inv-${ key }`, JSON.stringify( value ) ); } catch { /* noop */ }
}

export async function loadClients(): Promise<Client[]> {
	const store = getStore();
	if ( store ) return ( await store.get<Client[]>( 'clients' ) ) ?? [];
	return lsGet<Client[]>( 'clients' ) ?? [];
}

export async function saveClients( clients: Client[] ): Promise<void> {
	const store = getStore();
	if ( store ) {
		try { await store.set( 'clients', clients as never ); return; } catch { /* fall through */ }
	}
	lsSet( 'clients', clients );
}

export async function loadInvoices(): Promise<Invoice[]> {
	const store = getStore();
	if ( store ) return ( await store.get<Invoice[]>( 'invoices' ) ) ?? [];
	return lsGet<Invoice[]>( 'invoices' ) ?? [];
}

export async function saveInvoices( invoices: Invoice[] ): Promise<void> {
	const store = getStore();
	if ( store ) {
		try { await store.set( 'invoices', invoices as never ); return; } catch { /* fall through */ }
	}
	lsSet( 'invoices', invoices );
}

export async function loadNextNumber(): Promise<number> {
	const store = getStore();
	if ( store ) return ( await store.get<number>( 'nextNum' ) ) ?? 1;
	return lsGet<number>( 'nextNum' ) ?? 1;
}

export async function saveNextNumber( n: number ): Promise<void> {
	const store = getStore();
	if ( store ) {
		try { await store.set( 'nextNum', n as never ); return; } catch { /* fall through */ }
	}
	lsSet( 'nextNum', n );
}
