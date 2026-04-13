/**
 * @bazaar/client — authenticated fetch wrappers.
 *
 * All functions automatically:
 *   - Add the `X-WP-Nonce` header so WordPress accepts the request
 *   - Resolve relative paths against the WordPress REST base URL
 */
/**
 * Fetch a WordPress REST endpoint with automatic nonce authentication.
 *
 * @param path  A full URL, or a path relative to the REST base
 *              (e.g. `/wp/v2/posts` or `wp/v2/posts`).
 * @param init  Standard `RequestInit` options. Headers you supply are merged
 *              with the nonce header; your values take precedence.
 */
export declare function wpFetch(path: string, init?: RequestInit): Promise<Response>;
/**
 * Options for `wpJson`, extending standard `RequestInit`.
 *
 * The optional `validate` callback provides runtime type-narrowing for the
 * parsed JSON before it is returned. When omitted, the response is cast to
 * `T` with no runtime validation.
 */
export interface WpJsonOptions<T> extends RequestInit {
    validate?: (raw: unknown) => T;
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
export declare function wpJson<T>(path: string, init?: WpJsonOptions<T>): Promise<T>;
/** Error thrown by `wpJson` when the server returns a non-2xx status. */
export declare class WpApiError extends Error {
    readonly status: number;
    readonly response: Response;
    constructor(message: string, status: number, response: Response);
}
//# sourceMappingURL=fetch.d.ts.map