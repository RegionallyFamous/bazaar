<?php
/**
 * REST endpoint for refreshing the WP REST nonce.
 *
 * WordPress REST nonces expire after 12 hours. Long-lived single-page apps
 * (like wares in dev mode) need to refresh the nonce before it expires.
 * This endpoint returns a fresh nonce for any authenticated user.
 *
 * Route
 * ─────
 *   GET /bazaar/v1/nonce   Returns { nonce: string, expires_in: number }
 *
 * @package Bazaar
 */

declare( strict_types=1 );

namespace Bazaar\REST;

defined( 'ABSPATH' ) || exit;

use WP_REST_Server;
use WP_REST_Request;
use WP_REST_Response;

/**
 * Provides a fresh WP REST nonce on demand.
 */
final class NonceController extends BazaarController {

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
	protected $rest_base = 'nonce';

	/**
	 * Register the nonce REST route.
	 */
	public function register_routes(): void {
		register_rest_route(
			$this->namespace,
			"/{$this->rest_base}",
			array(
				array(
					'methods'             => WP_REST_Server::READABLE,
					'callback'            => array( $this, 'get_nonce' ),
					'permission_callback' => $this->require_login(),
				),
			)
		);
	}

	/**
	 * Permission callback — any logged-in user may refresh their nonce.
	 *
	 * @return bool
	 */

	/**
	 * GET /bazaar/v1/nonce
	 *
	 * @param WP_REST_Request $request REST request.
	 * @return WP_REST_Response
	 */
	public function get_nonce( WP_REST_Request $request ): WP_REST_Response {
		return new WP_REST_Response(
			array(
				'nonce'      => wp_create_nonce( 'wp_rest' ),
				'expires_in' => 12 * HOUR_IN_SECONDS,
			),
			200
		);
	}
}
