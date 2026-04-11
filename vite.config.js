import { defineConfig } from 'vite';
import { resolve } from 'path';

/**
 * WordPress packages are loaded by WordPress core as window globals
 * (wp.apiFetch, wp.i18n, …). We expose only the named exports actually
 * used by our code so the built files contain zero `import` statements
 * and can be enqueued as classic scripts — no `type="module"` required.
 */
const WP_GLOBALS = {
	'@wordpress/api-fetch': {
		module:  'wp.apiFetch',
		named:   [],          // default-only import
	},
	'@wordpress/i18n': {
		module:  'wp.i18n',
		named:   [ '__', '_n', '_x', 'sprintf', 'isRTL' ],
	},
};

/** Vite plugin: resolve @wordpress/* to inline global-accessor shims. */
function wpExternals() {
	return {
		name: 'wp-externals',
		resolveId( id ) {
			return id in WP_GLOBALS ? `\0wp-external:${ id }` : null;
		},
		load( id ) {
			if ( ! id.startsWith( '\0wp-external:' ) ) return null;
			const pkg    = id.slice( '\0wp-external:'.length );
			const { module: glob, named } = WP_GLOBALS[ pkg ];
			const lines  = [ `const _mod = window.${ glob };` ];
			lines.push( `export default _mod;` );
			if ( named.length ) {
				lines.push( `export const { ${ named.join( ', ' ) } } = _mod;` );
			}
			return lines.join( '\n' );
		},
	};
}

export default defineConfig( {
	plugins: [ wpExternals() ],
	build: {
		outDir: 'admin/dist',
		emptyOutDir: true,
		manifest: true,
		rollupOptions: {
			input: {
				bazaar:           resolve( __dirname, 'admin/src/main.js' ),
				shell:            resolve( __dirname, 'admin/src/shell.js' ),
				'zero-trust-sw':  resolve( __dirname, 'admin/src/zero-trust-sw.js' ),
			},
			output: {
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
