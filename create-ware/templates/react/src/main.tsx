import { StrictMode }        from 'react';
import { createRoot }        from 'react-dom/client';
import { setBazaarContext }  from '@bazaar/client';
import App                   from './App.tsx';
import './index.css';

// ---------------------------------------------------------------------------
// Dev mode context seeding
//
// When running with `npm run dev` the ware is NOT inside a Bazaar iframe, so
// @bazaar/client can't auto-detect the nonce and REST URL. Set them here from
// Vite env vars defined in .env.local.
//
// Get a fresh nonce: wp eval 'echo wp_create_nonce("wp_rest");'
// ---------------------------------------------------------------------------
if ( import.meta.env.DEV ) {
  setBazaarContext( {
    nonce:    import.meta.env.VITE_WP_NONCE    ?? '',
    restUrl:  import.meta.env.VITE_WP_REST_URL ?? 'http://localhost/wp-json',
    slug:     import.meta.env.VITE_BAZAAR_SLUG ?? '__WARE_SLUG__',
  } );
}

createRoot( document.getElementById( 'root' )! ).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Register the service worker for asset caching after first load.
// The SW is scoped to the direct-serve path injected by Bazaar's <base href>.
if ( 'serviceWorker' in navigator && ! import.meta.env.DEV ) {
  window.addEventListener( 'load', () => {
    navigator.serviceWorker.register( './sw.js' ).catch( () => {} );
  } );
}
