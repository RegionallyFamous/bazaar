import { getBazaarContext, createStore, bzr } from '@bazaar/client';
import type { Client, Invoice }               from './types.ts';

let _store: ReturnType<typeof createStore> | null = null;

function getStore() {
	if ( ! _store ) {
		try {
			const ctx = getBazaarContext();
			_store    = createStore( 'ledger', ctx );
		} catch {
			return null;
		}
	}
	return _store;
}

const LS_PREFIX     = 'bzr-ledger-';
const LS_PREFIX_OLD = 'bzr-inv-';

function lsGet<T>( key: string ): T | undefined {
	try {
		const cur = localStorage.getItem( `${ LS_PREFIX }${ key }` );
		if ( cur ) return JSON.parse( cur ) as T;
		// Transparent migration from pre-rename key.
		const old = localStorage.getItem( `${ LS_PREFIX_OLD }${ key }` );
		if ( old ) {
			localStorage.setItem( `${ LS_PREFIX }${ key }`, old );
			localStorage.removeItem( `${ LS_PREFIX_OLD }${ key }` );
			return JSON.parse( old ) as T;
		}
	} catch { /* ignore */ }
	return undefined;
}

function lsSet( key: string, value: unknown ): void {
	try { localStorage.setItem( `${ LS_PREFIX }${ key }`, JSON.stringify( value ) ); } catch { /* noop */ }
}

export async function loadClients(): Promise<Client[]> {
	const store = getStore();
	if ( store ) return ( await store.get<Client[]>( 'clients' ) ) ?? [];
	return lsGet<Client[]>( 'clients' ) ?? [];
}

export async function saveClients( clients: Client[] ): Promise<void> {
	const store = getStore();
	if ( store ) {
		try { await store.set( 'clients', clients as never ); return; } catch {
			bzr.toast( 'Saved locally — server unreachable', 'warning' );
		}
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
		try { await store.set( 'invoices', invoices as never ); return; } catch {
			bzr.toast( 'Saved locally — server unreachable', 'warning' );
		}
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
		try { await store.set( 'nextNum', n as never ); return; } catch {
			bzr.toast( 'Saved locally — server unreachable', 'warning' );
		}
	}
	lsSet( 'nextNum', n );
}
