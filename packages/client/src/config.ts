/**
 * bzr.config — manifest-driven ware settings API.
 *
 * Reads and writes config values via the Bazaar Config REST endpoint.
 * The admin can configure the settings in the Bazaar Manage screen;
 * wares read them at runtime.
 *
 * @example
 * const config = createConfig('my-ware');
 * const { values, schema } = await config.getAll();
 * const apiKey = await config.get<string>('api_key');
 * await config.set('theme', 'dark');   // admin only
 */

import type { BazaarClientConfig } from './types.js';

type JsonValue = string | number | boolean | null;

export interface ConfigField {
	key:       string;
	type:      'text' | 'number' | 'checkbox' | 'select' | 'textarea';
	label:     string;
	required?: boolean;
	default?:  JsonValue;
	options?:  string[];
}

export interface WareConfig {
	/** Get a single config value. */
	get<T extends JsonValue = string>( key: string ): Promise<T | undefined>;
	/** Get all config values + schema. */
	getAll(): Promise<{ schema: ConfigField[]; values: Record<string, JsonValue> }>;
	/** Update one or more config values (admin only). */
	set( values: Record<string, JsonValue> ): Promise<void>;
	/** Reset a key to its manifest default (admin only). */
	reset( key: string ): Promise<void>;
}

export function createConfig( slug: string, config: BazaarClientConfig ): WareConfig {
	const base = `${ config.restUrl }/config/${ encodeURIComponent( slug ) }`;
	const hdr  = { 'X-WP-Nonce': config.nonce, 'Content-Type': 'application/json' };

	return {
		async get<T extends JsonValue = string>( key: string ): Promise<T | undefined> {
			const r = await fetch( base, { headers: hdr } );
			if ( ! r.ok ) return undefined;
			const { values } = await r.json() as { values: Record<string, JsonValue> };
			return values[ key ] as T | undefined;
		},

		async getAll() {
			const r = await fetch( base, { headers: hdr } );
			if ( ! r.ok ) throw new Error( `bzr.config [GET] → ${ r.status }` );
			return r.json() as Promise<{ schema: ConfigField[]; values: Record<string, JsonValue> }>;
		},

		async set( values: Record<string, JsonValue> ): Promise<void> {
			const r = await fetch( base, {
				method:  'PATCH',
				headers: hdr,
				body:    JSON.stringify( { values } ),
			} );
			if ( ! r.ok ) throw new Error( `bzr.config [PATCH] → ${ r.status }` );
		},

		async reset( key: string ): Promise<void> {
			const r = await fetch( `${ base }/${ encodeURIComponent( key ) }`, {
				method:  'DELETE',
				headers: hdr,
			} );
			if ( ! r.ok ) throw new Error( `bzr.config [DELETE] → ${ r.status }` );
		},
	};
}
