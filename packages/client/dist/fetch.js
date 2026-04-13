/**
 * @bazaar/client — authenticated fetch wrappers.
 *
 * All functions automatically:
 *   - Add the `X-WP-Nonce` header so WordPress accepts the request
 *   - Resolve relative paths against the WordPress REST base URL
 */
import { getBazaarContext } from './context.js';
/**
 * Fetch a WordPress REST endpoint with automatic nonce authentication.
 *
 * @param path  A full URL, or a path relative to the REST base
 *              (e.g. `/wp/v2/posts` or `wp/v2/posts`).
 * @param init  Standard `RequestInit` options. Headers you supply are merged
 *              with the nonce header; your values take precedence.
 */
export async function wpFetch(path, init) {
    const { nonce, restUrl } = getBazaarContext();
    const url = path.startsWith('http://') || path.startsWith('https://')
        ? path
        : `${restUrl}${path.startsWith('/') ? path : '/' + path}`;
    const headers = new Headers(init?.headers);
    if (!headers.has('X-WP-Nonce')) {
        headers.set('X-WP-Nonce', nonce);
    }
    return fetch(url, { ...init, headers });
}
/**
 * Fetch a WordPress REST endpoint and parse the JSON response.
 *
 * Nonce and base URL are added automatically from `getBazaarContext()`.
 *
 * @param path  A full URL, or a path relative to the REST base (e.g. `/wp/v2/posts`).
 * @param init  Standard `RequestInit` options plus an optional `validate` callback.
 *
 * @throws {WpApiError} If the response status is not in the 2xx range.
 *
 * @example
 * // GET
 * const posts = await wpJson<WpPost[]>( '/wp/v2/posts?per_page=5' );
 *
 * @example
 * // POST
 * const created = await wpJson<{ id: number }>( '/bazaar/v1/my-ware/items', {
 *   method: 'POST',
 *   body:   JSON.stringify( { name: 'New item' } ),
 * } );
 *
 * @example
 * // DELETE with error handling
 * try {
 *   await wpJson( `/bazaar/v1/my-ware/items/${ id }`, { method: 'DELETE' } );
 * } catch ( err ) {
 *   if ( err instanceof WpApiError && err.status === 404 ) { ... }
 * }
 */
export async function wpJson(path, init) {
    const response = await wpFetch(path, init);
    if (!response.ok) {
        let message = `${response.status} ${response.statusText}`;
        try {
            const body = await response.json();
            if (body.message)
                message = body.message;
        }
        catch {
            // ignore JSON parse errors — keep the status-based message
        }
        throw new WpApiError(message, response.status, response);
    }
    const raw = await response.json();
    return init?.validate ? init.validate(raw) : raw;
}
/** Error thrown by `wpJson` when the server returns a non-2xx status. */
export class WpApiError extends Error {
    constructor(message, status, response) {
        super(message);
        this.status = status;
        this.response = response;
        this.name = 'WpApiError';
    }
}
//# sourceMappingURL=fetch.js.map