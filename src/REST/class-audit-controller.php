<?php
/**
 * Ware Audit Log — immutable record of all significant ware-lifecycle events.
 *
 * Captured events: install, uninstall, enable, disable, config_change,
 * license_activated, license_revoked, job_ran, webhook_fired, error_boundary.
 *
 * Storage: `{prefix}bazaar_audit_log` — append-only; never updated, never deleted
 *          in normal operation (admins can purge old rows via CLI only).
 *
 * Routes
 * ──────
 *   GET  /bazaar/v1/audit                Paginated log (admin only).
 *   GET  /bazaar/v1/audit/{slug}         Log for one ware.
 *   POST /bazaar/v1/audit                Internal — ware-side events.
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

/**
 * Append-only audit log for ware lifecycle events.
 */
final class AuditController extends WP_REST_Controller {

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
	protected $rest_base = 'audit';

	/** Valid event types. */
	public const EVENTS = array(
		'install',
		'uninstall',
		'enable',
		'disable',
		'config_change',
		'license_activated',
		'license_revoked',
		'job_ran',
		'webhook_fired',
		'error_boundary',
		'ware_event',
	);

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
					'callback'            => array( $this, 'list_log' ),
					'permission_callback' => fn() => current_user_can( 'manage_options' ),
				),
				array(
					'methods'             => WP_REST_Server::CREATABLE,
					'callback'            => array( $this, 'create_entry' ),
					'permission_callback' => fn() => is_user_logged_in(),
					'args'                => array(
						'slug'  => array(
							'required' => true,
							'type'     => 'string',
						),
						'event' => array(
							'required' => true,
							'type'     => 'string',
							'enum'     => self::EVENTS,
						),
						'meta'  => array( 'type' => 'object' ),
					),
				),
			)
		);

		register_rest_route(
			$this->namespace,
			"/{$this->rest_base}/(?P<slug>[a-z0-9-]+)",
			array(
				'methods'             => WP_REST_Server::READABLE,
				'callback'            => array( $this, 'list_by_slug' ),
				'permission_callback' => fn() => current_user_can( 'manage_options' ),
			)
		);
	}

	// ─── Handlers ─────────────────────────────────────────────────────────

	/**
	 * List log.
	 *
	 * @param WP_REST_Request $request Description.
	 * @return WP_REST_Response
	 */
	public function list_log( WP_REST_Request $request ): WP_REST_Response {
		return new WP_REST_Response(
			$this->query(
				array(
					'page'     => (int) ( $request->get_param( 'page' ) ?? 1 ),
					'per_page' => (int) ( $request->get_param( 'per_page' ) ?? 50 ),
					'event'    => sanitize_text_field( (string) ( $request->get_param( 'event' ) ?? '' ) ),
				)
			),
			200
		);
	}

	/**
	 * List by slug.
	 *
	 * @param WP_REST_Request $request Description.
	 * @return WP_REST_Response
	 */
	public function list_by_slug( WP_REST_Request $request ): WP_REST_Response {
		return new WP_REST_Response(
			$this->query(
				array(
					'slug'     => sanitize_key( $request->get_param( 'slug' ) ),
					'page'     => (int) ( $request->get_param( 'page' ) ?? 1 ),
					'per_page' => (int) ( $request->get_param( 'per_page' ) ?? 50 ),
				)
			),
			200
		);
	}

	/**
	 * Create entry.
	 *
	 * @param WP_REST_Request $request Description.
	 * @return WP_REST_Response
	 */
	public function create_entry( WP_REST_Request $request ): WP_REST_Response {
		self::record(
			sanitize_key( $request->get_param( 'slug' ) ),
			sanitize_text_field( $request->get_param( 'event' ) ),
			(array) ( $request->get_param( 'meta' ) ?? array() )
		);
		return new WP_REST_Response( array( 'recorded' => true ), 201 );
	}

	// ─── Static record helper (called from PHP hooks) ─────────────────────

	/**
	 * Append an audit log entry.
	 *
	 * @param string               $slug  Ware slug.
	 * @param string               $event One of EVENTS.
	 * @param array<string, mixed> $meta  Arbitrary context (JSON-encoded in DB).
	 */
	public static function record( string $slug, string $event, array $meta = array() ): void {
		global $wpdb;
		$table = $wpdb->prefix . 'bazaar_audit_log';
		$wpdb->insert(
			$table,
			array(
				'slug'       => substr( $slug, 0, 100 ),
				'event'      => substr( $event, 0, 50 ),
				'user_id'    => get_current_user_id(),
				'meta'       => (string) wp_json_encode( $meta ),
				'created_at' => current_time( 'mysql', true ),
			)
		);
	}

	// ─── Query helper ─────────────────────────────────────────────────────

	/**
	 * Run a paginated SELECT against the audit log table.
	 *
	 * @param array{slug?:string, event?:string, page:int, per_page:int} $args Query parameters.
	 * @return array<string, mixed>
	 */
	private function query( array $args ): array {
		global $wpdb;
		$table = $wpdb->prefix . 'bazaar_audit_log';
		$page  = max( 1, $args['page'] );
		$per   = min( 100, max( 1, $args['per_page'] ) );
		$off   = ( $page - 1 ) * $per;

		$wheres = array();
		$values = array();

		if ( ! empty( $args['slug'] ) ) {
			$wheres[] = 'slug = %s';
			$values[] = $args['slug']; }
		if ( ! empty( $args['event'] ) ) {
			$wheres[] = 'event = %s';
			$values[] = $args['event']; }

		$where_sql = $wheres ? 'WHERE ' . implode( ' AND ', $wheres ) : '';

		if ( $values ) {
			// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared,WordPress.DB.PreparedSQLPlaceholders.UnfinishedPrepare -- $table is trusted prefix-derived; $per/$off are validated ints
			$base = $wpdb->prepare( "SELECT * FROM `{$table}` {$where_sql} ORDER BY id DESC LIMIT {$per} OFFSET {$off}", ...$values );
			// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared,WordPress.DB.PreparedSQLPlaceholders.UnfinishedPrepare
			$cnt = $wpdb->prepare( "SELECT COUNT(*) FROM `{$table}` {$where_sql}", ...$values );
		} else {
			// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
			$base = "SELECT * FROM `{$table}` ORDER BY id DESC LIMIT {$per} OFFSET {$off}";
			// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
			$cnt = "SELECT COUNT(*) FROM `{$table}`";
		}

		$rows  = $wpdb->get_results( $base, ARRAY_A ) ?? array(); // phpcs:ignore WordPress.DB.PreparedSQL.NotPrepared
		$total = (int) $wpdb->get_var( $cnt ); // phpcs:ignore WordPress.DB.PreparedSQL.NotPrepared

		// Decode meta for API consumers.
		foreach ( $rows as &$row ) {
			$row['meta'] = json_decode( $row['meta'] ?? '{}', true );
		}

		return array(
			'entries' => $rows,
			'total'   => $total,
			'pages'   => (int) ceil( $total / $per ),
		);
	}

	// ─── DB table ────────────────────────────────────────────────────────

	/**
	 * Create table.
	 */
	public static function create_table(): void {
		global $wpdb;
		$table   = $wpdb->prefix . 'bazaar_audit_log';
		$charset = $wpdb->get_charset_collate();
		require_once ABSPATH . 'wp-admin/includes/upgrade.php';
		dbDelta(
			"CREATE TABLE `{$table}` (
			id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
			slug        VARCHAR(100)    NOT NULL DEFAULT '',
			event       VARCHAR(50)     NOT NULL DEFAULT '',
			user_id     BIGINT UNSIGNED NOT NULL DEFAULT 0,
			meta        LONGTEXT        NOT NULL DEFAULT '{}',
			created_at  DATETIME        NOT NULL,
			PRIMARY KEY  (id),
			KEY slug (slug),
			KEY event (event),
			KEY created_at (created_at)
		) {$charset};"
		);
	}
}
