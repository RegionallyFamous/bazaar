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
/**
 * Fetch a WP REST endpoint, routing through the shell's shared cache when
 * running inside a Bazaar iframe.
 *
 * @param path WP REST path, e.g. `/wp/v2/posts?per_page=5`
 */
export declare function wpCachedFetch<T>(path: string): Promise<T>;
//# sourceMappingURL=cache.d.ts.map