<?php
/**
 * Central plugin bootstrap.
 *
 * @package Bazaar
 */

declare( strict_types=1 );

namespace Bazaar;

defined( 'ABSPATH' ) || exit;

use Bazaar\AuditLog;
use Bazaar\Blocks\WareBlock;
use Bazaar\CLI\BazaarCommand;
use Bazaar\REST\AnalyticsController;
use Bazaar\REST\AuditController;
use Bazaar\REST\BadgeController;
use Bazaar\REST\ConfigController;
use Bazaar\REST\CoreAppsController;
use Bazaar\REST\CspController;
use Bazaar\REST\ErrorsController;
use Bazaar\REST\HealthController;
use Bazaar\REST\JobsController;
use Bazaar\REST\NonceController;
use Bazaar\REST\ServiceWorkerController;
use Bazaar\REST\StorageController;
use Bazaar\REST\StreamController;
use Bazaar\REST\UploadController;
use Bazaar\REST\WareController;
use Bazaar\REST\WareServer;
use Bazaar\REST\WebhooksController;
use Bazaar\WebhookDispatcher;
use Bazaar\RemoteRegistry;
use Bazaar\WareLoader;
use Bazaar\WareUpdater;

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
	 * Handles cross-site (multisite) registration.
	 *
	 * @var Multisite
	 */
	private Multisite $multisite;

	/**
	 * Handles background auto-update cron jobs. Lazy-initialised.
	 *
	 * @var WareUpdater|null
	 */
	private ?WareUpdater $updater = null;

	/**
	 * Single-page shell that hosts all ware iframes. Null on non-admin requests.
	 *
	 * @var BazaarShell|null
	 */
	private ?BazaarShell $bazaar_shell = null;

	/**
	 * Hidden manage/marketplace page. Null on non-admin requests.
	 *
	 * @var BazaarPage|null
	 */
	private ?BazaarPage $bazaar_page = null;

	/**
	 * Private constructor — use Plugin::boot() instead.
	 * Only WareRegistry is instantiated here; admin-only classes are deferred.
	 */
	private function __construct() {
		$this->registry  = new WareRegistry();
		$this->multisite = new Multisite();
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

		// Seed the index option on a fresh install.
		// Migration from bazaar_registry happens lazily in WareRegistry::load_index().
		if ( false === get_option( 'bazaar_index' ) && false === get_option( 'bazaar_registry' ) ) {
			add_option( 'bazaar_index', wp_json_encode( array() ), '', false );
		}

		// Create all DB tables.
		AnalyticsController::create_table();
		ErrorsController::create_table();
		AuditLog::create_table();

		// Schedule the auto-update + health-check cron jobs.
		WareUpdater::schedule();
		if ( ! wp_next_scheduled( 'bazaar_health_refresh' ) ) {
			wp_schedule_event( time() + 300, 'bazaar_half_hour', 'bazaar_health_refresh' );
		}
	}

	/**
	 * Plugin deactivation: unschedule cron jobs but keep all data.
	 */
	public static function deactivate(): void {
		WareUpdater::unschedule();
		// Clear the health-refresh cron that activate() schedules.
		$ts = wp_next_scheduled( 'bazaar_health_refresh' );
		if ( $ts ) {
			wp_unschedule_event( $ts, 'bazaar_health_refresh' );
		}
	}


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
		add_action( 'init', array( $this, 'register_block' ) );

		// Custom cron intervals.
		add_filter(
			'cron_schedules',
			static function ( array $schedules ): array {
				$schedules['bazaar_half_hour'] = array(
					'interval' => 1800,
					'display'  => __( 'Every 30 minutes', 'bazaar' ),
				);
				return $schedules;
			}
		);

		// Health-check cron action.
		add_action( 'bazaar_health_refresh', array( HealthController::class, 'cron_refresh' ) );

		// Webhook dispatch when bus event fires.
		add_action( 'bazaar_bus_event', array( WebhookDispatcher::class, 'dispatch' ), 10, 3 );

		// Audit log lifecycle events.
		add_action( 'bazaar_ware_installed', fn( $slug ) => AuditLog::record( $slug, 'install' ) );
		add_action( 'bazaar_ware_deleted', fn( $slug ) => AuditLog::record( $slug, 'uninstall' ) );
		add_action( 'bazaar_ware_toggled', fn( $slug, $enabled ) => AuditLog::record( $slug, $enabled ? 'enable' : 'disable' ), 10, 2 );

		// Multisite support.
		$this->multisite->register_hooks();

		// Auto-updater cron.
		$this->updater = new WareUpdater( $this->registry, new RemoteRegistry(), new WareLoader( $this->registry ) );
		$this->updater->register_hooks();

		// Push SSE events for lifecycle actions (fired by UploadController / WareController).
		add_action( 'bazaar_ware_installed', array( $this, 'on_ware_installed_sse' ), 10, 2 );
		add_action( 'bazaar_ware_deleted', array( $this, 'on_ware_deleted_sse' ), 10, 1 );
		add_action( 'bazaar_ware_toggled', array( $this, 'on_ware_toggled_sse' ), 10, 2 );
		add_action( 'bazaar_ware_updated', array( $this, 'on_ware_updated_sse' ), 10, 2 );

		if ( defined( 'WP_CLI' ) && \WP_CLI ) {
			\WP_CLI::add_command( 'bazaar', BazaarCommand::class );
		}

		if ( ! is_admin() ) {
			return;
		}

		add_action( 'admin_init', array( self::class, 'ensure_wares_directory' ) );
		add_action( 'admin_menu', array( $this, 'register_admin_menus' ) );
		add_action( 'admin_enqueue_scripts', array( $this, 'maybe_enqueue_assets' ) );

		// Vite outputs ES modules. wp_enqueue_script emits plain <script> tags
		// by default; we must add type="module" so the browser accepts the
		// import statements that reference the shared vendor chunk.
		add_filter( 'script_loader_tag', array( $this, 'add_module_type' ), 10, 2 );
	}

	/**
	 * Register the bazaar/ware Gutenberg block.
	 */
	public function register_block(): void {
		( new WareBlock() )->register_hooks();
	}

	// ─── SSE dispatch hooks ───────────────────────────────────────────────────

	/**
	 * Push an SSE event when a new ware is installed.
	 *
	 * @param string               $slug     Installed ware slug.
	 * @param array<string, mixed> $manifest Installed ware manifest.
	 */
	public function on_ware_installed_sse( string $slug, array $manifest ): void {
		bazaar_push_sse_event(
			'ware-installed',
			array(
				'slug' => $slug,
				'name' => $manifest['name'] ?? $slug,
			)
		);
	}

	/**
	 * Push an SSE event when a ware is deleted.
	 *
	 * @param string $slug Deleted ware slug.
	 */
	public function on_ware_deleted_sse( string $slug ): void {
		bazaar_push_sse_event( 'ware-deleted', array( 'slug' => $slug ) );
	}

	/**
	 * Push an SSE event when a ware is enabled or disabled.
	 *
	 * @param string $slug    Ware slug.
	 * @param bool   $enabled New enabled state.
	 */
	public function on_ware_toggled_sse( string $slug, bool $enabled ): void {
		bazaar_push_sse_event(
			'ware-toggled',
			array(
				'slug'    => $slug,
				'enabled' => $enabled,
			)
		);
	}

	/**
	 * Push an SSE event when a ware is updated.
	 *
	 * @param string               $slug     Updated ware slug.
	 * @param array<string, mixed> $manifest Updated ware manifest.
	 */
	public function on_ware_updated_sse( string $slug, array $manifest ): void {
		bazaar_push_sse_event(
			'ware-updated',
			array(
				'slug'    => $slug,
				'version' => $manifest['version'] ?? '',
			)
		);
	}

	/**
	 * Add type="module" to Bazaar script tags so the browser accepts the
	 * ES-module import statements emitted by Vite's build.
	 *
	 * WordPress adds type='text/javascript' when the active theme does not
	 * declare add_theme_support('html5','script'). If we only prepend
	 * type="module" without removing the existing attribute the browser
	 * honours the first type (text/javascript) and the import statement
	 * throws a SyntaxError. Strip any existing type attribute first.
	 *
	 * @param string $tag    The full <script> HTML tag.
	 * @param string $handle The script handle passed to wp_enqueue_script().
	 * @return string Modified tag, or original tag for unrelated handles.
	 */
	public function add_module_type( string $tag, string $handle ): string {
		$bazaar_handles = array( BazaarShell::HANDLE, BazaarPage::SCRIPT_HANDLE );
		if ( ! in_array( $handle, $bazaar_handles, true ) ) {
			return $tag;
		}
		// Remove any existing type="…" or type='…' attribute WordPress may have added.
		$tag = preg_replace( '/\s+type=["\'][^"\']*["\']/', '', $tag ) ?? $tag;
		// Inject type="module" immediately after the opening <script token.
		return str_replace( '<script ', '<script type="module" ', $tag );
	}

	/**
	 * Register admin pages: the shell (one entry) + the hidden manage page.
	 * Per-ware menu items are gone — the shell handles navigation client-side.
	 * Bound to the admin_menu action.
	 */
	public function register_admin_menus(): void {
		$this->bazaar_shell ??= new BazaarShell( $this->registry );
		$this->bazaar_page  ??= new BazaarPage( $this->registry );

		$this->bazaar_shell->register_page();
		$this->bazaar_page->register_page();
	}

	/**
	 * Enqueue assets for whichever admin page is currently active.
	 * Bound to admin_enqueue_scripts.
	 *
	 * @param string $hook_suffix Current admin page hook suffix.
	 */
	public function maybe_enqueue_assets( string $hook_suffix ): void {
		$this->bazaar_shell?->enqueue_assets( $hook_suffix );
		$this->bazaar_page?->enqueue_assets( $hook_suffix );
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
		( new ServiceWorkerController() )->register_routes();
		( new UploadController( $this->registry ) )->register_routes();
		( new WareController( $this->registry ) )->register_routes();
		( new BadgeController() )->register_routes();
		( new StreamController() )->register_routes();
		( new AnalyticsController() )->register_routes();
		( new NonceController() )->register_routes();
		( new StorageController( $this->registry ) )->register_routes();
		( new ConfigController( $this->registry ) )->register_routes();
		( new WebhooksController() )->register_routes();
		( new HealthController( $this->registry ) )->register_routes();
		( new ErrorsController() )->register_routes();
		( new AuditController() )->register_routes();
		( new JobsController( $this->registry ) )->register_routes();
		( new CspController() )->register_routes();
		( new CoreAppsController( $this->registry ) )->register_routes();
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
		if ( ! empty( $wp_filesystem ) ) {
			// Always write (or overwrite) so the rules stay current even when
			// the plugin is updated with a changed policy.
			$wp_filesystem->put_contents(
				$htaccess,
				self::htaccess_content(),
				FS_CHMOD_FILE
			);
		}
	}

	/**
	 * Build the .htaccess content for wp-content/bazaar/.
	 *
	 * Strategy
	 * ────────
	 * HTML entry files are served through the authenticated REST endpoint
	 * (WareServer handles auth + context injection). Everything else
	 * (JS, CSS, images, fonts, SW) is served directly by the web server —
	 * there is no sensitive data in compiled assets, and direct serving is
	 * 10-100× faster than PHP for high-frequency sub-resource requests.
	 *
	 * PHP execution is disabled regardless of file extension as a second
	 * defence-in-depth layer (no .php files should ever be here).
	 */
	private static function htaccess_content(): string {
		return <<<'HTACCESS'
# -----------------------------------------------------------------------
# Bazaar wares directory
#
# HTML entry points require authentication and are served through the
# Bazaar REST API.  All other static assets (JS, CSS, images, fonts,
# service workers) are served directly by Apache for maximum performance.
# -----------------------------------------------------------------------

# Never execute PHP here.
<IfModule mod_php.c>
  php_flag engine off
</IfModule>
<IfModule mod_php8.c>
  php_flag engine off
</IfModule>

# Block HTML and PHP files — they must go through the REST file server.
<FilesMatch "\.(html?|php\d*)$">
  <IfModule mod_authz_core.c>
    Require all denied
  </IfModule>
  <IfModule !mod_authz_core.c>
    Deny from all
  </IfModule>
</FilesMatch>
HTACCESS;
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
