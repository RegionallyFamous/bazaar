import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig( {
	build: {
		outDir: 'admin/dist',
		emptyOutDir: true,
		manifest: true,
		rollupOptions: {
			input: {
				bazaar: resolve( __dirname, 'admin/src/main.js' ),
				shell:  resolve( __dirname, 'admin/src/shell.js' ),
			},
			external: [
				'@wordpress/api-fetch',
				'@wordpress/i18n',
			],
			output: {
				globals: {
					'@wordpress/api-fetch': 'wp.apiFetch',
					'@wordpress/i18n': 'wp.i18n',
				},
				entryFileNames: '[name].js',
				chunkFileNames: '[name]-[hash].js',
				assetFileNames: ( assetInfo ) => {
					if ( assetInfo.name?.endsWith( '.css' ) ) {
						return '[name].css';
					}
					return 'assets/[name]-[hash][extname]';
				},
			},
		},
	},
} );
