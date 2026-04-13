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
 * Fetch any WordPress REST endpoint and return reactive `{ data, loading, error, refetch }`.
 *
 * - Re-runs automatically whenever `path` changes.
 * - Cancels the in-flight request if the component unmounts before it resolves.
 * - Call `refetch()` to manually re-trigger without changing the path.
 *
 * @param path  REST path relative to the base URL, e.g. `/wp/v2/posts?per_page=5`.
 *
 * @example
 * const { data, loading, error, refetch } =
 *   useWpFetch<{ items: Item[] }>( '/bazaar/v1/my-ware/items' );
 *
 * if ( loading ) return <Spinner />;
 * if ( error )   return <p role="alert">{ error.message } <button onClick={ refetch }>Retry</button></p>;
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

export interface UseCurrentUserResult {
  user:    WpUser | null;
  loading: boolean;
  error:   Error | null;
}

/**
 * Return the currently logged-in WordPress user plus reactive loading/error state.
 *
 * Exposes `loading` and `error` so callers can distinguish an auth failure or
 * network error from a still-in-flight request — previously both looked like
 * `null` to the caller.
 *
 * @example
 * const { user, loading, error } = useCurrentUser();
 * return <p>Hello, {user?.name ?? '…'}</p>;
 */
export function useCurrentUser(): UseCurrentUserResult {
  const { data: user, loading, error } = useWpFetch<WpUser>( '/wp/v2/users/me' );
  return { user, loading, error };
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
