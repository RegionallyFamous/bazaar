import { defineConfig } from 'vite';
import react            from '@vitejs/plugin-react';
import { resolve }      from 'path';

// https://vite.dev/config/
export default defineConfig( {
  plugins: [ react() ],

  resolve: {
    alias: {
      '@bazaar/client/react':  resolve( __dirname, '../../packages/client/src/hooks.ts' ),
      '@bazaar/client':        resolve( __dirname, '../../packages/client/src/index.ts' ),
      '@bazaar/design/theme':  resolve( __dirname, '../../packages/design/src/theme/adminColor.ts' ),
      '@bazaar/design/css':    resolve( __dirname, '../../packages/design/src/css/index.css' ),
      '@bazaar/design':        resolve( __dirname, '../../packages/design/src/index.ts' ),
    },
  },

  // Relative asset paths allow Bazaar to inject a <base href> and serve
  // JS/CSS/images directly without going through the PHP REST router.
  base: './',

  build: {
    outDir:      'dist',
    emptyOutDir: true,
    assetsDir:   'assets',
    rollupOptions: {
      // React and ReactDOM are provided by the Bazaar shell via an importmap.
      // Marking them external keeps them out of this bundle — the browser loads
      // the shared copy once and reuses it across all ware iframes.
      external: [ 'react', 'react-dom', 'react/jsx-runtime' ],
    },
  },

  // Allow the Vite dev server to accept connections from wp-admin
  // (needed when using wp bazaar dev start).
  server: {
    cors: true,
  },
} );
