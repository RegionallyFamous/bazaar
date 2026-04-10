<?php
/**
 * Ware error log — collect and surface ware-reported crashes.
 *
 * The shell posts here whenever a ware fires the `bazaar:error` postMessage.
 * Admins can review the error log in the Bazaar Manage screen.
 *
 * Storage: custom DB table `{prefix}bazaar_errors`.
 *
 * Routes
 * ──────
 *   GET    /bazaar/v1/errors            Paginated error list (admin only).
 *   POST   /bazaar/v1/errors            Record a new error.
 *   DELETE /bazaar/v1/errors/{id}       Delete a single error.
 *   DELETE /bazaar/v1/errors            Clear all errors (or by slug).
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
 * Error log management.
 */
final class ErrorsController extends BazaarController {

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
	protected $rest_base = 'errors';

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
					'callback'            => array( $this, 'list_errors' ),
					'permission_callback' => $this->require_admin(),
				),
				array(
					'methods'             => WP_REST_Server::CREATABLE,
					'callback'            => array( $this, 'create_error' ),
					'permission_callback' => $this->require_login(),
					'args'                => array(
						'slug'    => array(
							'required' => true,
							'type'     => 'string',
						),
						'message' => array(
							'required' => true,
							'type'     => 'string',
						),
						'stack'   => array( 'type' => 'string' ),
						'url'     => array( 'type' => 'string' ),
					),
				),
				array(
					'methods'             => WP_REST_Server::DELETABLE,
					'callback'            => array( $this, 'clear_errors' ),
					'permission_callback' => $this->require_admin(),
				),
			)
		);

		register_rest_route(
			$this->namespace,
			"/{$this->rest_base}/(?P<id>\d+)",
			array(
				array(
					'methods'             => WP_REST_Server::DELETABLE,
					'callback'            => array( $this, 'delete_error' ),
					'permission_callback' => $this->require_admin(),
				),
			)
		);
	}

	// ─── Handlers ─────────────────────────────────────────────────────────

	/**
	 * List errors.
	 *
	 * @param WP_REST_Request $request Description.
	 * @return WP_REST_Response
	 */
	public function list_errors( WP_REST_Request $request ): WP_REST_Response {
		global $wpdb;
		$table = $wpdb->prefix . Tables::ERRORS;
		$slug  = sanitize_key( (string) $request->get_param( 'slug' ) );
		$page  = max( 1, (int) ( $request->get_param( 'page' ) ?? 1 ) );
		$per   = min( 100, max( 1, (int) ( $request->get_param( 'per_page' ) ?? 50 ) ) );
		$off   = ( $page - 1 ) * $per;

		if ( $slug ) {
			$rows  = $wpdb->get_results( $wpdb->prepare( 'SELECT * FROM %i WHERE slug = %s ORDER BY id DESC LIMIT %d OFFSET %d', $table, $slug, $per, $off ), ARRAY_A );
			$total = (int) $wpdb->get_var( $wpdb->prepare( 'SELECT COUNT(*) FROM %i WHERE slug = %s', $table, $slug ) );
		} else {
			$rows  = $wpdb->get_results( $wpdb->prepare( 'SELECT * FROM %i ORDER BY id DESC LIMIT %d OFFSET %d', $table, $per, $off ), ARRAY_A );
			$total = (int) $wpdb->get_var( $wpdb->prepare( 'SELECT COUNT(*) FROM %i', $table ) );
		}

		return new WP_REST_Response(
			array(
				'errors' => $rows ?? array(),
				'total'  => $total,
				'pages'  => (int) ceil( $total / $per ),
			),
			200
		);
	}

	/**
	 * Create error.
	 *
	 * @param WP_REST_Request $request Description.
	 * @return WP_REST_Response
	 */
	public function create_error( WP_REST_Request $request ): WP_REST_Response {
		global $wpdb;
		$table = $wpdb->prefix . Tables::ERRORS;

		$wpdb->insert(
			$table,
			array(
				'slug'       => sanitize_key( $request->get_param( 'slug' ) ),
				'user_id'    => get_current_user_id(),
				'message'    => sanitize_text_field( (string) $request->get_param( 'message' ) ),
				'stack'      => wp_kses( (string) ( $request->get_param( 'stack' ) ?? '' ), array() ),
				'url'        => esc_url_raw( (string) ( $request->get_param( 'url' ) ?? '' ) ),
				'created_at' => current_time( 'mysql', true ),
			)
		);

		return new WP_REST_Response( array( 'id' => (int) $wpdb->insert_id ), 201 );
	}

	/**
	 * Delete error.
	 *
	 * @param WP_REST_Request $request Description.
	 * @return WP_REST_Response
	 */
	public function delete_error( WP_REST_Request $request ): WP_REST_Response {
		global $wpdb;
		$wpdb->delete( $wpdb->prefix . Tables::ERRORS, array( 'id' => (int) $request->get_param( 'id' ) ) );
		return new WP_REST_Response( array( 'deleted' => true ), 200 );
	}

	/**
	 * Clear errors.
	 *
	 * @param WP_REST_Request $request Description.
	 * @return WP_REST_Response
	 */
	public function clear_errors( WP_REST_Request $request ): WP_REST_Response {
		global $wpdb;
		$slug  = sanitize_key( (string) $request->get_param( 'slug' ) );
		$table = $wpdb->prefix . Tables::ERRORS;
		if ( $slug ) {
			$wpdb->delete( $table, array( 'slug' => $slug ) );
		} else {
			// DELETE without a WHERE clause removes all rows.  TRUNCATE is
			// avoided because it is DDL (resets AUTO_INCREMENT, bypasses
			// foreign-key checks on some engines) and cannot be prepared.
			$wpdb->query( $wpdb->prepare( 'DELETE FROM %i', $table ) );
		}
		return new WP_REST_Response( array( 'cleared' => true ), 200 );
	}

	// ─── DB table ────────────────────────────────────────────────────────

	/** Create the errors table on plugin activation / dbDelta. */
	public static function create_table(): void {
		global $wpdb;
		$table   = $wpdb->prefix . Tables::ERRORS;
		$charset = $wpdb->get_charset_collate();

		require_once ABSPATH . 'wp-admin/includes/upgrade.php';
		dbDelta(
			"CREATE TABLE `{$table}` (
			id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
			slug        VARCHAR(100)    NOT NULL DEFAULT '',
			user_id     BIGINT UNSIGNED NOT NULL DEFAULT 0,
			message     TEXT            NOT NULL,
			stack       LONGTEXT        NOT NULL,
			url         VARCHAR(2048)   NOT NULL DEFAULT '',
			created_at  DATETIME        NOT NULL,
			PRIMARY KEY  (id),
			KEY slug     (slug),
			KEY created_at (created_at)
		) {$charset};"
		);
	}
}
