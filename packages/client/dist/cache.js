/**
 * @bazaar/client — Shared WP REST data cache.
 *
 * When multiple wares request the same WP REST endpoint, the shell deduplicates
 * the HTTP calls. This module provides `wpCachedFetch` which routes requests
 * through the shell's 60-second in-memory cache when running inside a shell
 * iframe, and falls back to a direct fetch otherwise.
 *
 * Usage
 * ─────
 *   import { wpCachedFetch } from '@bazaar/client/cache';
 *
 *   const posts = await wpCachedFetch<WpPost[]>( '/wp/v2/posts?per_page=5' );
 */
import { wpJson } from './fetch.js';
let _seq = 0;
const _pending = new Map();
function _inShell() {
    return typeof window !== 'undefined' && window.parent !== window;
}
// Incoming query responses from the shell.
if (typeof window !== 'undefined') {
    window.addEventListener('message', (event) => {
        if (event.source !== window.parent)
            return;
        if (event.origin !== window.location.origin)
            return;
        const { type, id, data, status } = (event.data ?? {});
        if (type === 'bazaar:query-response' && typeof id === 'string') {
            const cb = _pending.get(id);
            if (cb) {
                _pending.delete(id);
                cb.resolve(data);
            }
        }
        // Fail fast instead of waiting out the 10 s timeout when the shell proxy
        // reports an HTTP error — wares get a rejected promise immediately.
        if (type === 'bazaar:query-error' && typeof id === 'string') {
            const cb = _pending.get(id);
            if (cb) {
                _pending.delete(id);
                cb.reject(new Error(`bazaar:query-error (HTTP ${status ?? 'unknown'})`));
            }
        }
    });
}
/**
 * Fetch a WP REST endpoint, routing through the shell's shared cache when
 * running inside a Bazaar iframe.
 *
 * @param path WP REST path, e.g. `/wp/v2/posts?per_page=5`
 */
export function wpCachedFetch(path) {
    if (!_inShell()) {
        // Not in a shell — use normal authenticated fetch.
        return wpJson(path);
    }
    const id = `q${++_seq}`;
    return new Promise((resolve, reject) => {
        _pending.set(id, { resolve: resolve, reject });
        window.parent.postMessage({ type: 'bazaar:query', id, path }, window.location.origin);
        // Timeout: if the shell doesn't respond in 10s, fall back to direct fetch.
        setTimeout(() => {
            if (_pending.has(id)) {
                _pending.delete(id);
                wpJson(path).then(resolve).catch(reject);
            }
        }, 10000);
    });
}
//# sourceMappingURL=cache.js.map