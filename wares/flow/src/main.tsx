import { StrictMode }       from 'react';
import { createRoot }       from 'react-dom/client';
import { setBazaarContext } from '@bazaar/client';
import { ErrorBoundary }    from '@bazaar/design';
import '@bazaar/design/css';
import { registerErrorReporter } from './errorReporter.ts';
import './index.css';
import App                  from './App.tsx';

if ( import.meta.env.DEV ) {
	setBazaarContext( {
		nonce:   import.meta.env.VITE_WP_NONCE    ?? '',
		restUrl: import.meta.env.VITE_WP_REST_URL ?? 'http://localhost/wp-json',
		slug:    'flow',
	} );
}


registerErrorReporter( 'flow' );

createRoot( document.getElementById( 'root' )! ).render(
	<StrictMode>
		<ErrorBoundary>
			<App />
		</ErrorBoundary>
	</StrictMode>,
);

if ( 'serviceWorker' in navigator && ! import.meta.env.DEV ) {
	window.addEventListener( 'load', () => {
		navigator.serviceWorker.register( './sw.js' ).catch( () => {} );
	} );
}
