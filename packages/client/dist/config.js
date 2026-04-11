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
export function createConfig(slug, config) {
    const base = `${config.restUrl}/config/${encodeURIComponent(slug)}`;
    const hdr = { 'X-WP-Nonce': config.nonce, 'Content-Type': 'application/json' };
    return {
        async get(key) {
            const r = await fetch(base, { headers: hdr });
            if (!r.ok)
                return undefined;
            const { values } = await r.json();
            return values[key];
        },
        async getAll() {
            const r = await fetch(base, { headers: hdr });
            if (!r.ok)
                throw new Error(`bzr.config [GET] → ${r.status}`);
            return r.json();
        },
        async set(values) {
            const r = await fetch(base, {
                method: 'PATCH',
                headers: hdr,
                body: JSON.stringify({ values }),
            });
            if (!r.ok)
                throw new Error(`bzr.config [PATCH] → ${r.status}`);
        },
        async reset(key) {
            const r = await fetch(`${base}/${encodeURIComponent(key)}`, {
                method: 'DELETE',
                headers: hdr,
            });
            if (!r.ok)
                throw new Error(`bzr.config [DELETE] → ${r.status}`);
        },
    };
}
//# sourceMappingURL=config.js.map