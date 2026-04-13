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
type JsonValue = string | number | boolean | null | JsonValue[] | {
    [k: string]: JsonValue;
};
export interface WareStore {
    /** Read a value; returns `undefined` if the key doesn't exist. */
    get<T = JsonValue>(key: string): Promise<T | undefined>;
    /**
     * Write a value. The value must be JSON-serializable; TypeScript cannot
     * verify this at compile time so the parameter type is `unknown`.
     */
    set(key: string, value: unknown): Promise<void>;
    /** Delete a key. */
    del(key: string): Promise<void>;
    /** List all keys. */
    keys(): Promise<string[]>;
    /** Delete all keys for this ware. */
    clear(): Promise<void>;
}
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
export declare function createStore(slug: string, config: BazaarClientConfig): WareStore;
export {};
//# sourceMappingURL=store.d.ts.map