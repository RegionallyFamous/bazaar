/**
 * @bazaar/client/react — React hooks for WordPress data.
 *
 * Import from the subpath: import { useCurrentUser } from '@bazaar/client/react'
 *
 * React is a peer dependency and must be installed in the ware project.
 */
import type { WpPost, WpPostQuery, WpUser } from './types.js';
export interface UseQueryResult<T> {
    data: T | null;
    loading: boolean;
    error: Error | null;
    /** Manually re-trigger the fetch. */
    refetch: () => void;
}
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
export declare function useWpFetch<T>(path: string): UseQueryResult<T>;
export interface UseCurrentUserResult {
    user: WpUser | null;
    loading: boolean;
    error: Error | null;
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
export declare function useCurrentUser(): UseCurrentUserResult;
export interface UseWpPostsResult extends UseQueryResult<WpPost[]> {
    posts: WpPost[];
}
/**
 * Fetch WordPress posts with optional query parameters.
 *
 * @example
 * const { posts, loading } = useWpPosts({ per_page: 5, status: 'publish' });
 */
export declare function useWpPosts(query?: WpPostQuery): UseWpPostsResult;
//# sourceMappingURL=hooks.d.ts.map