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
 * Fetch a WordPress REST endpoint and return reactive state.
 *
 * Re-runs whenever `path` changes. Cleans up in-flight requests on unmount.
 *
 * @example
 * const { data: posts, loading } = useWpFetch<WpPost[]>('/wp/v2/posts');
 */
export declare function useWpFetch<T>(path: string): UseQueryResult<T>;
/**
 * Return the currently logged-in WordPress user, or null while loading.
 *
 * @example
 * const user = useCurrentUser();
 * return <p>Hello, {user?.name ?? '…'}</p>;
 */
export declare function useCurrentUser(): WpUser | null;
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