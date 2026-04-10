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
 *
 * Admin-only hooks (admin_menu, admin_enqueue_scripts) are skipped on REST
 * and frontend requests so the menu/page classes are never instantiated
 * outside the wp-admin context.
 */
final class Plugin {

	/**
	 * Singleton instance, null before first boot().
	 *
	 * @var self|null
	 */
	private static ?self $instance = null;

	/**
	 * Holds installed-ware metadata. Shared across all service classes.
	 *
	 * @var WareRegistry
	 */
	private WareRegistry $registry;

	/**
	 * Registers wp-admin pages for enabled wares. Null on non-admin requests.
	 *
	 * @var MenuManager|null
	 */
	private ?MenuManager $menu_manager = null;

	/**
	 * Renders the Bazaar marketplace admin page. Null on non-admin requests.
	 *
	 * @var BazaarPage|null
	 */
	private ?BazaarPage $bazaar_page = null;

	/**
	 * Private constructor — use Plugin::boot() instead.
	 * Only WareRegistry is instantiated here; admin-only classes are deferred.
	 */
	private function __construct() {
		$this->registry = new WareRegistry();
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
	 * Plugin activation: verify the environment, create required directories,
	 * and seed the option.
	 */
	public static function activate(): void {
		self::check_environment();
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
	 *
	 * REST and WP-CLI routes are registered unconditionally.
	 * Admin-only hooks are gated on is_admin() to avoid unnecessary work on
	 * frontend and REST API requests.
	 */
	private function register_hooks(): void {
		add_action( 'plugins_loaded', array( $this, 'load_textdomain' ) );
		add_action( 'rest_api_init', array( $this, 'register_rest_routes' ) );

		if ( defined( 'WP_CLI' ) && \WP_CLI ) {
			\WP_CLI::add_command( 'bazaar', BazaarCommand::class );
		}

		if ( ! is_admin() ) {
			return;
		}

		add_action( 'admin_init', array( self::class, 'ensure_wares_directory' ) );
		add_action( 'admin_menu', array( $this, 'register_admin_menus' ) );
		add_action( 'admin_enqueue_scripts', array( $this, 'maybe_enqueue_assets' ) );
	}

	/**
	 * Lazy-initialise admin-only classes and register all admin menu pages.
	 * Bound to the admin_menu action.
	 */
	public function register_admin_menus(): void {
		$this->menu_manager ??= new MenuManager( $this->registry );
		$this->bazaar_page  ??= new BazaarPage( $this->registry );

		$this->menu_manager->register();
		$this->bazaar_page->register_page();
	}

	/**
	 * Proxy for BazaarPage::enqueue_assets(), called on admin_enqueue_scripts.
	 *
	 * @param string $hook_suffix Current admin page hook suffix.
	 */
	public function maybe_enqueue_assets( string $hook_suffix ): void {
		if ( null !== $this->bazaar_page ) {
			$this->bazaar_page->enqueue_assets( $hook_suffix );
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
	 * Create wp-content/bazaar/ and write protective index.php + .htaccess.
	 */
	public static function ensure_wares_directory(): void {
		if ( ! is_dir( BAZAAR_WARES_DIR ) ) {
			wp_mkdir_p( BAZAAR_WARES_DIR );
		}

		global $wp_filesystem;
		if ( empty( $wp_filesystem ) ) {
			require_once ABSPATH . 'wp-admin/includes/file.php';
			WP_Filesystem();
		}

		// Silence-PHP index as a defence-in-depth layer against directory listing.
		$index = BAZAAR_WARES_DIR . 'index.php';
		if ( ! file_exists( $index ) && ! empty( $wp_filesystem ) ) {
			$wp_filesystem->put_contents( $index, "<?php\n// Silence is golden.\n", FS_CHMOD_FILE );
		}

		$htaccess = BAZAAR_WARES_DIR . '.htaccess';
		if ( ! file_exists( $htaccess ) && ! empty( $wp_filesystem ) ) {
			$wp_filesystem->put_contents(
				$htaccess,
				"# Deny direct access — Bazaar serves all ware files through the REST API.\n" .
				"<IfModule mod_authz_core.c>\n" .
				"  Require all denied\n" .
				"</IfModule>\n" .
				"<IfModule !mod_authz_core.c>\n" .
				"  Deny from all\n" .
				"</IfModule>\n\n" .
				"# Disable PHP execution as a second-layer defence.\n" .
				"<IfModule mod_php.c>\n" .
				"  php_flag engine off\n" .
				"</IfModule>\n" .
				"<IfModule mod_php8.c>\n" .
				"  php_flag engine off\n" .
				"</IfModule>\n",
				FS_CHMOD_FILE
			);
		}
	}

	/**
	 * Verify that the server environment meets Bazaar's requirements.
	 *
	 * Called on activation. Deactivates the plugin and shows a friendly error
	 * if a hard requirement is not met, rather than leaving a broken state.
	 */
	private static function check_environment(): void {
		$errors = array();

		if ( ! class_exists( 'ZipArchive' ) ) {
			$errors[] = __( 'The PHP ZipArchive extension is required but not installed.', 'bazaar' );
		}

		if ( ! wp_is_writable( WP_CONTENT_DIR ) ) {
			$errors[] = sprintf(
				/* translators: %s: path to wp-content directory. */
				__( 'The wp-content directory (%s) must be writable.', 'bazaar' ),
				WP_CONTENT_DIR
			);
		}

		if ( empty( $errors ) ) {
			return;
		}

		// Deactivate ourselves and show the errors rather than leaving a broken plugin active.
		deactivate_plugins( plugin_basename( BAZAAR_FILE ) );

		$error_items = '';
		foreach ( $errors as $error ) {
			$error_items .= '<li>' . esc_html( $error ) . '</li>';
		}

		wp_die(
			wp_kses_post(
				'<p><strong>' . esc_html__( 'Bazaar could not be activated:', 'bazaar' ) . '</strong></p><ul>' . $error_items . '</ul>'
			),
			esc_html__( 'Plugin activation error', 'bazaar' ),
			array( 'back_link' => true )
		);
	}
}
