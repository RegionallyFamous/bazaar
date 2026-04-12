import { getBazaarContext, createStore, bzr } from '@bazaar/client';
import type { Settings, DayRecord, Task }     from '../types.ts';
import { DEFAULT_SETTINGS }               from '../types.ts';

let _store: ReturnType<typeof createStore> | null = null;

function getStore() {
	if ( ! _store ) {
		try {
			const ctx = getBazaarContext();
			_store    = createStore( 'flow', ctx );
		} catch {
			return null;
		}
	}
	return _store;
}

const LS_PREFIX     = 'bzr-flow-';
const LS_PREFIX_OLD = 'bzr-focus-';

function lsGet<T>( key: string ): T | undefined {
	try {
		const cur = localStorage.getItem( `${ LS_PREFIX }${ key }` );
		if ( cur ) return JSON.parse( cur ) as T;
		// Transparent migration: read from old key once and promote.
		const old = localStorage.getItem( `${ LS_PREFIX_OLD }${ key }` );
		if ( old ) {
			localStorage.setItem( `${ LS_PREFIX }${ key }`, old );
			localStorage.removeItem( `${ LS_PREFIX_OLD }${ key }` );
			return JSON.parse( old ) as T;
		}
	} catch { /* ignore */ }
	return undefined;
}

function lsSet( key: string, val: unknown ): void {
	try { localStorage.setItem( `${ LS_PREFIX }${ key }`, JSON.stringify( val ) ); } catch { /* noop */ }
}

async function load<T>( key: string ): Promise<T | undefined> {
	const store = getStore();
	if ( store ) return store.get<T>( key );
	return lsGet<T>( key );
}

async function save( key: string, val: unknown ): Promise<void> {
	const store = getStore();
	if ( store ) {
		try { await store.set( key, val as never ); return; } catch {
			bzr.toast( 'Saved locally — server unreachable', 'warning' );
		}
	}
	lsSet( key, val );
}

export async function loadSettings(): Promise<Settings> {
	return ( await load<Settings>( 'settings' ) ) ?? DEFAULT_SETTINGS;
}

export async function saveSettings( s: Settings ): Promise<void> {
	return save( 'settings', s );
}

export async function loadHistory(): Promise<DayRecord[]> {
	return ( await load<DayRecord[]>( 'history' ) ) ?? [];
}

export async function saveHistory( h: DayRecord[] ): Promise<void> {
	return save( 'history', h );
}

export async function loadTasks(): Promise<Task[]> {
	return ( await load<Task[]>( 'tasks' ) ) ?? [];
}

export async function saveTasks( t: Task[] ): Promise<void> {
	return save( 'tasks', t );
}
