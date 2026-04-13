import { StrictMode }                        from 'react';
import { createRoot }                        from 'react-dom/client';
import { getBazaarContext, setBazaarContext } from '@bazaar/client';
import { applyAdminColor }                   from '@bazaar/design/theme';
import { ErrorBoundary }                     from '@bazaar/design';
import '@bazaar/design/css';
import { registerErrorReporter } from './errorReporter.ts';
import App                                   from './App.tsx';

if ( import.meta.env.DEV ) {
	setBazaarContext( {
		nonce:   import.meta.env.VITE_WP_NONCE    ?? '',
		restUrl: import.meta.env.VITE_WP_REST_URL ?? 'http://localhost/wp-json',
		slug:    'board',
	} );
}

applyAdminColor( getBazaarContext().adminColor );
registerErrorReporter( 'board' );

const root = document.getElementById( 'root' );
if ( root ) {
	createRoot( root ).render(
		<StrictMode>
			<ErrorBoundary>
				<App />
			</ErrorBoundary>
		</StrictMode>,
	);
}
