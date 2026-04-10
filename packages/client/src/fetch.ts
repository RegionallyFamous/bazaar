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
export async function wpFetch( path: string, init?: RequestInit ): Promise<Response> {
  const { nonce, restUrl } = getBazaarContext();

  const url =
    path.startsWith( 'http://' ) || path.startsWith( 'https://' )
      ? path
      : `${ restUrl }${ path.startsWith( '/' ) ? path : '/' + path }`;

  const headers = new Headers( init?.headers );

  if ( ! headers.has( 'X-WP-Nonce' ) ) {
    headers.set( 'X-WP-Nonce', nonce );
  }

  return fetch( url, { ...init, headers } );
}

/**
 * Fetch a WordPress REST endpoint and parse the JSON response.
 *
 * @throws {WpApiError} If the response status is not in the 2xx range.
 */
export async function wpJson<T>( path: string, init?: RequestInit ): Promise<T> {
  const response = await wpFetch( path, init );

  if ( ! response.ok ) {
    let message = `${ response.status } ${ response.statusText }`;
    try {
      const body = await response.json() as { message?: string; code?: string };
      if ( body.message ) message = body.message;
    } catch {
      // ignore JSON parse errors — keep the status-based message
    }
    throw new WpApiError( message, response.status, response );
  }

  return response.json() as Promise<T>;
}

/** Error thrown by `wpJson` when the server returns a non-2xx status. */
export class WpApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly response: Response,
  ) {
    super( message );
    this.name = 'WpApiError';
  }
}
