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
    id: string;
    label: string;
    interval: string;
    next_run: string | null;
}
export interface WareJobs {
    list(): Promise<Job[]>;
    trigger(jobId: string): Promise<void>;
}
export declare function createJobs(slug: string, config: BazaarClientConfig): WareJobs;
//# sourceMappingURL=jobs.d.ts.map