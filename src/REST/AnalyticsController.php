<?php
/**
 * REST controller for ware analytics.
 *
 * Records time-in-ware and interaction events to a dedicated DB table.
 * The shell fires-and-forgets a POST whenever a ware is de-activated.
 *
 * Table schema (created in Plugin.php on activation)
 * ─────────────────────────────────────────────────────────
 *   id           BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY
 *   slug         VARCHAR(191) NOT NULL
 *   event_type   VARCHAR(64)  NOT NULL  — 'view' | 'interaction'
 *   user_id      BIGINT UNSIGNED NOT NULL
 *   duration_ms  BIGINT UNSIGNED NOT NULL DEFAULT 0
 *   created_at   DATETIME NOT NULL
 *
 * Routes
 * ──────
 *   POST /bazaar/v1/analytics          Record an event.
 *   GET  /bazaar/v1/analytics          Fetch aggregate stats (manage page).
 *   GET  /bazaar/v1/analytics/{slug}   Fetch stats for a single ware.
 *
 * @package Bazaar
 */

declare( strict_types=1 );

namespace Bazaar\REST;

defined( 'ABSPATH' ) || exit;

use WP_REST_Server;
use WP_REST_Request;
use WP_REST_Response;
use Bazaar\Db\Tables;
use WP_Error;

/**
 * Ware analytics REST controller.
 */
final class AnalyticsController extends BazaarController {

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
	protected $rest_base = 'analytics';

	/**
	 * Register all REST routes for this controller.
	 */
	public function register_routes(): void {
		register_rest_route(
			$this->namespace,
			"/{$this->rest_base}",
			array(
				array(
					'methods'             => WP_REST_Server::CREATABLE,
					'callback'            => array( $this, 'record' ),
					'permission_callback' => $this->require_admin(),
					'args'                => array(
						'slug'        => array(
							'required'          => true,
							'type'              => 'string',
							'sanitize_callback' => 'sanitize_key',
						),
						'event'       => array(
							'required' => false,
							'type'     => 'string',
							'default'  => 'view',
							'enum'     => array( 'view', 'interaction' ),
						),
						'duration_ms' => array(
							'required' => false,
							'type'     => 'integer',
							'default'  => 0,
							'minimum'  => 0,
						),
					),
				),
				array(
					'methods'             => WP_REST_Server::READABLE,
					'callback'            => array( $this, 'get_aggregate' ),
					'permission_callback' => $this->require_admin(),
					'args'                => array(
						'days' => array(
							'type'    => 'integer',
							'default' => 30,
							'minimum' => 1,
							'maximum' => 365,
						),
					),
				),
			)
		);

		register_rest_route(
			$this->namespace,
			"/{$this->rest_base}/(?P<slug>[a-z0-9-]+)",
			array(
				array(
					'methods'             => WP_REST_Server::READABLE,
					'callback'            => array( $this, 'get_ware_stats' ),
					'permission_callback' => $this->require_admin(),
				),
			)
		);
	}

	/**
	 * Permission callback — requires manage_options capability.
	 *
	 * @return bool
	 */

	/**
	 * POST /bazaar/v1/analytics
	 * Record a ware usage event.
	 *
	 * @param WP_REST_Request $request REST request.
	 * @return WP_REST_Response|WP_Error
	 */
	public function record( WP_REST_Request $request ): WP_REST_Response|WP_Error {
		global $wpdb;

		$slug        = sanitize_key( $request->get_param( 'slug' ) );
		$event_type  = sanitize_text_field( $request->get_param( 'event' ) );
		$duration_ms = absint( $request->get_param( 'duration_ms' ) );

		if ( '' === $slug ) {
			return new WP_Error(
				'invalid_slug',
				esc_html__( 'A non-empty ware slug is required.', 'bazaar' ),
				array( 'status' => 400 )
			);
		}

		$table = $wpdb->prefix . Tables::ANALYTICS;

		// If the table does not exist (e.g. activation hook did not run yet),
		// return a 503 so the client knows to retry rather than treating it as
		// accepted.
		$exists = $wpdb->get_var( $wpdb->prepare( 'SHOW TABLES LIKE %s', $table ) );
		if ( $table !== $exists ) {
			return new WP_Error(
				'table_missing',
				esc_html__( 'Analytics table is not available.', 'bazaar' ),
				array( 'status' => 503 )
			);
		}

		// Per-slug per-day row cap: prevents a buggy or compromised client from
		// causing unbounded table growth.
		$daily_cap   = 1000;
		$today       = gmdate( 'Y-m-d' );
		$count_today = (int) $wpdb->get_var(
			$wpdb->prepare(
				'SELECT COUNT(*) FROM %i WHERE slug = %s AND DATE(created_at) = %s',
				$table,
				$slug,
				$today
			)
		);
		if ( $count_today >= $daily_cap ) {
			return new WP_Error(
				'daily_cap_exceeded',
				esc_html__( 'Analytics daily cap exceeded for this ware.', 'bazaar' ),
				array( 'status' => 429 )
			);
		}

		$inserted = $wpdb->insert(
			$table,
			array(
				'slug'        => $slug,
				'event_type'  => $event_type,
				'user_id'     => get_current_user_id(),
				'duration_ms' => $duration_ms,
				'created_at'  => current_time( 'mysql', true ),
			),
			array( '%s', '%s', '%d', '%d', '%s' )
		);

		if ( false === $inserted ) {
			return new WP_Error(
				'insert_failed',
				esc_html__( 'Could not record analytics event.', 'bazaar' ),
				array( 'status' => 500 )
			);
		}

		return new WP_REST_Response( array( 'ok' => true ), 201 );
	}

	/**
	 * GET /bazaar/v1/analytics
	 * Aggregate stats for all wares: total views, total time, daily active users.
	 *
	 * @param WP_REST_Request $request REST request.
	 * @return WP_REST_Response
	 */
	public function get_aggregate( WP_REST_Request $request ): WP_REST_Response {
		global $wpdb;

		$days  = absint( $request->get_param( 'days' ) ?? 30 );
		$days  = max( 1, min( $days, 365 ) );
		$since = gmdate( 'Y-m-d H:i:s', (int) strtotime( "-{$days} days" ) );
		$table = $wpdb->prefix . Tables::ANALYTICS;

		$rows = $wpdb->get_results(
			$wpdb->prepare(
				"SELECT slug,
			        COUNT(*) AS views,
			        COALESCE(SUM(duration_ms), 0) AS total_ms,
			        COUNT(DISTINCT user_id) AS unique_users
			 FROM %i
			 WHERE event_type = 'view'
			   AND created_at >= %s
			 GROUP BY slug
			 ORDER BY total_ms DESC",
				$table,
				$since
			),
			ARRAY_A
		);

		return new WP_REST_Response( $rows ?? array(), 200 );
	}

	/**
	 * GET /bazaar/v1/analytics/{slug}
	 * Detailed stats for a single ware: views per day for the past N days.
	 *
	 * @param WP_REST_Request $request REST request.
	 * @return WP_REST_Response
	 */
	public function get_ware_stats( WP_REST_Request $request ): WP_REST_Response {
		global $wpdb;

		$slug  = sanitize_key( $request->get_param( 'slug' ) );
		$days  = absint( $request->get_param( 'days' ) ?? 30 );
		$days  = max( 1, min( $days, 365 ) );
		$since = gmdate( 'Y-m-d H:i:s', (int) strtotime( "-{$days} days" ) );
		$table = $wpdb->prefix . Tables::ANALYTICS;

		$rows = $wpdb->get_results(
			$wpdb->prepare(
				"SELECT DATE(created_at) AS day,
			        COUNT(*)          AS views,
			        COALESCE(SUM(duration_ms), 0) AS total_ms
			 FROM %i
			 WHERE slug = %s
			   AND event_type = 'view'
			   AND created_at >= %s
			 GROUP BY DATE(created_at)
			 ORDER BY day ASC",
				$table,
				$slug,
				$since
			),
			ARRAY_A
		);

		return new WP_REST_Response( $rows ?? array(), 200 );
	}

	/**
	 * Create the analytics table. Called on plugin activation.
	 */
	public static function create_table(): void {
		global $wpdb;

		$table           = $wpdb->prefix . Tables::ANALYTICS;
		$charset_collate = $wpdb->get_charset_collate();

		$sql = "CREATE TABLE IF NOT EXISTS {$table} (
			id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
			slug VARCHAR(191) NOT NULL,
			event_type VARCHAR(64) NOT NULL DEFAULT 'view',
			user_id BIGINT UNSIGNED NOT NULL DEFAULT 0,
			duration_ms BIGINT UNSIGNED NOT NULL DEFAULT 0,
			created_at DATETIME NOT NULL,
			PRIMARY KEY (id),
			KEY slug_created (slug, created_at),
			KEY user_created (user_id, created_at)
		) {$charset_collate};";

		require_once ABSPATH . 'wp-admin/includes/upgrade.php';
		dbDelta( $sql );
	}

	/**
	 * Drop the analytics table. Called from uninstall.php.
	 */
	public static function drop_table(): void {
		global $wpdb;
		$table = $wpdb->prefix . Tables::ANALYTICS;
		$wpdb->query( $wpdb->prepare( 'DROP TABLE IF EXISTS %i', $table ) );
	}
}
