<?php
/**
 * Bazaar uninstall — runs when the plugin is deleted from the WordPress admin.
 *
 * Removes ALL plugin data:
 *   - bazaar_registry option
 *   - bazaar_max_ware_size option
 *   - wp-content/bazaar/ directory and all installed wares
 *
 * Deactivation intentionally leaves everything intact so re-activating the
 * plugin restores the previous state. Uninstall (delete) is the destructive
 * action and only runs when the user explicitly clicks "Delete" in wp-admin.
 *
 * @package Bazaar
 */

defined( 'WP_UNINSTALL_PLUGIN' ) || exit;

global $wpdb;

// Remove all scalar options.
$_bazaar_options = array(
	'bazaar_index',
	'bazaar_registry',
	'bazaar_max_ware_size',
	'bazaar_secret',
	'bazaar_registry_url',
	'bazaar_signing_pubkey',
	'bazaar_enforce_signatures',
	'bazaar_last_update_check',
	'bazaar_outdated_wares',
	'bazaar_site_overrides',
	'bazaar_webhooks',
	'bazaar_csp_policy',
	'bazaar_analytics_enabled',
);
foreach ( $_bazaar_options as $_opt ) {
	delete_option( $_opt );
}

// Remove all per-ware options (bazaar_ware_{slug}).
// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching
$wpdb->query(
	$wpdb->prepare(
		"DELETE FROM {$wpdb->options} WHERE option_name LIKE %s",
		$wpdb->esc_like( 'bazaar_ware_' ) . '%'
	)
);

// Remove all per-ware options (bazaar_ware_{slug}, bazaar_license_{slug}, bazaar_badges_{uid}).
// phpcs:disable WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching
$wpdb->query(
	$wpdb->prepare(
		"DELETE FROM {$wpdb->options} WHERE option_name LIKE %s OR option_name LIKE %s",
		$wpdb->esc_like( 'bazaar_ware_' ) . '%',
		$wpdb->esc_like( 'bazaar_license_' ) . '%'
	)
);
// Remove per-user badge transients.
$wpdb->query(
	$wpdb->prepare(
		"DELETE FROM {$wpdb->options} WHERE option_name LIKE %s",
		$wpdb->esc_like( '_transient_bazaar_badges_' ) . '%'
	)
);
// Drop all custom tables.
// phpcs:ignore WordPress.DB.PreparedSQL.NotPrepared
$wpdb->query( "DROP TABLE IF EXISTS {$wpdb->prefix}bazaar_analytics" );
// phpcs:ignore WordPress.DB.PreparedSQL.NotPrepared
$wpdb->query( "DROP TABLE IF EXISTS {$wpdb->prefix}bazaar_errors" );
// phpcs:ignore WordPress.DB.PreparedSQL.NotPrepared
$wpdb->query( "DROP TABLE IF EXISTS {$wpdb->prefix}bazaar_audit_log" );
// phpcs:enable

// Unschedule all Bazaar cron jobs.
foreach ( array( 'bazaar_check_updates', 'bazaar_health_refresh' ) as $_hook ) {
	$_ts = wp_next_scheduled( $_hook );
	if ( $_ts ) {
		wp_unschedule_event( $_ts, $_hook );
	}
}

// Remove wp-content/bazaar/ and all installed wares.
$wares_dir = WP_CONTENT_DIR . '/bazaar/';

if ( is_dir( $wares_dir ) ) {
	if ( ! function_exists( 'WP_Filesystem' ) ) {
		require_once ABSPATH . 'wp-admin/includes/file.php';
	}

	WP_Filesystem();

	global $wp_filesystem;
	if ( ! empty( $wp_filesystem ) ) {
		$wp_filesystem->delete( $wares_dir, true );
	}
}
