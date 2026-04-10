/**
 * bzr.webhook — register outbound webhooks for bus events.
 *
 * @example
 * const wh = createWebhooks('my-ware');
 * const hook = await wh.register('order.created', 'https://n8n.example.com/webhook/abc', 'my-secret');
 * await wh.list();
 * await wh.remove(hook.id);
 */

import type { BazaarClientConfig } from './types.js';

export interface Webhook {
	id:         string;
	slug:       string;
	event:      string;
	url:        string;
	created_at: number;
}

export interface WareWebhooks {
	/** List all registered webhooks. */
	list(): Promise<Webhook[]>;
	/** Register a new webhook. Returns the created webhook. */
	register( event: string, url: string, secret?: string ): Promise<Webhook>;
	/** Remove a webhook by id. */
	remove( id: string ): Promise<void>;
}

export function createWebhooks( slug: string, config: BazaarClientConfig ): WareWebhooks {
	const base = `${ config.restUrl }/webhooks/${ encodeURIComponent( slug ) }`;
	const hdr  = { 'X-WP-Nonce': config.nonce, 'Content-Type': 'application/json' };

	return {
		async list(): Promise<Webhook[]> {
			const r = await fetch( base, { headers: hdr } );
			if ( ! r.ok ) throw new Error( `bzr.webhooks [GET] → ${ r.status }` );
			return r.json() as Promise<Webhook[]>;
		},

		async register( event: string, url: string, secret?: string ): Promise<Webhook> {
			const r = await fetch( base, {
				method:  'POST',
				headers: hdr,
				body:    JSON.stringify( { event, url, ...(secret ? { secret } : {}) } ),
			} );
			if ( ! r.ok ) throw new Error( `bzr.webhooks [POST] → ${ r.status }` );
			return r.json() as Promise<Webhook>;
		},

		async remove( id: string ): Promise<void> {
			const r = await fetch( `${ base }/${ encodeURIComponent( id ) }`, {
				method:  'DELETE',
				headers: hdr,
			} );
			if ( ! r.ok ) throw new Error( `bzr.webhooks [DELETE] → ${ r.status }` );
		},
	};
}
