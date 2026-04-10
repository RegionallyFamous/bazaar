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

import { getBazaarContext } from './context.js';
import { wpJson } from './fetch.js';

let _seq = 0;
const _pending = new Map<string, { resolve: ( v: unknown ) => void; reject: ( e: unknown ) => void }>();

function _inShell(): boolean {
  return typeof window !== 'undefined' && window.parent !== window;
}

// Incoming query-response from the shell.
if ( typeof window !== 'undefined' ) {
  window.addEventListener( 'message', ( event: MessageEvent ) => {
    if ( event.source !== window.parent ) return;
    if ( event.origin !== window.location.origin ) return;

    const { type, id, data } = ( event.data ?? {} ) as Record<string, unknown>;

    if ( type === 'bazaar:query-response' && typeof id === 'string' ) {
      const cb = _pending.get( id );
      if ( cb ) {
        _pending.delete( id );
        cb.resolve( data );
      }
    }
  } );
}

/**
 * Fetch a WP REST endpoint, routing through the shell's shared cache when
 * running inside a Bazaar iframe.
 *
 * @param path WP REST path, e.g. `/wp/v2/posts?per_page=5`
 */
export function wpCachedFetch<T>( path: string ): Promise<T> {
  if ( ! _inShell() ) {
    // Not in a shell — use normal authenticated fetch.
    return wpJson<T>( path );
  }

  const id = `q${ ++_seq }`;

  return new Promise<T>( ( resolve, reject ) => {
    _pending.set( id, { resolve: resolve as ( v: unknown ) => void, reject } );

    window.parent.postMessage(
      { type: 'bazaar:query', id, path },
      window.location.origin,
    );

    // Timeout: if the shell doesn't respond in 10s, fall back to direct fetch.
    setTimeout( () => {
      if ( _pending.has( id ) ) {
        _pending.delete( id );
        wpJson<T>( path ).then( resolve as ( v: T ) => void ).catch( reject );
      }
    }, 10_000 );
  } );
}
