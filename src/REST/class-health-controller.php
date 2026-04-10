<?php
/**
 * Ware health-check aggregation endpoint.
 *
 * Each ware can declare a health-check URL in its manifest:
 *   "health_check": "https://api.example.com/health"
 *
 * This controller:
 *   1. Polls each declared URL (max 5 s).
 *   2. Aggregates HTTP status → ok / warn / error.
 *   3. Caches results in a transient (30 s TTL).
 *   4. Returns the aggregated list to the shell.
 *
 * The shell also receives live `health` events via SSE.
 *
 * Routes
 * ──────
 *   GET /bazaar/v1/health            All wares' health.
 *   GET /bazaar/v1/health/{slug}     Single ware health (bypasses cache).
 *
 * @package Bazaar
 */

declare( strict_types=1 );

namespace Bazaar\REST;

defined( 'ABSPATH' ) || exit;

use Bazaar\WareRegistry;
use WP_REST_Controller;
use WP_REST_Server;
use WP_REST_Request;
use WP_REST_Response;
use WP_Error;

/**
 * Aggregates and caches ware health-check results.
 */
final class HealthController extends WP_REST_Controller {

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
	protected $rest_base = 'health';

	private const CACHE_TTL = 30;
	private const TIMEOUT   = 5;

	/**
	 * WareRegistry instance.
	 *
	 * @var WareRegistry
	 */
	private WareRegistry $registry;

	/**
	 * Constructor.
	 *
	 * @param WareRegistry $registry Description.
	 */
	public function __construct( WareRegistry $registry ) {
		$this->registry = $registry;
	}

	/**
	 * Register all REST routes for this controller.
	 */
	public function register_routes(): void {
		register_rest_route(
			$this->namespace,
			"/{$this->rest_base}",
			array(
				'methods'             => WP_REST_Server::READABLE,
				'callback'            => array( $this, 'get_all' ),
				'permission_callback' => fn() => is_user_logged_in(),
			)
		);

		register_rest_route(
			$this->namespace,
			"/{$this->rest_base}/(?P<slug>[a-z0-9-]+)",
			array(
				'methods'             => WP_REST_Server::READABLE,
				'callback'            => array( $this, 'get_one' ),
				'permission_callback' => fn() => is_user_logged_in(),
			)
		);
	}

	// ─── Handlers ─────────────────────────────────────────────────────────

	/**
	 * Get all.
	 *
	 * @return WP_REST_Response
	 */
	public function get_all(): WP_REST_Response {
		$cached = get_transient( 'bazaar_health_all' );
		if ( is_array( $cached ) ) {
			return new WP_REST_Response( $cached, 200 );
		}

		$results = array();
		foreach ( $this->registry->get_all() as $ware ) {
			if ( empty( $ware['health_check'] ) ) {
				continue;
			}
			$results[] = array(
				'slug'   => $ware['slug'],
				'status' => $this->probe( $ware['health_check'] ),
			);
		}

		set_transient( 'bazaar_health_all', $results, self::CACHE_TTL );
		return new WP_REST_Response( $results, 200 );
	}

	/**
	 * Get one.
	 *
	 * @param WP_REST_Request $request Description.
	 * @return WP_REST_Response|WP_Error
	 */
	public function get_one( WP_REST_Request $request ): WP_REST_Response|WP_Error {
		$slug = sanitize_key( $request->get_param( 'slug' ) );
		$ware = $this->registry->get( $slug );

		if ( null === $ware ) {
			return new WP_Error( 'not_found', __( 'Ware not found.', 'bazaar' ), array( 'status' => 404 ) );
		}

		$status = empty( $ware['health_check'] ) ? 'unknown' : $this->probe( $ware['health_check'] );
		return new WP_REST_Response(
			array(
				'slug'   => $slug,
				'status' => $status,
			),
			200
		);
	}

	// ─── Helpers ──────────────────────────────────────────────────────────

	/**
	 * HTTP-probe a URL and return a normalised status string.
	 *
	 * @param string $url URL to probe.
	 * @return 'ok'|'warn'|'error'|'unknown'
	 */
	private function probe( string $url ): string {
		$response = wp_remote_get(
			$url,
			array(
				'timeout'   => self::TIMEOUT,
				'sslverify' => true,
			)
		);

		if ( is_wp_error( $response ) ) {
			return 'error';
		}

		$code = (int) wp_remote_retrieve_response_code( $response );
		if ( $code >= 200 && $code < 300 ) {
			return 'ok';
		}
		if ( $code >= 300 && $code < 500 ) {
			return 'warn';
		}
		return 'error';
	}

	/**
	 * WP-Cron callback: refresh health cache and push SSE events.
	 * Hooked to `bazaar_health_refresh` action.
	 */
	public static function cron_refresh(): void {
		delete_transient( 'bazaar_health_all' );

		$registry = new \Bazaar\WareRegistry();
		foreach ( $registry->get_all() as $ware ) {
			if ( empty( $ware['health_check'] ) ) {
				continue;
			}
			$response = wp_remote_get(
				$ware['health_check'],
				array(
					'timeout'   => 5,
					'sslverify' => true,
				)
			);
			$code     = is_wp_error( $response ) ? 0 : (int) wp_remote_retrieve_response_code( $response );
			$status   = ( $code >= 200 && $code < 300 ) ? 'ok' : ( ( $code >= 300 && $code < 500 ) ? 'warn' : 'error' );

			// Push to SSE queue.
			$queue   = (array) get_transient( 'bazaar_sse_queue' );
			$queue[] = array(
				'event' => 'health',
				'data'  => wp_json_encode(
					array(
						'slug'   => $ware['slug'],
						'status' => $status,
					)
				),
			);
			set_transient( 'bazaar_sse_queue', $queue, 60 );
		}
	}
}
