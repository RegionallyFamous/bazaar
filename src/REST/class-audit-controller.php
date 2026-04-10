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

use Bazaar\AuditLog;
use WP_REST_Server;
use WP_REST_Request;
use WP_REST_Response;
use Bazaar\Db\Tables;

/**
 * Append-only audit log for ware lifecycle events.
 */
final class AuditController extends BazaarController {

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
					'permission_callback' => $this->require_admin(),
				),
				array(
					'methods'             => WP_REST_Server::CREATABLE,
					'callback'            => array( $this, 'create_entry' ),
					'permission_callback' => $this->require_login(),
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
				'permission_callback' => $this->require_admin(),
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
		AuditLog::record(
			sanitize_key( $request->get_param( 'slug' ) ),
			sanitize_text_field( $request->get_param( 'event' ) ),
			(array) ( $request->get_param( 'meta' ) ?? array() )
		);
		return new WP_REST_Response( array( 'recorded' => true ), 201 );
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
		$table = $wpdb->prefix . Tables::AUDIT_LOG;
		$page  = max( 1, $args['page'] );
		$per   = min( 100, max( 1, $args['per_page'] ) );
		$off   = ( $page - 1 ) * $per;

		// Branch on the filter combination so every query uses %i/%s/%d
		// placeholders — no variable interpolation in the SQL template.
		$slug  = $args['slug'] ?? '';
		$event = $args['event'] ?? '';

		if ( $slug && $event ) {
			$rows  = $wpdb->get_results( $wpdb->prepare( 'SELECT * FROM %i WHERE slug = %s AND event = %s ORDER BY id DESC LIMIT %d OFFSET %d', $table, $slug, $event, $per, $off ), ARRAY_A ) ?? array();
			$total = (int) $wpdb->get_var( $wpdb->prepare( 'SELECT COUNT(*) FROM %i WHERE slug = %s AND event = %s', $table, $slug, $event ) );
		} elseif ( $slug ) {
			$rows  = $wpdb->get_results( $wpdb->prepare( 'SELECT * FROM %i WHERE slug = %s ORDER BY id DESC LIMIT %d OFFSET %d', $table, $slug, $per, $off ), ARRAY_A ) ?? array();
			$total = (int) $wpdb->get_var( $wpdb->prepare( 'SELECT COUNT(*) FROM %i WHERE slug = %s', $table, $slug ) );
		} elseif ( $event ) {
			$rows  = $wpdb->get_results( $wpdb->prepare( 'SELECT * FROM %i WHERE event = %s ORDER BY id DESC LIMIT %d OFFSET %d', $table, $event, $per, $off ), ARRAY_A ) ?? array();
			$total = (int) $wpdb->get_var( $wpdb->prepare( 'SELECT COUNT(*) FROM %i WHERE event = %s', $table, $event ) );
		} else {
			$rows  = $wpdb->get_results( $wpdb->prepare( 'SELECT * FROM %i ORDER BY id DESC LIMIT %d OFFSET %d', $table, $per, $off ), ARRAY_A ) ?? array();
			$total = (int) $wpdb->get_var( $wpdb->prepare( 'SELECT COUNT(*) FROM %i', $table ) );
		}

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
}
