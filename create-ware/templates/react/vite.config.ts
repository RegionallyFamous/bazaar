import { defineConfig } from 'vite';
import react            from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig( {
  plugins: [ react() ],

  // Relative asset paths allow Bazaar to inject a <base href> and serve
  // JS/CSS/images directly without going through the PHP REST router.
  base: './',

  build: {
    outDir:      'dist',
    emptyOutDir: true,
    assetsDir:   'assets',
  },

  // Allow the Vite dev server to accept connections from wp-admin
  // (needed when using wp bazaar dev start).
  server: {
    cors: true,
  },
} );
