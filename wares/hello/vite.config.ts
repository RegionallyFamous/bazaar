/**
 * Canonical vite.config.ts for a Bazaar React ware.
 *
 * Three things are non-negotiable:
 *   1. base: './'  — relative asset URLs work inside the Bazaar iframe
 *   2. resolve.alias  — resolves @bazaar/* from monorepo source in dev
 *   3. rollupOptions.external  — React is provided by the shell import map;
 *      list here every package declared in manifest.json "shared"
 */
import { defineConfig } from 'vite';
import react            from '@vitejs/plugin-react';
import { resolve }      from 'path';

export default defineConfig( {
  plugins: [ react() ],

  base: './',

  resolve: {
    alias: {
      '@bazaar/client':       resolve( __dirname, '../../packages/client/src/index.ts' ),
      '@bazaar/client/react': resolve( __dirname, '../../packages/client/src/hooks.ts' ),
      '@bazaar/design/theme': resolve( __dirname, '../../packages/design/src/theme/adminColor.ts' ),
      '@bazaar/design/css':   resolve( __dirname, '../../packages/design/src/css/index.css' ),
      '@bazaar/design':       resolve( __dirname, '../../packages/design/src/index.ts' ),
    },
  },

  build: {
    outDir:      'dist',
    emptyOutDir: true,
    assetsDir:   'assets',
    rollupOptions: {
      // Must mirror the "shared" array in manifest.json exactly.
      // The shell injects these via an import map — bundling them too would
      // create two separate React instances and break hooks.
      external: [ 'react', 'react-dom', 'react/jsx-runtime' ],
    },
  },

  server: {
    // Required so the Bazaar dev proxy (wp bazaar dev start) can reach Vite.
    cors: true,
  },
} );
