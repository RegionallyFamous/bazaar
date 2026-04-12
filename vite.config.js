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
			// Preserve all exports from every entry point so shared lib bundles
			// expose their full API even though no other entry in this build
			// imports from them.
			preserveEntrySignatures: 'exports-only',
			input: {
				bazaar:            resolve( __dirname, 'admin/src/main.js' ),
				shell:             resolve( __dirname, 'admin/src/shell.js' ),
				'zero-trust-sw':   resolve( __dirname, 'admin/src/zero-trust-sw.js' ),
			// Shared bundles — hosted by the shell, referenced via importmap.
			// Content-hashed so they can be cached immutably by browsers and SWs.
			'shared/react':             resolve( __dirname, 'admin/src/shared/react.js' ),
			'shared/react-dom':         resolve( __dirname, 'admin/src/shared/react-dom.js' ),
			'shared/react-jsx-runtime': resolve( __dirname, 'admin/src/shared/react-jsx-runtime.js' ),
			'shared/vue':               resolve( __dirname, 'admin/src/shared/vue.js' ),
			},
			output: {
				// Shared libs get content-hash in their filename; other entries keep
				// stable names so WordPress enqueue handles work without manifest lookups.
				entryFileNames: ( chunkInfo ) =>
					chunkInfo.name.startsWith( 'shared/' )
						? '[name]-[hash].js'
						: '[name].js',
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
