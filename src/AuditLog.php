<?php
/**
 * Audit log service.
 *
 * A thin write-only interface for the bazaar_audit_log table.
 * All code that needs to record an audit event (lifecycle hooks in
 * Plugin.php, CLI commands, REST controllers) imports this class
 * instead of reaching directly into AuditController.
 *
 * The actual REST surface (listing, filtering) lives in
 * REST/AuditController.php, which delegates writes here.
 *
 * @package Bazaar
 */

declare( strict_types=1 );

namespace Bazaar;

defined( 'ABSPATH' ) || exit;

use Bazaar\Db\Tables;

/**
 * Append-only audit log writer.
 */
final class AuditLog {

	/** Valid event type identifiers. */
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
	 * Append one audit log entry.
	 *
	 * @param string               $slug  Ware slug.
	 * @param string               $event One of self::EVENTS.
	 * @param array<string, mixed> $meta  Optional context — JSON-encoded in DB.
	 */
	public static function record( string $slug, string $event, array $meta = array() ): void {
		global $wpdb;

		$inserted = $wpdb->insert(
			$wpdb->prefix . Tables::AUDIT_LOG,
			array(
				'slug'       => substr( $slug, 0, 100 ),
				'event'      => substr( $event, 0, 50 ),
				'user_id'    => get_current_user_id(),
				'meta'       => (string) wp_json_encode( $meta ),
				'created_at' => current_time( 'mysql', true ),
			)
		);
		if ( false === $inserted ) {
			// phpcs:ignore WordPress.PHP.DevelopmentFunctions.error_log_error_log
			error_log( 'Bazaar AuditLog: failed to insert record for ' . $slug . '/' . $event . ' — ' . $wpdb->last_error );
		}
	}

	/**
	 * Create the DB table. Called once on plugin activation.
	 */
	public static function create_table(): void {
		global $wpdb;

		$table   = $wpdb->prefix . Tables::AUDIT_LOG;
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
