import { getBazaarContext } from '@bazaar/client';

/**
 * Wire up global error handlers that POST unhandled JS errors to the
 * Bazaar error log endpoint (`POST /bazaar/v1/errors`).
 *
 * Call this once near the top of each ware's main.tsx, after context
 * is available. Silently no-ops if the Bazaar context is unavailable
 * (e.g. in dev mode before a WP server is running).
 */
export function registerErrorReporter( slug: string ): void {
	function reportError( err: unknown ): void {
		try {
			const { restUrl, nonce } = getBazaarContext();
			const message = err instanceof Error ? err.message : String( err ?? 'Unknown error' );
			const stack   = err instanceof Error ? ( err.stack ?? '' ) : '';
			fetch( `${ restUrl }/bazaar/v1/errors`, {
				method:  'POST',
				headers: {
					'Content-Type': 'application/json',
					'X-WP-Nonce':   nonce,
				},
				body: JSON.stringify( { slug, message, stack, url: location.href } ),
			} ).catch( () => { /* swallow network errors — error reporting should never throw */ } );
		} catch {
			// getBazaarContext threw (no WP context) — skip silently
		}
	}

	window.addEventListener( 'error',             ( e ) => { reportError( e.error ); } );
	window.addEventListener( 'unhandledrejection', ( e ) => { reportError( e.reason ); } );
}
