/**
 * @bazaar/client/react — React hooks for WordPress data.
 *
 * Import from the subpath: import { useCurrentUser } from '@bazaar/client/react'
 *
 * React is a peer dependency and must be installed in the ware project.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { wpJson } from './fetch.js';
import type { WpPost, WpPostQuery, WpUser } from './types.js';

// ---------------------------------------------------------------------------
// Shared shape
// ---------------------------------------------------------------------------

export interface UseQueryResult<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  /** Manually re-trigger the fetch. */
  refetch: () => void;
}

// ---------------------------------------------------------------------------
// Generic fetcher
// ---------------------------------------------------------------------------

/**
 * Fetch a WordPress REST endpoint and return reactive state.
 *
 * Re-runs whenever `path` changes. Cleans up in-flight requests on unmount.
 *
 * @example
 * const { data: posts, loading } = useWpFetch<WpPost[]>('/wp/v2/posts');
 */
export function useWpFetch<T>( path: string ): UseQueryResult<T> {
  const [ state, setState ] = useState<Omit<UseQueryResult<T>, 'refetch'>>( {
    data:    null,
    loading: true,
    error:   null,
  } );
  const [ tick, setTick ] = useState( 0 );
  const refetch = useCallback( () => setTick( n => n + 1 ), [] );

  useEffect( () => {
    let cancelled = false;
    setState( { data: null, loading: true, error: null } );

    wpJson<T>( path )
      .then( data => {
        if ( ! cancelled ) setState( { data, loading: false, error: null } );
      } )
      .catch( ( error: Error ) => {
        if ( ! cancelled ) setState( { data: null, loading: false, error } );
      } );

    return () => { cancelled = true; };
  // `tick` forces a refetch when the consumer calls refetch().
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ path, tick ] );

  return { ...state, refetch };
}

// ---------------------------------------------------------------------------
// Current user
// ---------------------------------------------------------------------------

/**
 * Return the currently logged-in WordPress user, or null while loading.
 *
 * @example
 * const user = useCurrentUser();
 * return <p>Hello, {user?.name ?? '…'}</p>;
 */
export function useCurrentUser(): WpUser | null {
  const { data } = useWpFetch<WpUser>( '/wp/v2/users/me' );
  return data;
}

// ---------------------------------------------------------------------------
// Posts
// ---------------------------------------------------------------------------

export interface UseWpPostsResult extends UseQueryResult<WpPost[]> {
  posts: WpPost[];
}

/**
 * Fetch WordPress posts with optional query parameters.
 *
 * @example
 * const { posts, loading } = useWpPosts({ per_page: 5, status: 'publish' });
 */
export function useWpPosts( query: WpPostQuery = {} ): UseWpPostsResult {
  // Serialise the query so the effect only re-runs when it actually changes.
  const serialised = JSON.stringify( query );
  const queryRef   = useRef( serialised );
  if ( queryRef.current !== serialised ) {
    queryRef.current = serialised;
  }

  const params = new URLSearchParams(
    Object.entries( JSON.parse( queryRef.current ) as Record<string, unknown> )
      .filter( ( [ , v ] ) => v !== undefined )
      .map( ( [ k, v ] ) => [ k, String( v ) ] ),
  ).toString();

  const path   = `/wp/v2/posts${ params ? '?' + params : '' }`;
  const result = useWpFetch<WpPost[]>( path );

  return { ...result, posts: result.data ?? [] };
}
