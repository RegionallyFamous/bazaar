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
 * Fetch a WordPress REST endpoint and parse the JSON response.
 *
 * @throws {WpApiError} If the response status is not in the 2xx range.
 */
export declare function wpJson<T>(path: string, init?: RequestInit): Promise<T>;
/** Error thrown by `wpJson` when the server returns a non-2xx status. */
export declare class WpApiError extends Error {
    readonly status: number;
    readonly response: Response;
    constructor(message: string, status: number, response: Response);
}
//# sourceMappingURL=fetch.d.ts.map