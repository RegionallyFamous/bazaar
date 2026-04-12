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
    rollupOptions: {
      // React is bundled into the ware so the .wp archive is fully self-contained.
      // Wares that want to share the shell's React copy may opt in via manifest
      // "shared" + an importmap — but that requires the host to provide it.
    },
  },

  server: {
    cors: true,
  },
} );
