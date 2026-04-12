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
    },
  },

  build: {
    outDir:      'dist',
    emptyOutDir: true,
    assetsDir:   'assets',
    // React is used for UI only; no shared importmap needed for synth (shared: [])
  },

  server: {
    cors: true,
  },
} );
