import { StrictMode }       from 'react';
import { createRoot }       from 'react-dom/client';
import { setBazaarContext, getBazaarContext } from '@bazaar/client';
import { applyAdminColor }  from '@bazaar/design/theme';
import '@bazaar/design/css';
import App                  from './App.tsx';

if ( import.meta.env.DEV ) {
	setBazaarContext( {
		nonce:   import.meta.env.VITE_WP_NONCE    ?? '',
		restUrl: import.meta.env.VITE_WP_REST_URL ?? 'http://localhost/wp-json',
		slug:    'ledger',
	} );
}

applyAdminColor( getBazaarContext().adminColor );

createRoot( document.getElementById( 'root' )! ).render(
	<StrictMode>
		<App />
	</StrictMode>,
);

if ( 'serviceWorker' in navigator && ! import.meta.env.DEV ) {
	window.addEventListener( 'load', () => {
		navigator.serviceWorker.register( './sw.js' ).catch( () => {} );
	} );
}
