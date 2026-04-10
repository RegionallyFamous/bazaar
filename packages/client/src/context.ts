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

/** The serve path segment used to split the URL into restUrl + slug. */
const SERVE_MARKER = '/bazaar/v1/serve/';

let _context: BazaarContext | null = null;

/**
 * Return the Bazaar context for the current ware.
 *
 * Derived from `window.location` on first call and cached for the lifetime
 * of the page. Call `setBazaarContext()` before this if you need to override
 * any values (e.g. during local development with a Vite dev server).
 *
 * @throws {Error} If called in a non-browser environment.
 */
export function getBazaarContext(): BazaarContext {
  if ( _context !== null ) {
    return _context;
  }

  if ( typeof window === 'undefined' ) {
    throw new Error( '@bazaar/client: getBazaarContext() requires a browser environment.' );
  }

  const href   = window.location.href;
  const params = new URLSearchParams( window.location.search );

  const nonce      = params.get( '_wpnonce' ) ?? '';
  const adminColor = params.get( '_adminColor' ) ?? 'fresh';

  const serveIdx = href.indexOf( SERVE_MARKER );

  let restUrl  = '';
  let slug     = '';
  let serveUrl = '';

  if ( serveIdx !== -1 ) {
    // Running inside a Bazaar iframe — extract everything from the URL.
    restUrl = href.slice( 0, serveIdx );
    const afterServe = href.slice( serveIdx + SERVE_MARKER.length );
    slug     = afterServe.split( '/' )[ 0 ] ?? '';
    serveUrl = restUrl + SERVE_MARKER + slug;
  }

  _context = { nonce, restUrl, serveUrl, slug, adminColor };
  return _context;
}

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
export function setBazaarContext( partial: Partial<BazaarContext> ): void {
  const base: BazaarContext = _context ?? {
    nonce:      '',
    restUrl:    '',
    serveUrl:   '',
    slug:       '',
    adminColor: 'fresh',
  };
  _context = { ...base, ...partial };
}

/** Reset the cached context (useful for testing). */
export function resetBazaarContext(): void {
  _context = null;
}

// ─── Hot context / nonce auto-refresh ────────────────────────────────────────

/** WP REST nonces expire after 12 hours. We refresh after 11 to be safe. */
const NONCE_TTL_MS  = 11 * 60 * 60 * 1000;
let   _nonceTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Refresh the WP REST nonce from the Bazaar nonce endpoint and update the
 * cached context. Safe to call multiple times — clears any existing timer.
 *
 * In dev mode, call this once at startup:
 *   startNonceRefresh();
 */
export async function refreshNonce(): Promise<void> {
  const ctx = getBazaarContext();
  if ( ! ctx.restUrl ) return;

  try {
    const res = await fetch( `${ ctx.restUrl }/bazaar/v1/nonce`, {
      headers: { 'X-WP-Nonce': ctx.nonce },
    } );
    if ( ! res.ok ) return;
    const { nonce } = await res.json() as { nonce: string };
    setBazaarContext( { nonce } );
  } catch {
    // Non-fatal; the old nonce will be used until it expires.
  }
}

/**
 * Start an automatic nonce-refresh cycle.
 * Calls `refreshNonce()` every 11 hours until `stopNonceRefresh()` is called.
 *
 * Recommended usage in long-lived dev-mode wares:
 *   import { startNonceRefresh } from '@bazaar/client';
 *   startNonceRefresh();
 */
export function startNonceRefresh(): void {
  if ( _nonceTimer ) clearTimeout( _nonceTimer );
  _nonceTimer = setTimeout( async () => {
    await refreshNonce();
    startNonceRefresh(); // reschedule
  }, NONCE_TTL_MS );
}

/** Stop the automatic nonce-refresh cycle. */
export function stopNonceRefresh(): void {
  if ( _nonceTimer ) { clearTimeout( _nonceTimer ); _nonceTimer = null; }
}
