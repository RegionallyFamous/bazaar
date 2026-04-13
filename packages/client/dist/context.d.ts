/**
 * @bazaar/client — context extraction and manual override.
 *
 * In production the ware's iframe src is:
 *   {origin}/wp-json/bazaar/v1/serve/{slug}/index.html?_wpnonce=…&_adminColor=…
 *
 * In development (Vite dev server / localhost) the URL won't contain the
 * Bazaar serve path. Call setBazaarContext() early in your entry point to
 * seed the context from your Vite env vars instead.
 */
import type { BazaarContext } from './types.js';
/**
 * Return the Bazaar context for the current ware.
 *
 * Derived from `window.location` on first call and cached for the lifetime
 * of the page. Call `setBazaarContext()` before this if you need to override
 * any values (e.g. during local development with a Vite dev server).
 *
 * @throws {Error} If called in a non-browser environment.
 */
export declare function getBazaarContext(): BazaarContext;
/**
 * Override (seed) context values before `getBazaarContext()` is first called.
 *
 * Primarily for local development with a Vite dev server:
 *
 * ```ts
 * // main.tsx
 * if (import.meta.env.DEV) {
 *   setBazaarContext({
 *     nonce:    import.meta.env.VITE_WP_NONCE,
 *     restUrl:  import.meta.env.VITE_WP_REST_URL,
 *     slug:     import.meta.env.VITE_BAZAAR_SLUG,
 *   });
 * }
 * ```
 */
export declare function setBazaarContext(partial: Partial<BazaarContext>): void;
/** Reset the cached context (useful for testing). */
export declare function resetBazaarContext(): void;
/**
 * Refresh the WP REST nonce from the Bazaar nonce endpoint and update the
 * cached context. Safe to call multiple times — clears any existing timer.
 *
 * In dev mode, call this once at startup:
 *   startNonceRefresh();
 */
export declare function refreshNonce(): Promise<void>;
/**
 * Start an automatic nonce-refresh cycle.
 * Calls `refreshNonce()` every 11 hours until `stopNonceRefresh()` is called.
 *
 * Recommended usage in long-lived dev-mode wares:
 *   import { startNonceRefresh } from '@bazaar/client';
 *   startNonceRefresh();
 */
export declare function startNonceRefresh(): void;
/** Stop the automatic nonce-refresh cycle. */
export declare function stopNonceRefresh(): void;
//# sourceMappingURL=context.d.ts.map