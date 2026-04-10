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

// Remove options.
delete_option( 'bazaar_registry' );
delete_option( 'bazaar_max_ware_size' );

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
