<?php
/**
 * Service Worker endpoint.
 *
 * Serves admin/dist/zero-trust-sw.js through the REST API so PHP can emit
 * the Service-Worker-Allowed: / header.  Browsers block SW registration at
 * a broader scope than the script's own path, and static files served from
 * wp-content/plugins/ cannot carry custom headers without server-level
 * configuration.  Routing through REST makes this portable across any host.
 *
 * GET /wp-json/bazaar/v1/sw  — public, no authentication required.
 *
 * @package Bazaar
 */

declare( strict_types=1 );

namespace Bazaar\REST;

use WP_REST_Server;

defined( 'ABSPATH' ) || exit;

/**
 * Serves the Bazaar service worker script with the Service-Worker-Allowed header.
 */
final class ServiceWorkerController {

	/** REST API namespace for all Bazaar routes. */
	private const NAMESPACE = 'bazaar/v1';

	/**
	 * Register REST routes.
	 */
	public function register_routes(): void {
		register_rest_route(
			self::NAMESPACE,
			'/sw',
			array(
				'methods'             => WP_REST_Server::READABLE,
				'callback'            => array( $this, 'serve' ),
				'permission_callback' => '__return_true',
			)
		);
	}

	/**
	 * Stream the SW script with the required scope header.
	 *
	 * Terminates the request directly — bypasses WP_REST_Response so headers
	 * are sent before any WP JSON envelope can be written.
	 */
	public function serve(): never {
		$file = BAZAAR_DIR . 'admin/dist/zero-trust-sw.js';

		if ( ! file_exists( $file ) ) {
			status_header( 404 );
			exit;
		}

		header( 'Content-Type: application/javascript; charset=utf-8' );
		header( 'Cache-Control: no-cache, no-store, must-revalidate' );
		header( 'Service-Worker-Allowed: /' );
		readfile( $file ); // phpcs:ignore WordPress.WP.AlternativeFunctions
		exit;
	}
}
