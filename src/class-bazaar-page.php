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
	 * @var WareRegistry
	 */
	private WareRegistry $registry;

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
	 * @param WareRegistry $registry Registry instance.
	 */
	public function __construct( WareRegistry $registry ) {
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
					// Tells main.js to emit postMessage events when wares change so
					// the parent shell can update its nav rail without a page reload.
					'inShell'   => true,
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
			global $wp_filesystem;
			if ( empty( $wp_filesystem ) ) {
				require_once ABSPATH . 'wp-admin/includes/file.php';
				WP_Filesystem();
			}
			$raw      = ! empty( $wp_filesystem ) ? $wp_filesystem->get_contents( $manifest_path ) : false;
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
