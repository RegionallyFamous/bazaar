<?php
/**
 * Plugin Name:       Bazaar
 * Plugin URI:        https://github.com/RegionallyFamous/bazaar
 * Description:       Your WordPress dashboard is an operating system you didn't know you had. Bazaar unlocks it.
 * Version:           1.2.1
 * Requires at least: 6.6
 * Requires PHP:      8.2
 * Author:            Regionally Famous
 * Author URI:        https://regionallyfamous.com
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       bazaar
 * Domain Path:       /languages
 *
 * @package Bazaar
 */

defined( 'ABSPATH' ) || exit;

define( 'BAZAAR_VERSION', '1.2.1' );
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
 * Endpoint for anonymous update-check telemetry (Cloudflare Worker URL).
 * Leave empty to disable collection entirely — safe default for open-source distribution.
 * To enable, set your Worker URL here or override in wp-config.php:
 *   define( 'BAZAAR_TELEMETRY_ENDPOINT', 'https://bazaar-telemetry.<yourname>.workers.dev' );
 */
if ( ! defined( 'BAZAAR_TELEMETRY_ENDPOINT' ) ) {
	define( 'BAZAAR_TELEMETRY_ENDPOINT', 'https://bazaar-telemetry.nickhamze.workers.dev' );
}

/**
 * HMAC secret for block tokens and other signed payloads.
 * Generated once on first request via wp_generate_password(64) and stored
 * permanently in the bazaar_secret option. There is no AUTH_KEY fallback.
 */
if ( ! defined( 'BAZAAR_SECRET' ) ) {
	$_bazaar_secret = get_option( 'bazaar_secret' );
	if ( false === $_bazaar_secret ) {
		$_bazaar_secret = wp_generate_password( 64, true, true );
		// add_option is atomic: it only inserts if the key does not exist.
		// If two requests race, one wins; the loser re-reads the winner's value.
		if ( ! add_option( 'bazaar_secret', $_bazaar_secret, '', false ) ) {
			$_bazaar_secret = get_option( 'bazaar_secret' );
		}
	}
	define( 'BAZAAR_SECRET', (string) $_bazaar_secret );
	unset( $_bazaar_secret );
}

if ( file_exists( BAZAAR_DIR . 'vendor/autoload.php' ) ) {
	require_once BAZAAR_DIR . 'vendor/autoload.php';
}

// Remove any node_modules/ directory left over from early development builds.
// Those releases accidentally included npm workspace symlinks which break
// WordPress's WP_Upgrader::clear_destination() when updating.
// Skip in dev checkouts: package.json present means this is a source tree, not a production install.
if ( is_dir( BAZAAR_DIR . 'node_modules' ) && ! file_exists( BAZAAR_DIR . 'package.json' ) ) {
	// WP_Filesystem is not yet loaded at this point; raw PHP calls are intentional.
	// phpcs:disable WordPress.WP.AlternativeFunctions
	$_bazaar_nm = BAZAAR_DIR . 'node_modules';
	$_bazaar_it = new \RecursiveIteratorIterator(
		new \RecursiveDirectoryIterator( $_bazaar_nm, \FilesystemIterator::SKIP_DOTS ),
		\RecursiveIteratorIterator::CHILD_FIRST
	);
	foreach ( $_bazaar_it as $_bazaar_file ) {
		// Symlinks must be removed with unlink(); rmdir() rejects them with ENOTDIR.
		if ( $_bazaar_file->isLink() || ! $_bazaar_file->isDir() ) {
			unlink( $_bazaar_file->getPathname() );
		} else {
			rmdir( $_bazaar_file->getPathname() );
		}
	}
	rmdir( $_bazaar_nm );
	unset( $_bazaar_nm, $_bazaar_it, $_bazaar_file );
	// phpcs:enable WordPress.WP.AlternativeFunctions
}

use Bazaar\Plugin;
use Bazaar\REST\StreamController;

register_activation_hook( BAZAAR_FILE, array( Plugin::class, 'activate' ) );
register_deactivation_hook( BAZAAR_FILE, array( Plugin::class, 'deactivate' ) );

add_action( 'plugins_loaded', array( Plugin::class, 'boot' ) );

// ─── Self-update via GitHub Releases ─────────────────────────────────────────

if ( file_exists( BAZAAR_DIR . 'github-updater.php' ) ) {
	require_once BAZAAR_DIR . 'github-updater.php';
}

if ( class_exists( 'GitHub_Plugin_Updater', false ) ) {
	new GitHub_Plugin_Updater(
		BAZAAR_FILE,
		array(
			'owner' => 'RegionallyFamous',
			'repo'  => 'bazaar',
			// Optionally supply a GitHub PAT to raise the API rate-limit or for
			// private forks. Store in wp_options as `bazaar_github_token`, or
			// override with the `bazaar_github_updater_token` filter.
			'token' => (string) apply_filters( 'bazaar_github_updater_token', get_option( 'bazaar_github_token', '' ) ),
		)
	);
}

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
