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
      external: [ 'react', 'react-dom', 'react/jsx-runtime' ],
    },
  },

  server: {
    cors: true,
  },
} );
