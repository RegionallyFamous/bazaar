<?php
/**
 * Plugin Name:       Bazaar
 * Plugin URI:        https://github.com/nickhblair/bazaar
 * Description:       Turn wp-admin into an app marketplace. Install .wp ware packages and they appear as menu pages in your sidebar.
 * Version:           1.0.2
 * Requires at least: 6.6
 * Requires PHP:      8.2
 * Author:            Nick
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       bazaar
 * Domain Path:       /languages
 *
 * @package Bazaar
 */

defined( 'ABSPATH' ) || exit;

define( 'BAZAAR_VERSION', '1.0.2' );
define( 'BAZAAR_FILE', __FILE__ );
define( 'BAZAAR_PLUGIN_FILE', __FILE__ );
define( 'BAZAAR_PLUGIN_DIR', plugin_dir_path( __FILE__ ) );
define( 'BAZAAR_DIR', plugin_dir_path( __FILE__ ) );
define( 'BAZAAR_URL', plugin_dir_url( __FILE__ ) );
define( 'BAZAAR_SLUG', 'bazaar' );

/** Absolute path to the wp-content/bazaar/ directory where wares are stored. */
define( 'BAZAAR_WARES_DIR', WP_CONTENT_DIR . '/bazaar/' );

/** Default maximum uncompressed size for a ware archive (50 MB). */
define( 'BAZAAR_MAX_UNCOMPRESSED_SIZE', 50 * 1024 * 1024 );

/**
 * HMAC secret for block tokens and other signed payloads.
 * Generated once on activation and stored in the bazaar_secret option.
 * Falls back to the WordPress auth key if not yet initialised.
 */
if ( ! defined( 'BAZAAR_SECRET' ) ) {
	$_bazaar_secret = get_option( 'bazaar_secret' );
	if ( false === $_bazaar_secret ) {
		$_bazaar_secret = wp_generate_password( 64, true, true );
		update_option( 'bazaar_secret', $_bazaar_secret, false );
	}
	define( 'BAZAAR_SECRET', (string) $_bazaar_secret );
	unset( $_bazaar_secret );
}

if ( file_exists( BAZAAR_DIR . 'vendor/autoload.php' ) ) {
	require_once BAZAAR_DIR . 'vendor/autoload.php';
}

use Bazaar\Plugin;
use Bazaar\REST\StreamController;

register_activation_hook( BAZAAR_FILE, array( Plugin::class, 'activate' ) );
register_deactivation_hook( BAZAAR_FILE, array( Plugin::class, 'deactivate' ) );

add_action( 'plugins_loaded', array( Plugin::class, 'boot' ) );

// ─── Global helper functions ─────────────────────────────────────────────────

if ( ! function_exists( 'bazaar_push_sse_event' ) ) {
	/**
	 * Push a Server-Sent Event to all admin users' queues.
	 *
	 * Any plugin or theme can call this to broadcast real-time messages
	 * to the Bazaar Shell:
	 *
	 *   bazaar_push_sse_event( 'badge', [ 'slug' => 'crm', 'count' => 3 ] );
	 *   bazaar_push_sse_event( 'toast', [ 'message' => 'Backup complete!', 'level' => 'success' ] );
	 *
	 * @param string               $type Event type string.
	 * @param array<string, mixed> $data Event payload.
	 */
	function bazaar_push_sse_event( string $type, array $data ): void {
		StreamController::push_to_all( $type, $data );
	}
}
