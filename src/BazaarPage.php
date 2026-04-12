<?php
/**
 * Bazaar admin page — registers and renders the marketplace UI.
 *
 * @package Bazaar
 */

declare( strict_types=1 );

namespace Bazaar;

defined( 'ABSPATH' ) || exit;

/**
 * Registers and renders the top-level "Bazaar" admin page.
 *
 * This is the marketplace UI where admins browse installed wares,
 * upload new .wp files, and manage (enable/disable/delete) existing ones.
 */
final class BazaarPage {

	/** WordPress screen slug for the manage (marketplace) admin page. */
	public const PAGE_SLUG = 'bazaar-manage';

	/** Handle used when enqueuing the admin script. */
	public const SCRIPT_HANDLE = 'bazaar-admin';

	/**
	 * Provides installed-ware data for the page.
	 *
	 * @var WareRegistryInterface
	 */
	private WareRegistryInterface $registry;

	/**
	 * Screen ID returned by add_menu_page(), populated after admin_menu fires.
	 *
	 * @var string
	 */
	private string $screen_id = '';

	/**
	 * Cached result of WareRegistry::get_all(), populated lazily.
	 * Both enqueue_assets() and render_page() fire on the same request, so
	 * we only pay the registry-load cost once.
	 *
	 * @var array<string, array<string, mixed>>|null
	 */
	private ?array $wares = null;

	/**
	 * Constructor.
	 *
	 * @param WareRegistryInterface $registry Registry instance.
	 */
	public function __construct( WareRegistryInterface $registry ) {
		$this->registry = $registry;
	}

	/**
	 * Register the manage page as a hidden submenu (no sidebar entry).
	 * Accessible via admin.php?page=bazaar-manage, linked from the shell.
	 * Bound to the admin_menu action.
	 */
	public function register_page(): void {
		$this->screen_id = (string) add_submenu_page(
			'',
			esc_html__( 'Manage Wares', 'bazaar' ),
			esc_html__( 'Manage Wares', 'bazaar' ),
			'manage_options',
			self::PAGE_SLUG,
			array( $this, 'render_page' )
		);

		// get_admin_page_title() cannot locate titles for hidden submenu pages
		// (parent = ''), so the admin_title filter is used instead to ensure
		// the <title> tag is populated correctly without touching WP globals.
		add_action( "load-{$this->screen_id}", array( $this, 'set_page_title' ) );
	}

	/**
	 * Set the $title global and hook admin_title so both the strip_tags() call
	 * in admin-header.php and the HTML <title> tag are correctly populated.
	 *
	 * Hidden submenu pages (parent_slug = '') are not indexed by
	 * get_admin_page_title(), so we must set the global ourselves.
	 */
	public function set_page_title(): void {
		global $title;
		if ( empty( $title ) ) {
			// phpcs:ignore WordPress.WP.GlobalVariablesOverride.Prohibited
			$title = esc_html__( 'Manage Wares', 'bazaar' );
		}
		add_filter( 'admin_title', array( $this, 'filter_page_title' ) );
	}

	/**
	 * Inject the Bazaar page title into the admin <title> tag.
	 *
	 * @return string
	 */
	public function filter_page_title(): string {
		$page_name = esc_html__( 'Manage Wares', 'bazaar' );
		return $page_name . ' &#8249; ' . get_bloginfo( 'name' ) . ' &#8212; WordPress';
	}

	/**
	 * Enqueue admin assets only on the Bazaar page.
	 * Bound to the admin_enqueue_scripts action.
	 *
	 * @param string $hook_suffix The current admin page hook suffix.
	 */
	public function enqueue_assets( string $hook_suffix ): void {
		if ( $this->screen_id !== $hook_suffix ) {
			return;
		}

		// Detect iframe context immediately in <head> — before the admin bar
		// and sidebar are painted — so the bazaar-in-shell CSS rules hide them
		// without any flash of the WordPress chrome.
		add_action(
			'admin_head',
			static function (): void {
				echo '<script>if(window!==window.top){document.documentElement.classList.add("bazaar-in-shell");}</script>' . "\n";
			}
		);

		list( $js_file, $css_file, $version ) = $this->resolve_assets();

		if ( '' !== $js_file ) {
			wp_enqueue_script(
				self::SCRIPT_HANDLE,
				BAZAAR_URL . 'admin/dist/' . $js_file,
				array( 'wp-api-fetch' ),
				$version,
				true
			);

			wp_localize_script(
				self::SCRIPT_HANDLE,
				'bazaarData',
				array(
					'restUrl'   => esc_url_raw( rest_url( 'bazaar/v1' ) ),
					'nonce'     => wp_create_nonce( 'wp_rest' ),
					'wares'     => $this->get_wares(),
					'maxSizeMb' => absint( get_option( 'bazaar_max_ware_size', BAZAAR_MAX_UNCOMPRESSED_SIZE ) ) / 1024 / 1024,
					// main.js uses this to decide whether to emit postMessage events
					// back to the parent shell. We detect the iframe context server-side
					// from the Sec-Fetch-Dest header; the admin_head inline script also
					// adds .bazaar-in-shell on the <html> element as a CSS hook.
					'inShell'   => ( isset( $_SERVER['HTTP_SEC_FETCH_DEST'] ) && 'iframe' === $_SERVER['HTTP_SEC_FETCH_DEST'] ) || ( isset( $_SERVER['HTTP_REFERER'] ) && str_contains( (string) $_SERVER['HTTP_REFERER'], 'page=bazaar' ) ),
				)
			);

			wp_set_script_translations( self::SCRIPT_HANDLE, 'bazaar', BAZAAR_DIR . 'languages' );
		}

		if ( '' !== $css_file ) {
			wp_enqueue_style(
				self::SCRIPT_HANDLE,
				BAZAAR_URL . 'admin/dist/' . $css_file,
				array(),
				$version
			);
		}
	}

	/**
	 * Render the Bazaar admin page.
	 */
	public function render_page(): void {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'You do not have permission to access this page.', 'bazaar' ) );
		}
		$wares    = $this->get_wares();
		$rest_url = esc_url_raw( rest_url( 'bazaar/v1' ) );
		require BAZAAR_DIR . 'templates/bazaar-page.php';
	}

	// -------------------------------------------------------------------------
	// Private helpers
	// -------------------------------------------------------------------------

	/**
	 * Return all installed wares, loading the registry at most once per request.
	 *
	 * @return array<string, array<string, mixed>>
	 */
	private function get_wares(): array {
		if ( null === $this->wares ) {
			$this->wares = $this->registry->get_all();
		}
		return $this->wares;
	}

	/**
	 * Resolve built asset filenames from Vite's manifest.json, falling back
	 * to predictable names during local development (no manifest present).
	 *
	 * @return array{0: string, 1: string, 2: string} [$js_file, $css_file, $version]
	 */
	private function resolve_assets(): array {
		$manifest_path = BAZAAR_DIR . 'admin/dist/.vite/manifest.json';

		if ( file_exists( $manifest_path ) ) {
			// phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents
			$raw      = file_get_contents( $manifest_path );
			$manifest = is_string( $raw ) ? json_decode( $raw, true ) : null;

			if ( is_array( $manifest ) ) {
				$entry    = $manifest['admin/src/main.js'] ?? array();
				$js_file  = $entry['file'] ?? '';
				$css_file = $entry['css'][0] ?? '';
				$version  = BAZAAR_VERSION;
				return array( $js_file, $css_file, $version );
			}
		}

		// Dev fallback — Vite outputs plain names when building without hashing.
		if ( file_exists( BAZAAR_DIR . 'admin/dist/bazaar.js' ) ) {
			return array( 'bazaar.js', 'bazaar.css', BAZAAR_VERSION );
		}

		return array( '', '', '' );
	}
}
