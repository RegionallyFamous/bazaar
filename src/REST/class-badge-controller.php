<?php
/**
 * REST controller for ware badge counts.
 *
 * Badges are stored in per-user transients so each admin user has their own
 * notification state. Wares can set badges client-side via postMessage
 * (handled in the shell) or server-side via this REST endpoint.
 *
 * Routes
 * ──────
 *   GET  /bazaar/v1/badges           Return all badge counts for the current user.
 *   POST /bazaar/v1/badges/{slug}    Set a badge count (ware server-side callback).
 *   DELETE /bazaar/v1/badges/{slug}  Clear a badge.
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
 * Manages per-user badge counts for wares.
 */
final class BadgeController extends WP_REST_Controller {

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
	protected $rest_base = 'badges';

	/** Transient TTL — 24 hours. Counts should survive page reloads. */
	private const TTL = DAY_IN_SECONDS;

	/**
	 * Register all REST routes for this controller.
	 */
	public function register_routes(): void {
		register_rest_route(
			$this->namespace,
			"/{$this->rest_base}",
			array(
				array(
					'methods'             => WP_REST_Server::READABLE,
					'callback'            => array( $this, 'get_items' ),
					'permission_callback' => array( $this, 'auth' ),
				),
			)
		);

		register_rest_route(
			$this->namespace,
			"/{$this->rest_base}/(?P<slug>[a-z0-9-]+)",
			array(
				array(
					'methods'             => WP_REST_Server::CREATABLE,
					'callback'            => array( $this, 'set_item' ),
					'permission_callback' => array( $this, 'auth' ),
					'args'                => array(
						'count' => array(
							'required' => true,
							'type'     => 'integer',
							'minimum'  => 0,
						),
					),
				),
				array(
					'methods'             => WP_REST_Server::DELETABLE,
					'callback'            => array( $this, 'delete_item' ),
					'permission_callback' => array( $this, 'auth' ),
				),
			)
		);
	}

	/**
	 * Permission callback — requires manage_options capability.
	 *
	 * @return bool
	 */
	public function auth(): bool {
		return current_user_can( 'manage_options' );
	}

	/**
	 * GET /bazaar/v1/badges
	 * Returns all badge counts for the current user as [{slug, count}].
	 *
	 * @param WP_REST_Request $request REST request.
	 * @return WP_REST_Response
	 */
	public function get_items( $request ): WP_REST_Response {
		$badges = $this->load();
		$out    = array();
		foreach ( $badges as $slug => $count ) {
			$out[] = array(
				'slug'  => $slug,
				'count' => (int) $count,
			);
		}
		return new WP_REST_Response( $out, 200 );
	}

	/**
	 * POST /bazaar/v1/badges/{slug}
	 * Sets a badge count.
	 *
	 * @param WP_REST_Request $request REST request.
	 * @return WP_REST_Response
	 */
	public function set_item( $request ): WP_REST_Response {
		$slug  = sanitize_key( $request->get_param( 'slug' ) );
		$count = absint( $request->get_param( 'count' ) );

		$badges          = $this->load();
		$badges[ $slug ] = $count;
		$this->save( $badges );

		// Dispatch SSE event for real-time propagation.
		bazaar_push_sse_event(
			'badge',
			array(
				'slug'  => $slug,
				'count' => $count,
			)
		);

		return new WP_REST_Response(
			array(
				'slug'  => $slug,
				'count' => $count,
			),
			200
		);
	}

	/**
	 * DELETE /bazaar/v1/badges/{slug}
	 *
	 * @param WP_REST_Request $request   REST request.
	 * @param mixed           $object_id Unused (WP_REST_Controller compatibility).
	 * @return WP_REST_Response
	 */
	public function delete_item( $request, mixed $object_id = null ): WP_REST_Response {
		$slug   = sanitize_key( $request->get_param( 'slug' ) );
		$badges = $this->load();
		unset( $badges[ $slug ] );
		$this->save( $badges );
		return new WP_REST_Response( array( 'deleted' => true ), 200 );
	}

	// -------------------------------------------------------------------------

	/**
	 * Load current user's badge counts from transient.
	 *
	 * @return array<string, int>
	 */
	private function load(): array {
		$uid = get_current_user_id();
		$raw = get_transient( "bazaar_badges_{$uid}" );
		return is_array( $raw ) ? $raw : array();
	}

	/**
	 * Persist the current user's badge counts to a transient.
	 *
	 * @param array<string, int> $badges Badge counts keyed by ware slug.
	 */
	private function save( array $badges ): void {
		$uid = get_current_user_id();
		set_transient( "bazaar_badges_{$uid}", $badges, self::TTL );
	}
}
