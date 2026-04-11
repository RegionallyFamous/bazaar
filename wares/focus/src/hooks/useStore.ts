import { getBazaarContext, createStore } from '@bazaar/client';
import type { Settings, DayRecord, Task } from '../types.ts';
import { DEFAULT_SETTINGS }               from '../types.ts';

let _store: ReturnType<typeof createStore> | null = null;

function getStore() {
	if ( ! _store ) {
		try {
			const ctx = getBazaarContext();
			_store    = createStore( 'focus', ctx );
		} catch {
			return null;
		}
	}
	return _store;
}

function lsGet<T>( key: string ): T | undefined {
	try {
		const v = localStorage.getItem( `bzr-focus-${ key }` );
		return v ? ( JSON.parse( v ) as T ) : undefined;
	} catch { return undefined; }
}

function lsSet( key: string, val: unknown ): void {
	try { localStorage.setItem( `bzr-focus-${ key }`, JSON.stringify( val ) ); } catch { /* noop */ }
}

async function load<T>( key: string ): Promise<T | undefined> {
	const store = getStore();
	if ( store ) return store.get<T>( key );
	return lsGet<T>( key );
}

async function save( key: string, val: unknown ): Promise<void> {
	const store = getStore();
	if ( store ) { await store.set( key, val as never ); return; }
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
