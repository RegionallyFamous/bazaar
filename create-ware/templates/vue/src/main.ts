import { createApp }        from 'vue';
import { setBazaarContext } from '@bazaar/client';
import App                  from './App.vue';
import './index.css';

// Dev mode: seed context from Vite env vars when not running inside WordPress.
if ( import.meta.env.DEV ) {
  setBazaarContext( {
    nonce:   import.meta.env.VITE_WP_NONCE    ?? '',
    restUrl: import.meta.env.VITE_WP_REST_URL ?? 'http://localhost/wp-json',
    slug:    import.meta.env.VITE_BAZAAR_SLUG ?? '__WARE_SLUG__',
  } );
}

createApp( App ).mount( '#app' );

if ( 'serviceWorker' in navigator && ! import.meta.env.DEV ) {
  window.addEventListener( 'load', () => {
    navigator.serviceWorker.register( './sw.js' ).catch( () => {} );
  } );
}
