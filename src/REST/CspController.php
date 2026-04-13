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

use Bazaar\CspPolicy;
use WP_REST_Server;
use WP_REST_Request;
use WP_REST_Response;
use WP_Error;

/**
 * REST surface for per-ware CSP management.
 * All policy logic lives in {@see \Bazaar\CspPolicy}.
 */
final class CspController extends BazaarController {

	/**
	 * Route base (the part after the namespace).
	 *
	 * @var string
	 */
	protected $rest_base = 'csp';

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
					'permission_callback' => $this->require_admin(),
				),
				array(
					'methods'             => 'PATCH',
					'callback'            => array( $this, 'update_csp' ),
					'permission_callback' => $this->require_admin(),
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
					'permission_callback' => $this->require_admin(),
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
		$directives = CspPolicy::load( $slug );
		return new WP_REST_Response(
			array(
				'slug'       => $slug,
				'directives' => $directives,
				'header'     => CspPolicy::compile( $directives ),
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
		$directives = CspPolicy::load( $slug );

		foreach ( $incoming as $directive => $sources ) {
			$directive = sanitize_text_field( (string) $directive );

			if ( isset( CspPolicy::REQUIRED[ $directive ] ) ) {
				/* translators: %s: CSP directive name */
				return new WP_Error( 'locked', sprintf( __( 'Directive "%s" cannot be modified.', 'bazaar' ), $directive ), array( 'status' => 422 ) );
			}
			$directives[ $directive ] = sanitize_text_field( (string) $sources );
		}

		if ( ! CspPolicy::save( $slug, $directives ) ) {
			return new WP_Error(
				'save_failed',
				esc_html__( 'CSP policy could not be saved. Please try again.', 'bazaar' ),
				array( 'status' => 500 )
			);
		}
		$directives = CspPolicy::load( $slug ); // Re-read to get enforced invariants.
		return new WP_REST_Response(
			array(
				'directives' => $directives,
				'header'     => CspPolicy::compile( $directives ),
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
				'directives' => CspPolicy::BASELINE,
			),
			200
		);
	}
}
