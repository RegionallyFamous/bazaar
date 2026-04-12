<?php
/**
 * Ware server — serves ware static files through an authenticated REST endpoint.
 *
 * @package Bazaar
 */

declare( strict_types=1 );

namespace Bazaar\REST;

defined( 'ABSPATH' ) || exit;

use Bazaar\Blocks\WareBlock;
use Bazaar\WareRegistryInterface;
use WP_Error;
use WP_REST_Request;
use WP_REST_Response;
use WP_REST_Server;

/**
 * Serves ware static files through an authenticated REST endpoint.
 *
 * GET /wp-json/bazaar/v1/serve/{slug}/{file}
 *
 * Security:
 *   - Requires login + the capability declared in the ware's manifest.
 *   - realpath() confinement prevents path traversal.
 *   - ".." rejected at both the route validation and callback layers.
 *   - PHP files can never be present (upload validator rejects them).
 *   - A Content-Security-Policy is injected for HTML responses.
 *
 * Performance:
 *   - ETag (file mtime + size hash) + Last-Modified for conditional requests.
 *   - 304 Not Modified returned when the client's cached copy is still fresh.
 *   - Cache-Control differentiated by file type (HTML short, assets long).
 *   - File is read only after all header checks pass (avoids disk reads on 304).
 *   - Files larger than MAX_SERVE_BYTES are rejected to protect PHP memory.
 */
final class WareServer {

	/** REST API namespace for all Bazaar routes. */
	private const NAMESPACE = 'bazaar/v1';

	/**
	 * Upper bound on the size of a file that will be read into PHP memory and
	 * served through this endpoint. 50 MB should cover any realistic ware asset;
	 * raise via the bazaar_max_serve_bytes filter if needed.
	 */
	private const MAX_SERVE_BYTES = 50 * 1024 * 1024;

	/**
	 * Cache lifetime (in seconds) for non-HTML static assets.
	 * Assets with content-hash filenames can safely be cached for a long time.
	 */
	private const ASSET_MAX_AGE = 31536000; // 1 year

	/**
	 * Cache lifetime (in seconds) for HTML entry files.
	 * Short because HTML may embed a rotating nonce and should revalidate often.
	 */
	private const HTML_MAX_AGE = 300; // 5 minutes

	/** MIME types served for common static asset extensions. */
	private const MIME_MAP = array(
		'html'  => 'text/html; charset=UTF-8',
		'htm'   => 'text/html; charset=UTF-8',
		'css'   => 'text/css',
		'js'    => 'application/javascript',
		'mjs'   => 'application/javascript',
		'json'  => 'application/json',
		'map'   => 'application/json',
		'svg'   => 'image/svg+xml',
		'png'   => 'image/png',
		'jpg'   => 'image/jpeg',
		'jpeg'  => 'image/jpeg',
		'gif'   => 'image/gif',
		'webp'  => 'image/webp',
		'avif'  => 'image/avif',
		'ico'   => 'image/x-icon',
		'woff'  => 'font/woff',
		'woff2' => 'font/woff2',
		'ttf'   => 'font/ttf',
		'otf'   => 'font/otf',
		'mp4'   => 'video/mp4',
		'webm'  => 'video/webm',
		'txt'   => 'text/plain; charset=UTF-8',
		'xml'   => 'application/xml',
		'pdf'   => 'application/pdf',
		'zip'   => 'application/zip',
	);

	/**
	 * Registry used to verify ware existence and permissions.
	 *
	 * @var WareRegistryInterface
	 */
	private WareRegistryInterface $registry;

	/**
	 * Constructor.
	 *
	 * @param WareRegistryInterface $registry Registry instance.
	 */
	public function __construct( WareRegistryInterface $registry ) {
		$this->registry = $registry;
	}

	/**
	 * Register the file-serve REST route.
	 */
	public function register_routes(): void {
		register_rest_route(
			self::NAMESPACE,
			'/serve/(?P<slug>[a-z0-9-]+)/(?P<file>.+)',
			array(
				'methods'             => WP_REST_Server::READABLE,
				'callback'            => array( $this, 'serve_file' ),
				'permission_callback' => array( $this, 'check_permission' ),
				'args'                => array(
					'slug' => array(
						'type'              => 'string',
						'required'          => true,
						'sanitize_callback' => 'sanitize_key',
					),
					'file' => array(
						'type'              => 'string',
						'required'          => true,
						'sanitize_callback' => static fn( string $v ) => ltrim( $v, '/' ),
						'validate_callback' => static fn( string $v ) => ! str_contains( $v, '..' ),
					),
				),
			)
		);
	}

	/**
	 * Public image extensions that browsers load via <img> tags — these cannot
	 * carry an X-WP-Nonce header, so they are served without authentication.
	 * None of these types can contain executable ware logic.
	 */
	private const PUBLIC_IMAGE_EXTS = array( 'svg', 'png', 'jpg', 'jpeg', 'webp', 'gif', 'ico', 'avif' );

	/**
	 * Permission callback: image assets are public; all other files require login + capability.
	 *
	 * @param WP_REST_Request $request The incoming REST request.
	 */
	public function check_permission( WP_REST_Request $request ): bool|WP_Error {
		$slug = sanitize_key( $request->get_param( 'slug' ) );
		$ware = $this->registry->get( $slug );

		if ( null === $ware ) {
			return new WP_Error(
				'ware_not_found',
				esc_html__( 'Ware not found.', 'bazaar' ),
				array( 'status' => 404 )
			);
		}

		if ( ! ( $ware['enabled'] ?? false ) ) {
			return new WP_Error(
				'ware_disabled',
				esc_html__( 'This ware is currently disabled.', 'bazaar' ),
				array( 'status' => 403 )
			);
		}

		// Static image assets are decorative and carry no executable logic.
		// They are loaded by <img> tags which cannot send X-WP-Nonce, so we
		// allow them without authentication rather than forcing every icon to
		// include a nonce in its URL.
		$file = (string) $request->get_param( 'file' );
		$ext  = strtolower( pathinfo( $file, PATHINFO_EXTENSION ) );
		if ( in_array( $ext, self::PUBLIC_IMAGE_EXTS, true ) ) {
			return true;
		}

		// Block iframe embeds use a short-lived HMAC token instead of a login
		// session. Accept the token if it is present and valid for this slug.
		$raw_token = $request->get_param( '_bazaar_block_token' );
		if ( is_string( $raw_token ) && '' !== $raw_token ) {
			$token_slug = WareBlock::verify_token( $raw_token );
			if ( $token_slug === $slug ) {
				return true;
			}
			return new WP_Error(
				'bazaar_invalid_block_token',
				esc_html__( 'Block token is invalid or expired.', 'bazaar' ),
				array( 'status' => 403 )
			);
		}

		if ( ! is_user_logged_in() ) {
			return new WP_Error(
				'rest_forbidden',
				esc_html__( 'You must be logged in to access ware files.', 'bazaar' ),
				array( 'status' => 401 )
			);
		}

		$menu       = is_array( $ware['menu'] ?? null ) ? $ware['menu'] : array();
		$capability = sanitize_key( $menu['capability'] ?? 'manage_options' );
		if ( ! current_user_can( $capability ) ) {
			return new WP_Error(
				'rest_forbidden',
				esc_html__( 'You do not have permission to access this ware.', 'bazaar' ),
				array( 'status' => 403 )
			);
		}

		return true;
	}

	/**
	 * Serve the requested static file directly, bypassing the REST JSON response system.
	 *
	 * Sends ETag and Last-Modified headers, honours If-None-Match / If-Modified-Since
	 * for conditional requests, and returns 304 without reading the file body when
	 * the client's cached copy is still valid.
	 *
	 * @param WP_REST_Request $request The incoming REST request.
	 * @return WP_Error|never Returns a WP_Error on failure; exits directly after streaming on success.
	 */
	public function serve_file( WP_REST_Request $request ): WP_Error {
		$slug      = sanitize_key( $request->get_param( 'slug' ) );
		$file_path = $request->get_param( 'file' );

		// Second-layer path traversal rejection (first is in validate_callback).
		if ( str_contains( $file_path, '..' ) ) {
			return new WP_Error(
				'path_traversal',
				esc_html__( 'Invalid file path.', 'bazaar' ),
				array( 'status' => 400 )
			);
		}

		$ware_dir  = realpath( BAZAAR_WARES_DIR . $slug );
		$full_path = realpath( BAZAAR_WARES_DIR . $slug . '/' . $file_path );

		// Confinement: both paths must resolve and the file must be inside its ware dir.
		if ( false === $ware_dir || false === $full_path ) {
			return new WP_Error(
				'file_not_found',
				esc_html__( 'File not found.', 'bazaar' ),
				array( 'status' => 404 )
			);
		}

		if ( ! str_starts_with( $full_path, $ware_dir . DIRECTORY_SEPARATOR ) ) {
			return new WP_Error(
				'path_traversal',
				esc_html__( 'Invalid file path.', 'bazaar' ),
				array( 'status' => 400 )
			);
		}

		if ( ! is_file( $full_path ) ) {
			return new WP_Error(
				'file_not_found',
				esc_html__( 'File not found.', 'bazaar' ),
				array( 'status' => 404 )
			);
		}

		// Safety cap: refuse to load oversized files into PHP memory.
		$file_size = filesize( $full_path );
		$max_bytes = (int) apply_filters( 'bazaar_max_serve_bytes', self::MAX_SERVE_BYTES );
		if ( false === $file_size || $file_size > $max_bytes ) {
			return new WP_Error(
				'file_too_large',
				esc_html__( 'File is too large to serve.', 'bazaar' ),
				array( 'status' => 413 )
			);
		}

		$ext       = strtolower( pathinfo( $full_path, PATHINFO_EXTENSION ) );
		$mime_type = self::MIME_MAP[ $ext ] ?? 'application/octet-stream';
		$is_html   = in_array( $ext, array( 'html', 'htm' ), true );
		$mtime     = (int) filemtime( $full_path );

		// Build cache validators.
		// For HTML files, mix the shared-registry mtime, the Vite manifest mtime
		// (so that a rebuild with new content-hashed filenames busts the cache),
		// and the ware's stored shared-lib list (so that adding react/jsx-runtime
		// or any shared dep to the DB registration busts the cached importmap).
		$etag_seed = $full_path . $mtime . $file_size;
		if ( $is_html ) {
			$reg_path    = BAZAAR_DIR . 'admin/src/shared/registry.json';
			$man_path    = BAZAAR_DIR . 'admin/dist/.vite/manifest.json';
			$etag_seed  .= file_exists( $reg_path ) ? (string) filemtime( $reg_path ) : '';
			$etag_seed  .= file_exists( $man_path ) ? (string) filemtime( $man_path ) : '';
			$ware_record = $this->registry->get( $slug );
			$etag_seed  .= wp_json_encode( $ware_record['shared'] ?? array() );
		}
		$etag          = '"' . md5( $etag_seed ) . '"';
		$last_modified = gmdate( 'D, d M Y H:i:s', $mtime ) . ' GMT';

		// Check conditional request headers — serve 304 without reading the file.
		// $_SERVER is the canonical source for raw HTTP headers in WordPress REST handlers.
		$if_none_match     = isset( $_SERVER['HTTP_IF_NONE_MATCH'] )
			? sanitize_text_field( wp_unslash( (string) $_SERVER['HTTP_IF_NONE_MATCH'] ) )
			: null;
		$if_modified_since = isset( $_SERVER['HTTP_IF_MODIFIED_SINCE'] )
			? sanitize_text_field( wp_unslash( (string) $_SERVER['HTTP_IF_MODIFIED_SINCE'] ) )
			: null;

		$etag_match  = $if_none_match && trim( $if_none_match ) === $etag;
		$mtime_match = $if_modified_since && strtotime( $if_modified_since ) >= $mtime;

		if ( $etag_match || ( ! $if_none_match && $mtime_match ) ) {
			status_header( 304 );
			header( 'ETag: ' . $etag );
			header( 'Last-Modified: ' . $last_modified );
			header( 'Cache-Control: ' . $this->cache_control( $is_html ) );
			exit;
		}

		header( 'ETag: ' . $etag );
		header( 'Last-Modified: ' . $last_modified );
		header( 'Cache-Control: ' . $this->cache_control( $is_html ) );
		header( 'X-Content-Type-Options: nosniff' );
		header( 'X-Robots-Tag: noindex, nofollow' );
		header( 'Referrer-Policy: same-origin' );

		if ( $is_html ) {
			// CSP — uses per-ware builder config with a mandatory frame-ancestors fallback.
			$csp = \Bazaar\CspPolicy::header_for( $slug );
			header( "Content-Security-Policy: $csp" );

			$ware = $this->registry->get( $slug );

			// Cache post-injection HTML in a transient keyed on the ETag so
			// repeated loads skip filesystem reads and string-injection passes.
			// Dev-mode wares are excluded because inject_vite_client() adds a
			// Vite HMR <script> that must never be served from a stale cache.
			$cache_key = 'bazaar_html_' . substr( $etag, 1, -1 );
			$use_cache = empty( $ware['dev_url'] );
			$content   = $use_cache ? get_transient( $cache_key ) : false;

			if ( false === $content ) {
				// Read HTML into memory — we need to inject the <base href> that
				// makes Vite's relative asset paths resolve to directly-served static
				// files at wp-content/bazaar/{slug}/, bypassing PHP for all assets.
				if ( ! function_exists( 'WP_Filesystem' ) ) {
					require_once ABSPATH . 'wp-admin/includes/file.php';
				}
				WP_Filesystem();
				global $wp_filesystem;
				if ( empty( $wp_filesystem ) ) {
					return new WP_Error(
						'filesystem_error',
						esc_html__( 'Could not initialize filesystem.', 'bazaar' ),
						array( 'status' => 500 )
					);
				}
				$content = $wp_filesystem->get_contents( $full_path );
				if ( false === $content ) {
					return new WP_Error( 'file_read_error', esc_html__( 'Could not read file.', 'bazaar' ), array( 'status' => 500 ) );
				}
				$content = $this->inject_base_href( $content, $slug );
				$content = $this->inject_importmap( $content, $ware ?? array() );
				$content = $this->inject_error_reporter( $content );
				// Inject Vite HMR client only in dev mode.
				if ( ! empty( $ware['dev_url'] ) ) {
					$content = $this->inject_vite_client( $content, (string) $ware['dev_url'] );
				}
				if ( $use_cache ) {
					set_transient( $cache_key, $content, DAY_IN_SECONDS );
				}
			}

			header( 'Content-Type: ' . $mime_type );
			// Content-Length changes after injection; omit to avoid truncation.
			echo $content;
			exit;
		}

		// Non-HTML assets: stream directly without loading into PHP memory.
		// This avoids exhausting PHP's memory limit for large fonts/images/videos.
		header( 'Content-Type: ' . $mime_type );
		header( 'Content-Length: ' . $file_size );
		readfile( $full_path );
		exit;
	}

	/**
	 * Inject a tiny error-reporter script so unhandled JS errors in the ware
	 * are forwarded to the shell via postMessage.
	 *
	 * @param string $html Description.
	 * @return string
	 */
	private function inject_error_reporter( string $html ): string {
		$script = '<script>(function(){' .
			'var o=document.location.origin;' .
			'window.addEventListener("error",function(e){window.parent.postMessage({type:"bazaar:error",message:e.message,stack:e.error&&e.error.stack||"",url:e.filename},o)});' .
			'window.addEventListener("unhandledrejection",function(e){window.parent.postMessage({type:"bazaar:error",message:String(e.reason),stack:"",url:location.href},o)});' .
			'})()</script>';
		return (string) preg_replace( '/(<\/head>)/i', $script . '$1', $html, 1 );
	}

	/**
	 * Inject Vite client script in dev mode for HMR.
	 *
	 * @param string $html Description.
	 * @param string $dev_url Description.
	 * @return string
	 */
	private function inject_vite_client( string $html, string $dev_url ): string {
		$dev_url = esc_url( trailingslashit( $dev_url ) );
		$tag     = '<script type="module" src="' . $dev_url . '@vite/client"></script>';
		return (string) preg_replace( '/(<\/head>)/i', $tag . '$1', $html, 1 );
	}

	/**
	 * Inject a <base href> into an HTML document so that Vite's relative asset
	 * references (./assets/main.js) resolve to the directly-served static path
	 * (wp-content/bazaar/{slug}/assets/main.js) rather than back through the
	 * PHP REST router.
	 *
	 * Wares must be built with Vite's `base: './'` option for relative paths.
	 *
	 * @param string $html Raw HTML content.
	 * @param string $slug Sanitized ware slug.
	 * @return string Modified HTML.
	 */
	private function inject_base_href( string $html, string $slug ): string {
		$base = trailingslashit( content_url( 'bazaar/' . $slug ) );
		$tag  = '<base href="' . esc_attr( $base ) . '">';

		// Insert immediately after the opening <head> tag.
		return (string) preg_replace( '/(<head\b[^>]*>)/i', '$1' . $tag, $html, 1 );
	}

	/**
	 * Inject a <script type="importmap"> so the ware can import shared libs
	 * (React, Vue, etc.) from the shell's versioned, immutable bundles instead
	 * of bundling its own copy.
	 *
	 * The importmap is inserted immediately after the <base> tag so it precedes
	 * any <script type="module"> elements — a browser requirement.
	 *
	 * Wares opt in via manifest.json: `"shared": ["react", "react-dom"]`.
	 * If the ware declares no shared libs, or the shell doesn't provide the
	 * requested lib, the HTML is returned unmodified (fully backwards-compatible).
	 *
	 * @param string               $html Raw (already base-href-injected) HTML.
	 * @param array<string, mixed> $ware Full ware record from the registry.
	 * @return string
	 */
	private function inject_importmap( string $html, array $ware ): string {
		$requested = $ware['shared'] ?? array();
		if ( empty( $requested ) || ! is_array( $requested ) ) {
			return $html;
		}

		$registry = $this->get_shared_registry();
		if ( empty( $registry ) ) {
			return $html;
		}

		// React 18+ JSX transform always emits `import … from "react/jsx-runtime"`.
		// Wares installed before this was added to their manifest.json would break
		// unless we add it automatically whenever react or react-dom is requested.
		$react_pkgs = array( 'react', 'react-dom' );
		if ( ! empty( array_intersect( (array) $requested, $react_pkgs ) ) ) {
			if ( ! in_array( 'react/jsx-runtime', (array) $requested, true ) ) {
				$requested[] = 'react/jsx-runtime';
			}
		}

		$imports = array();
		foreach ( $requested as $pkg ) {
			$pkg = (string) $pkg;
			if ( isset( $registry[ $pkg ] ) ) {
				$imports[ $pkg ] = BAZAAR_URL . 'admin/dist/' . $registry[ $pkg ];
			}
		}

		if ( empty( $imports ) ) {
			return $html;
		}

		$map = '<script type="importmap">' . wp_json_encode( array( 'imports' => $imports ) ) . '</script>';
		// Insert right after the <base> tag that inject_base_href() added.
		return (string) preg_replace( '/(<base\b[^>]*>)/i', '$1' . $map, $html, 1 );
	}

	/**
	 * Build a map of package-name → dist-relative-file-path by cross-referencing
	 * the shell's shared/registry.json (package → Vite src key) with the Vite
	 * build manifest (Vite src key → hashed output filename).
	 *
	 * The result is cached for the lifetime of the PHP request.
	 *
	 * @return array<string, string> e.g. ['react' => 'shared/react-abc123.js']
	 */
	private function get_shared_registry(): array {
		static $cache = null;
		if ( null !== $cache ) {
			return $cache;
		}

		$registry_path = BAZAAR_DIR . 'admin/src/shared/registry.json';
		$manifest_path = BAZAAR_DIR . 'admin/dist/.vite/manifest.json';

		if ( ! file_exists( $registry_path ) || ! file_exists( $manifest_path ) ) {
			$cache = array();
			return $cache;
		}

		global $wp_filesystem;
		if ( ! function_exists( 'WP_Filesystem' ) ) {
			require_once ABSPATH . 'wp-admin/includes/file.php';
		}
		WP_Filesystem();

		if ( empty( $wp_filesystem ) ) {
			$cache = array();
			return $cache;
		}

		$registry_raw = $wp_filesystem->get_contents( $registry_path );
		$manifest_raw = $wp_filesystem->get_contents( $manifest_path );

		$registry = is_string( $registry_raw ) ? json_decode( $registry_raw, true ) : null;
		$manifest = is_string( $manifest_raw ) ? json_decode( $manifest_raw, true ) : null;

		if ( ! is_array( $registry ) || ! is_array( $manifest ) ) {
			$cache = array();
			return $cache;
		}

		$out = array();
		foreach ( $registry as $pkg => $meta ) {
			$src = $meta['src'] ?? '';
			if ( isset( $manifest[ $src ]['file'] ) ) {
				$out[ (string) $pkg ] = $manifest[ $src ]['file'];
			}
		}

		$cache = $out;
		return $cache;
	}

	/**
	 * Return an appropriate Cache-Control directive string.
	 *
	 * HTML files use a short max-age because they may embed a rotating nonce.
	 * All other assets (JS, CSS, images, fonts) use a long max-age with
	 * immutable, under the assumption that content-hashed filenames are used.
	 *
	 * @param bool $is_html True when serving an HTML document.
	 * @return string Cache-Control header value (without the header name).
	 */
	private function cache_control( bool $is_html ): string {
		if ( $is_html ) {
			return 'private, max-age=' . self::HTML_MAX_AGE . ', must-revalidate';
		}
		return 'private, max-age=' . self::ASSET_MAX_AGE . ', immutable';
	}
}
