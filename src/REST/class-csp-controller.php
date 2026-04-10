<?php
/**
 * Per-ware Content Security Policy builder.
 *
 * Admins configure CSP directives per ware via a REST UI (or the admin screen).
 * Bazaar injects the resulting `Content-Security-Policy` header when serving
 * the ware HTML via WareServer.
 *
 * Each ware's CSP config is stored in site option `bazaar_csp_{slug}` as a JSON
 * map of directive → space-separated source-list.
 *
 * Default baseline (applied unless overridden):
 *   default-src 'self'
 *   script-src  'self' 'unsafe-inline'   ← required for most bundled apps
 *   style-src   'self' 'unsafe-inline'
 *   img-src     'self' data: https:
 *   frame-ancestors 'self'               ← MUST be kept; blocks click-jacking
 *
 * Routes
 * ──────
 *   GET   /bazaar/v1/csp/{slug}   Get current CSP policy + compiled header.
 *   PATCH /bazaar/v1/csp/{slug}   Update directives.
 *   DELETE /bazaar/v1/csp/{slug}  Reset to baseline.
 *
 * @package Bazaar
 */

declare( strict_types=1 );

namespace Bazaar\REST;

defined( 'ABSPATH' ) || exit;

use WP_REST_Controller;
use WP_REST_Server;
use WP_REST_Request;
use WP_REST_Response;
use WP_Error;

/**
 * Build and persist per-ware Content-Security-Policy headers.
 */
final class CspController extends WP_REST_Controller {

	/**
	 * REST API namespace.
	 *
	 * @var string
	 */
	protected $namespace = 'bazaar/v1';
	/**
	 * Route base (the part after the namespace).
	 *
	 * @var string
	 */
	protected $rest_base = 'csp';

	/** Directives that may never be removed (security invariants). */
	private const REQUIRED = array(
		'frame-ancestors' => "'self'",
	);

	/** Baseline applied when no custom config exists. */
	private const BASELINE = array(
		'default-src'     => "'self'",
		'script-src'      => "'self' 'unsafe-inline'",
		'style-src'       => "'self' 'unsafe-inline'",
		'img-src'         => "'self' data: https:",
		'connect-src'     => "'self'",
		'frame-ancestors' => "'self'",
	);

	/**
	 * Register all REST routes for this controller.
	 */
	public function register_routes(): void {
		register_rest_route(
			$this->namespace,
			"/{$this->rest_base}/(?P<slug>[a-z0-9-]+)",
			array(
				array(
					'methods'             => WP_REST_Server::READABLE,
					'callback'            => array( $this, 'get_csp' ),
					'permission_callback' => fn() => current_user_can( 'manage_options' ),
				),
				array(
					'methods'             => 'PATCH',
					'callback'            => array( $this, 'update_csp' ),
					'permission_callback' => fn() => current_user_can( 'manage_options' ),
					'args'                => array(
						'directives' => array(
							'required' => true,
							'type'     => 'object',
						),
					),
				),
				array(
					'methods'             => WP_REST_Server::DELETABLE,
					'callback'            => array( $this, 'reset_csp' ),
					'permission_callback' => fn() => current_user_can( 'manage_options' ),
				),
			)
		);
	}

	/**
	 * Get csp.
	 *
	 * @param WP_REST_Request $request Description.
	 * @return WP_REST_Response
	 */
	public function get_csp( WP_REST_Request $request ): WP_REST_Response {
		$slug       = sanitize_key( $request->get_param( 'slug' ) );
		$directives = $this->load( $slug );
		return new WP_REST_Response(
			array(
				'slug'       => $slug,
				'directives' => $directives,
				'header'     => $this->compile( $directives ),
			),
			200
		);
	}

	/**
	 * Update csp.
	 *
	 * @param WP_REST_Request $request Description.
	 * @return WP_REST_Response|WP_Error
	 */
	public function update_csp( WP_REST_Request $request ): WP_REST_Response|WP_Error {
		$slug       = sanitize_key( $request->get_param( 'slug' ) );
		$incoming   = (array) $request->get_param( 'directives' );
		$directives = $this->load( $slug );

		foreach ( $incoming as $directive => $sources ) {
			$directive = sanitize_text_field( (string) $directive );

			// Never let callers override security invariants.
			if ( isset( self::REQUIRED[ $directive ] ) ) {
				/* translators: %s: CSP directive name */
				return new WP_Error( 'locked', sprintf( __( 'Directive "%s" cannot be modified.', 'bazaar' ), $directive ), array( 'status' => 422 ) );
			}
			$directives[ $directive ] = sanitize_text_field( (string) $sources );
		}

		// Re-apply required directives.
		foreach ( self::REQUIRED as $d => $v ) {
			$directives[ $d ] = $v; }

		$this->save( $slug, $directives );
		return new WP_REST_Response(
			array(
				'directives' => $directives,
				'header'     => $this->compile( $directives ),
			),
			200
		);
	}

	/**
	 * Reset csp.
	 *
	 * @param WP_REST_Request $request Description.
	 * @return WP_REST_Response
	 */
	public function reset_csp( WP_REST_Request $request ): WP_REST_Response {
		$slug = sanitize_key( $request->get_param( 'slug' ) );
		delete_option( "bazaar_csp_{$slug}" );
		return new WP_REST_Response(
			array(
				'reset'      => true,
				'directives' => self::BASELINE,
			),
			200
		);
	}

	// ─── Helpers used by WareServer ────────────────────────────────────────

	/**
	 * Build the CSP header value for a ware.
	 * Called by WareServer when serving ware HTML.
	 *
	 * @param string $slug Description.
	 * @return string
	 */
	public static function header_for( string $slug ): string {
		$raw = get_option( "bazaar_csp_{$slug}", '' );
		if ( '' === $raw ) {
			return self::compile_static( self::BASELINE );
		}

		$data = json_decode( (string) $raw, true );
		$dirs = is_array( $data ) ? $data : self::BASELINE;
		foreach ( self::REQUIRED as $d => $v ) {
			$dirs[ $d ] = $v; }
		return self::compile_static( $dirs );
	}

	/**
	 * Compile a directives map into a single CSP header value string.
	 *
	 * @param array<string,string> $directives Directive-to-sources map.
	 * @return string
	 */
	private function compile( array $directives ): string {
		return self::compile_static( $directives ); }

	/**
	 * Compile a directives map into a CSP header value string (static variant).
	 *
	 * @param array<string,string> $directives Directive-to-sources map.
	 * @return string
	 */
	private static function compile_static( array $directives ): string {
		$parts = array();
		foreach ( $directives as $directive => $sources ) {
			$parts[] = trim( "$directive $sources" );
		}
		return implode( '; ', $parts );
	}

	/**
	 * Load persisted CSP directives for a ware, merged with the baseline.
	 *
	 * @param string $slug Ware slug.
	 * @return array<string,string>
	 */
	private function load( string $slug ): array {
		$raw = get_option( "bazaar_csp_{$slug}", '' );
		if ( '' === $raw ) {
			return self::BASELINE;
		}
		$dec = json_decode( (string) $raw, true );
		return is_array( $dec ) ? array_merge( self::BASELINE, $dec ) : self::BASELINE;
	}

	/**
	 * Persist CSP directives for a ware.
	 *
	 * @param string               $slug Ware slug.
	 * @param array<string,string> $data Directives to persist.
	 */
	private function save( string $slug, array $data ): void {
		$enc = wp_json_encode( $data );
		if ( false !== $enc ) {
			update_option( "bazaar_csp_{$slug}", $enc, false );
		}
	}
}
