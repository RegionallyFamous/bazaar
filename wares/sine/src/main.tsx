import { StrictMode }                        from 'react';
import { createRoot }                        from 'react-dom/client';
import { getBazaarContext, setBazaarContext } from '@bazaar/client';
import { ErrorBoundary }                     from '@bazaar/design';
import '@bazaar/design/css';
import './index.css';
import { registerErrorReporter } from './errorReporter.ts';
import App                                   from './App.tsx';

if ( import.meta.env.DEV ) {
	setBazaarContext( {
		nonce:   import.meta.env.VITE_WP_NONCE    ?? '',
		restUrl: import.meta.env.VITE_WP_REST_URL ?? 'http://localhost/wp-json',
		slug:    'sine',
	} );
}

getBazaarContext(); // ensure context is available before rendering
registerErrorReporter( 'sine' );

const rootEl = document.getElementById( 'root' );
if ( rootEl ) {
	createRoot( rootEl ).render(
		<StrictMode>
			<ErrorBoundary>
				<App />
			</ErrorBoundary>
		</StrictMode>,
	);
}
