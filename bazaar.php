<?php
/**
 * Plugin Name:       Bazaar
 * Plugin URI:        https://github.com/nickhblair/bazaar
 * Description:       Turn wp-admin into an app marketplace. Install .wp ware packages and they appear as menu pages in your sidebar.
 * Version:           1.0.0
 * Requires at least: 6.6
 * Requires PHP:      8.1
 * Author:            Nick
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       bazaar
 * Domain Path:       /languages
 */

defined( 'ABSPATH' ) || exit;

define( 'BAZAAR_VERSION', '1.0.0' );
define( 'BAZAAR_FILE', __FILE__ );
define( 'BAZAAR_DIR', plugin_dir_path( __FILE__ ) );
define( 'BAZAAR_URL', plugin_dir_url( __FILE__ ) );
define( 'BAZAAR_SLUG', 'bazaar' );

/** Absolute path to the wp-content/bazaar/ directory where wares are stored. */
define( 'BAZAAR_WARES_DIR', WP_CONTENT_DIR . '/bazaar/' );

/** Default maximum uncompressed size for a ware archive (50 MB). */
define( 'BAZAAR_MAX_UNCOMPRESSED_SIZE', 50 * 1024 * 1024 );

if ( file_exists( BAZAAR_DIR . 'vendor/autoload.php' ) ) {
	require_once BAZAAR_DIR . 'vendor/autoload.php';
}

use Bazaar\Plugin;

register_activation_hook( BAZAAR_FILE, [ Plugin::class, 'activate' ] );
register_deactivation_hook( BAZAAR_FILE, [ Plugin::class, 'deactivate' ] );

add_action( 'plugins_loaded', [ Plugin::class, 'boot' ] );
