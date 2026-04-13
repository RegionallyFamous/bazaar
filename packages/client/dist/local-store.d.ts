/**
 * createWaredStore — lazy server-store + localStorage fallback factory.
 *
 * Wares that persist data through the Bazaar storage API while also wanting
 * a localStorage fallback for offline or context-less environments can use
 * this factory instead of re-implementing the same pattern in every ware.
 *
 * @example
 * const store = createWaredStore({ slug: 'flow', lsPrefix: 'bzr-flow-', lsPrefixOld: 'bzr-focus-' });
 * const tasks = await store.load<Task[]>('tasks') ?? [];
 * await store.save('tasks', tasks);
 */
export interface WaredStoreOptions {
    /** Ware slug used when initialising the server-backed `WareStore`. */
    slug: string;
    /** Prefix prepended to the key when reading/writing localStorage, e.g. `'bzr-flow-'`. */
    lsPrefix: string;
    /** Legacy localStorage prefix — if set, data is migrated from this prefix to `lsPrefix` transparently. */
    lsPrefixOld?: string;
}
export interface WaredStore {
    /** Load a value from the server store if available, otherwise from localStorage. */
    load<T>(key: string): Promise<T | undefined>;
    /**
     * Persist a value. Tries the server store first; on failure it falls back to
     * localStorage and shows a toast warning.
     */
    save(key: string, value: unknown): Promise<void>;
}
/**
 * Create a store that combines a server-backed `WareStore` with a
 * localStorage fallback, following the canonical Bazaar ware storage pattern.
 */
export declare function createWaredStore(options: WaredStoreOptions): WaredStore;
//# sourceMappingURL=local-store.d.ts.map