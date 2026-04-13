/**
 * createWaredStore — lazy server-store + localStorage fallback factory.
 *
 * Wares that persist data through the Bazaar storage API while also wanting
 * a localStorage fallback for offline or context-less environments can use
 * this factory instead of re-implementing the same pattern in every ware.
 *
 * @example
 * const store = createWaredStore({ slug: 'flow', lsPrefix: 'bzr-flow-', lsPrefixOld: 'bzr-focus-' });
 * const tasks = await store.load<Task[]>('tasks') ?? [];
 * await store.save('tasks', tasks);
 */

import { getBazaarContext } from './context.js';
import { createStore }      from './store.js';
import { bzr }              from './bus.js';
import type { WareStore }   from './store.js';

export interface WaredStoreOptions {
	/** Ware slug used when initialising the server-backed `WareStore`. */
	slug: string;
	/** Prefix prepended to the key when reading/writing localStorage, e.g. `'bzr-flow-'`. */
	lsPrefix: string;
	/** Legacy localStorage prefix — if set, data is migrated from this prefix to `lsPrefix` transparently. */
	lsPrefixOld?: string;
}

export interface WaredStore {
	/** Load a value from the server store if available, otherwise from localStorage. */
	load<T>( key: string ): Promise<T | undefined>;
	/**
	 * Persist a value. Tries the server store first; on failure it falls back to
	 * localStorage and shows a toast warning.
	 */
	save( key: string, value: unknown ): Promise<void>;
}

/**
 * Create a store that combines a server-backed `WareStore` with a
 * localStorage fallback, following the canonical Bazaar ware storage pattern.
 */
export function createWaredStore( options: WaredStoreOptions ): WaredStore {
	let _server: WareStore | null = null;

	function getServer(): WareStore | null {
		if ( ! _server ) {
			try {
				_server = createStore( options.slug, getBazaarContext() );
			} catch {
				return null;
			}
		}
		return _server;
	}

	function lsGet<T>( key: string ): T | undefined {
		try {
			const cur = localStorage.getItem( options.lsPrefix + key );
			if ( cur ) return JSON.parse( cur ) as T;

			if ( options.lsPrefixOld ) {
				const old = localStorage.getItem( options.lsPrefixOld + key );
				if ( old ) {
					localStorage.setItem( options.lsPrefix + key, old );
					localStorage.removeItem( options.lsPrefixOld + key );
					return JSON.parse( old ) as T;
				}
			}
		} catch { /* corrupt or unavailable */ }
		return undefined;
	}

	function lsSet( key: string, value: unknown ): void {
		try {
			localStorage.setItem( options.lsPrefix + key, JSON.stringify( value ) );
		} catch { /* quota exceeded or storage unavailable */ }
	}

	return {
		async load<T>( key: string ): Promise<T | undefined> {
			const server = getServer();
			if ( server ) return server.get<T>( key );
			return lsGet<T>( key );
		},

		async save( key: string, value: unknown ): Promise<void> {
			const server = getServer();
			if ( server ) {
				try {
					await server.set( key, value );
					return;
				} catch {
					bzr.toast( 'Saved locally — server unreachable', 'warning' );
				}
			}
			lsSet( key, value );
		},
	};
}
