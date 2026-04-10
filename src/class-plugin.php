<?php
/**
 * Central plugin bootstrap.
 *
 * @package Bazaar
 */

declare( strict_types=1 );

namespace Bazaar;

defined( 'ABSPATH' ) || exit;

use Bazaar\CLI\BazaarCommand;
use Bazaar\REST\UploadController;
use Bazaar\REST\WareController;
use Bazaar\REST\WareServer;

/**
 * Registers all hooks and handles activation/deactivation.
 */
final class Plugin {

	/** @var self|null Singleton instance, null before first boot(). */
	private static ?self $instance = null;

	/** @var WareRegistry Holds installed-ware metadata. */
	private WareRegistry $registry;

	/** @var MenuManager Registers wp-admin pages for enabled wares. */
	private MenuManager $menu_manager;

	/** @var BazaarPage Renders the Bazaar marketplace admin page. */
	private BazaarPage $bazaar_page;

	/**
	 * Private constructor — use Plugin::boot() instead.
	 */
	private function __construct() {
		$this->registry     = new WareRegistry();
		$this->menu_manager = new MenuManager( $this->registry );
		$this->bazaar_page  = new BazaarPage( $this->registry );
	}

	/**
	 * Initialise the plugin on plugins_loaded.
	 */
	public static function boot(): void {
		if ( null === self::$instance ) {
			self::$instance = new self();
			self::$instance->register_hooks();
		}
	}

	/**
	 * Plugin activation: create required directories and seed the option.
	 */
	public static function activate(): void {
		self::ensure_wares_directory();
		if ( false === get_option( 'bazaar_registry' ) ) {
			add_option( 'bazaar_registry', wp_json_encode( array() ), '', false );
		}
	}

	/**
	 * Plugin deactivation: intentionally a no-op.
	 * Wares and their data are preserved so re-activating the plugin restores everything.
	 */
	public static function deactivate(): void {}

	// -------------------------------------------------------------------------
	// Private helpers
	// -------------------------------------------------------------------------

	/**
	 * Attach all WordPress action/filter hooks.
	 */
	private function register_hooks(): void {
		add_action( 'plugins_loaded', array( $this, 'load_textdomain' ) );
		add_action( 'admin_init', array( self::class, 'ensure_wares_directory' ) );
		add_action( 'admin_menu', array( $this->menu_manager, 'register' ) );
		add_action( 'admin_menu', array( $this->bazaar_page, 'register_page' ) );
		add_action( 'admin_enqueue_scripts', array( $this->bazaar_page, 'enqueue_assets' ) );
		add_action( 'rest_api_init', array( $this, 'register_rest_routes' ) );

		if ( defined( 'WP_CLI' ) && WP_CLI ) {
			WP_CLI::add_command( 'bazaar', BazaarCommand::class );
		}
	}

	/**
	 * Load the plugin text domain for translations.
	 */
	public function load_textdomain(): void {
		load_plugin_textdomain(
			'bazaar',
			false,
			dirname( plugin_basename( BAZAAR_FILE ) ) . '/languages'
		);
	}

	/**
	 * Register all plugin REST API routes.
	 */
	public function register_rest_routes(): void {
		( new WareServer( $this->registry ) )->register_routes();
		( new UploadController( $this->registry ) )->register_routes();
		( new WareController( $this->registry ) )->register_routes();
	}

	/**
	 * Create wp-content/bazaar/ and write a protective .htaccess if missing.
	 */
	public static function ensure_wares_directory(): void {
		if ( ! is_dir( BAZAAR_WARES_DIR ) ) {
			wp_mkdir_p( BAZAAR_WARES_DIR );
		}

		$htaccess = BAZAAR_WARES_DIR . '.htaccess';
		if ( ! file_exists( $htaccess ) ) {
			global $wp_filesystem;
			if ( empty( $wp_filesystem ) ) {
				require_once ABSPATH . 'wp-admin/includes/file.php';
				WP_Filesystem();
			}
			$wp_filesystem->put_contents(
				$htaccess,
				"# Block direct access to all wares.\n" .
				"deny from all\n\n" .
				"<IfModule mod_php.c>\n" .
				"  php_flag engine off\n" .
				"</IfModule>\n",
				FS_CHMOD_FILE
			);
		}
	}
}
