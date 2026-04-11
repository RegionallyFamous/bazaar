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
    /** Write a value. */
    set<T = JsonValue>(key: string, value: T): Promise<void>;
    /** Delete a key. */
    del(key: string): Promise<void>;
    /** List all keys. */
    keys(): Promise<string[]>;
    /** Delete all keys for this ware. */
    clear(): Promise<void>;
}
/**
 * Create a store instance scoped to `slug`.
 */
export declare function createStore(slug: string, config: BazaarClientConfig): WareStore;
export {};
//# sourceMappingURL=store.d.ts.map