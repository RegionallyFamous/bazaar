/**
 * bzr.store — server-backed key-value storage API.
 *
 * Data is persisted in wp_usermeta so it survives browser refreshes,
 * cache clears, and is shared across devices for the same WP user.
 *
 * @example
 * const store = createStore('my-ware');
 * await store.set('theme', 'dark');
 * const theme = await store.get<string>('theme'); // → 'dark'
 * await store.del('theme');
 */

import type { BazaarClientConfig } from './types.js';

type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue };

export interface WareStore {
	/** Read a value; returns `undefined` if the key doesn't exist. */
	get<T = JsonValue>( key: string ): Promise<T | undefined>;
	/** Write a value. */
	set<T = JsonValue>( key: string, value: T ): Promise<void>;
	/** Delete a key. */
	del( key: string ): Promise<void>;
	/** List all keys. */
	keys(): Promise<string[]>;
	/** Delete all keys for this ware. */
	clear(): Promise<void>;
}

/**
 * Create a store instance scoped to `slug`.
 */
export function createStore( slug: string, config: BazaarClientConfig ): WareStore {
	const base = `${ config.restUrl }/bazaar/v1/store/${ encodeURIComponent( slug ) }`;

	async function req( method: string, path: string, body?: JsonValue ): Promise<Response> {
		const opts: RequestInit = {
			method,
			headers: { 'X-WP-Nonce': config.nonce, 'Content-Type': 'application/json' },
		};
		if ( body !== undefined ) opts.body = JSON.stringify( body );
		const r = await fetch( base + path, opts );
		if ( ! r.ok ) throw new Error( `bzr.store [${ method } ${ path }] → ${ r.status }` );
		return r;
	}

	return {
		async get<T = JsonValue>( key: string ): Promise<T | undefined> {
			try {
				const r = await req( 'GET', `/${ encodeURIComponent( key ) }` );
				const { value } = await r.json() as { value: T };
				return value;
			} catch {
				return undefined;
			}
		},

		async set<T = JsonValue>( key: string, value: T ): Promise<void> {
			await req( 'PUT', `/${ encodeURIComponent( key ) }`, { value } as JsonValue );
		},

		async del( key: string ): Promise<void> {
			await req( 'DELETE', `/${ encodeURIComponent( key ) }` );
		},

		async keys(): Promise<string[]> {
			const r = await req( 'GET', '' );
			return r.json() as Promise<string[]>;
		},

		async clear(): Promise<void> {
			await req( 'DELETE', '' );
		},
	};
}
