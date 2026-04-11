import { StrictMode }       from 'react';
import { createRoot }       from 'react-dom/client';
import { setBazaarContext } from '@bazaar/client';
import App                  from './App.tsx';
import './index.css';

if ( import.meta.env.DEV ) {
	setBazaarContext( {
		nonce:   import.meta.env.VITE_WP_NONCE    ?? '',
		restUrl: import.meta.env.VITE_WP_REST_URL ?? 'http://localhost/wp-json',
		slug:    'focus',
	} );
}

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
