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
import { getBazaarContext } from './context.js';
import { createStore } from './store.js';
import { bzr } from './bus.js';
/**
 * Create a store that combines a server-backed `WareStore` with a
 * localStorage fallback, following the canonical Bazaar ware storage pattern.
 */
export function createWaredStore(options) {
    let _server = null;
    function getServer() {
        if (!_server) {
            try {
                _server = createStore(options.slug, getBazaarContext());
            }
            catch {
                return null;
            }
        }
        return _server;
    }
    function lsGet(key) {
        try {
            const cur = localStorage.getItem(options.lsPrefix + key);
            if (cur)
                return JSON.parse(cur);
            if (options.lsPrefixOld) {
                const old = localStorage.getItem(options.lsPrefixOld + key);
                if (old) {
                    localStorage.setItem(options.lsPrefix + key, old);
                    localStorage.removeItem(options.lsPrefixOld + key);
                    return JSON.parse(old);
                }
            }
        }
        catch { /* corrupt or unavailable */ }
        return undefined;
    }
    function lsSet(key, value) {
        try {
            localStorage.setItem(options.lsPrefix + key, JSON.stringify(value));
        }
        catch { /* quota exceeded or storage unavailable */ }
    }
    return {
        async load(key) {
            const server = getServer();
            if (server)
                return server.get(key);
            return lsGet(key);
        },
        async save(key, value) {
            const server = getServer();
            if (server) {
                try {
                    await server.set(key, value);
                    return;
                }
                catch {
                    bzr.toast('Saved locally — server unreachable', 'warning');
                }
            }
            lsSet(key, value);
        },
    };
}
//# sourceMappingURL=local-store.js.map