import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig( {
  plugins: [ react() ],
  resolve: {
    alias: {
      '@bazaar/client':       resolve( __dirname, '../../packages/client/src/index.ts' ),
      '@bazaar/client/react': resolve( __dirname, '../../packages/client/src/hooks.ts' ),
      '@bazaar/design/theme': resolve( __dirname, '../../packages/design/src/theme/adminColor.ts' ),
      '@bazaar/design/css':   resolve( __dirname, '../../packages/design/src/css/index.css' ),
      '@bazaar/design':       resolve( __dirname, '../../packages/design/src/index.ts' ),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: [ './src/__tests__/setup.ts' ],
    coverage: {
      thresholds: { lines: 70, branches: 60, functions: 70 },
      provider: 'v8',
      include: [ 'src/**/*.{ts,tsx}' ],
      exclude: [ 'src/main.tsx', 'src/**/__tests__/**' ],
    },
  },
} );
