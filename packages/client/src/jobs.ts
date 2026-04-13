/**
 * bzr.scheduleJob — client-side bridge to the background jobs REST API.
 *
 * In practice, jobs are declared in `manifest.json` and run server-side
 * via WP-Cron. This client module provides:
 *   - A way to list declared jobs and their next-run time.
 *   - A way to manually trigger a job from the admin UI.
 *
 * @example
 * const jobs = createJobs('my-ware');
 * const list = await jobs.list();
 * await jobs.trigger('sync_products');
 */

import type { BazaarClientConfig } from './types.js';

export interface Job {
	id:       string;
	label:    string;
	interval: string;
	next_run: string | null;  // ISO 8601 or null if not scheduled
}

export interface WareJobs {
	list(): Promise<Job[]>;
	trigger( jobId: string ): Promise<void>;
}

/**
 * Create a jobs client scoped to `slug`.
 *
 * Jobs are declared in `manifest.json` and run server-side via WP-Cron.
 * This client lets you list declared jobs and trigger them from the UI.
 *
 * @param slug    The ware slug (use `getBazaarContext().slug`).
 * @param config  Client config from `getBazaarContext()`.
 *
 * @example
 * import { createJobs, getBazaarContext } from '@bazaar/client';
 * const ctx  = getBazaarContext();
 * const jobs = createJobs( ctx.slug, ctx );
 *
 * const list = await jobs.list();
 * await jobs.trigger( 'sync_orders' );
 */
export function createJobs( slug: string, config: BazaarClientConfig ): WareJobs {
	const base = `${ config.restUrl }/bazaar/v1/jobs/${ encodeURIComponent( slug ) }`;
	const hdr  = { 'X-WP-Nonce': config.nonce, 'Content-Type': 'application/json' };

	return {
		async list(): Promise<Job[]> {
			const r = await fetch( base, { headers: hdr } );
			if ( ! r.ok ) throw new Error( `bzr.jobs [GET] → ${ r.status }` );
			return r.json() as Promise<Job[]>;
		},

		async trigger( jobId: string ): Promise<void> {
			const r = await fetch( `${ base }/${ encodeURIComponent( jobId ) }`, {
				method:  'POST',
				headers: hdr,
			} );
			if ( ! r.ok ) throw new Error( `bzr.jobs [POST ${ jobId }] → ${ r.status }` );
		},
	};
}
