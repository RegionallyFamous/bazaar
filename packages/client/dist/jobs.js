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
export function createJobs(slug, config) {
    const base = `${config.restUrl}/jobs/${encodeURIComponent(slug)}`;
    const hdr = { 'X-WP-Nonce': config.nonce, 'Content-Type': 'application/json' };
    return {
        async list() {
            const r = await fetch(base, { headers: hdr });
            if (!r.ok)
                throw new Error(`bzr.jobs [GET] → ${r.status}`);
            return r.json();
        },
        async trigger(jobId) {
            const r = await fetch(`${base}/${encodeURIComponent(jobId)}`, {
                method: 'POST',
                headers: hdr,
            });
            if (!r.ok)
                throw new Error(`bzr.jobs [POST ${jobId}] → ${r.status}`);
        },
    };
}
//# sourceMappingURL=jobs.js.map