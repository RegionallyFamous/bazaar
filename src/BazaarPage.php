<?php

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

	/** WordPress screen ID for the Bazaar admin page. */
	private const PAGE_SLUG = 'bazaar';

	/** Handle used when enqueuing the admin script. */
	private const SCRIPT_HANDLE = 'bazaar-admin';

	private WareRegistry $registry;

	/** Screen ID returned by add_menu_page(), populated after admin_menu fires. */
	private string $screen_id = '';

	public function __construct( WareRegistry $registry ) {
		$this->registry = $registry;
	}

	/**
	 * Register the Bazaar top-level menu page.
	 * Bound to the admin_menu action.
	 */
	public function register_page(): void {
		$this->screen_id = (string) add_menu_page(
			esc_html__( 'Bazaar', 'bazaar' ),
			esc_html__( 'Bazaar', 'bazaar' ),
			'manage_options',
			self::PAGE_SLUG,
			[ $this, 'render_page' ],
			'dashicons-store',
			2
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

		[ $js_file, $css_file, $version ] = $this->resolve_assets();

		if ( '' !== $js_file ) {
			wp_enqueue_script(
				self::SCRIPT_HANDLE,
				BAZAAR_URL . 'admin/dist/' . $js_file,
				[ 'wp-api-fetch' ],
				$version,
				true
			);

			wp_localize_script(
				self::SCRIPT_HANDLE,
				'bazaarData',
				[
					'restUrl'    => esc_url_raw( rest_url( 'bazaar/v1' ) ),
					'nonce'      => wp_create_nonce( 'wp_rest' ),
					'wares'      => $this->registry->get_all(),
					'maxSizeMb'  => absint( get_option( 'bazaar_max_ware_size', BAZAAR_MAX_UNCOMPRESSED_SIZE ) ) / 1024 / 1024,
				]
			);

			wp_set_script_translations( self::SCRIPT_HANDLE, 'bazaar', BAZAAR_DIR . 'languages' );
		}

		if ( '' !== $css_file ) {
			wp_enqueue_style(
				self::SCRIPT_HANDLE,
				BAZAAR_URL . 'admin/dist/' . $css_file,
				[],
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
		$wares    = $this->registry->get_all();
		$rest_url = esc_url_raw( rest_url( 'bazaar/v1' ) );
		require BAZAAR_DIR . 'templates/bazaar-page.php';
	}

	// -------------------------------------------------------------------------
	// Private helpers
	// -------------------------------------------------------------------------

	/**
	 * Resolve built asset filenames from Vite's manifest.json, falling back
	 * to predictable names during local development (no manifest present).
	 *
	 * @return array{0: string, 1: string, 2: string} [$js_file, $css_file, $version]
	 */
	private function resolve_assets(): array {
		$manifest_path = BAZAAR_DIR . 'admin/dist/.vite/manifest.json';

		if ( file_exists( $manifest_path ) ) {
			$raw      = file_get_contents( $manifest_path ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents
			$manifest = is_string( $raw ) ? json_decode( $raw, true ) : null;

			if ( is_array( $manifest ) ) {
				$entry    = $manifest['admin/src/main.js'] ?? [];
				$js_file  = $entry['file'] ?? '';
				$css_file = $entry['css'][0] ?? '';
				$version  = BAZAAR_VERSION;
				return [ $js_file, $css_file, $version ];
			}
		}

		// Dev fallback — Vite outputs plain names when building without hashing.
		if ( file_exists( BAZAAR_DIR . 'admin/dist/bazaar.js' ) ) {
			return [ 'bazaar.js', 'bazaar.css', BAZAAR_VERSION ];
		}

		return [ '', '', '' ];
	}
}
