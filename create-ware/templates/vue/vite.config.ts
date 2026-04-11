import { defineConfig } from 'vite';
import vue              from '@vitejs/plugin-vue';

export default defineConfig( {
  plugins: [ vue() ],
  base: './',
  build: {
    outDir:      'dist',
    emptyOutDir: true,
    assetsDir:   'assets',
    rollupOptions: {
      // Vue is provided by the Bazaar shell via an importmap.
      // Marking it external keeps it out of this bundle.
      external: [ 'vue' ],
    },
  },
  server: {
    cors: true,
  },
} );
