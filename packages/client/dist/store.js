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
/**
 * Create a server-backed key-value store scoped to `slug`.
 *
 * Data is persisted in `wp_usermeta` — it survives browser storage clears
 * and is per-user, per-ware. Pass `getBazaarContext()` as the second argument.
 *
 * @param slug    The ware slug (use `getBazaarContext().slug`).
 * @param config  Client config from `getBazaarContext()`.
 *
 * @example
 * import { createStore, getBazaarContext } from '@bazaar/client';
 * const ctx   = getBazaarContext();
 * const store = createStore( ctx.slug, ctx );
 *
 * await store.set( 'lastTab', 'settings' );
 * const tab = await store.get<string>( 'lastTab' ); // → 'settings' | undefined
 * await store.del( 'lastTab' );
 */
export function createStore(slug, config) {
    const base = `${config.restUrl}/bazaar/v1/store/${encodeURIComponent(slug)}`;
    async function req(method, path, body) {
        const opts = {
            method,
            headers: { 'X-WP-Nonce': config.nonce, 'Content-Type': 'application/json' },
        };
        if (body !== undefined)
            opts.body = JSON.stringify(body);
        const r = await fetch(base + path, opts);
        if (!r.ok)
            throw new Error(`bzr.store [${method} ${path}] → ${r.status}`);
        return r;
    }
    return {
        async get(key) {
            try {
                const r = await req('GET', `/${encodeURIComponent(key)}`);
                const { value } = await r.json();
                return value;
            }
            catch {
                return undefined;
            }
        },
        async set(key, value) {
            await req('PUT', `/${encodeURIComponent(key)}`, { value });
        },
        async del(key) {
            await req('DELETE', `/${encodeURIComponent(key)}`);
        },
        async keys() {
            const r = await req('GET', '');
            return r.json();
        },
        async clear() {
            await req('DELETE', '');
        },
    };
}
//# sourceMappingURL=store.js.map