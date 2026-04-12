import { StrictMode }       from 'react';
import { createRoot }       from 'react-dom/client';
import { setBazaarContext } from '@bazaar/client';
import '@bazaar/design/css';
import './index.css';
import App                  from './App.tsx';

if ( import.meta.env.DEV ) {
	setBazaarContext( {
		nonce:   import.meta.env.VITE_WP_NONCE    ?? '',
		restUrl: import.meta.env.VITE_WP_REST_URL ?? 'http://localhost/wp-json',
		slug:    'mosaic',
	} );
}

// Catppuccin Mocha dark palette — activate design-system dark token layer.
document.documentElement.setAttribute( 'data-theme', 'dark' );

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
