<?php
/**
 * Bazaar Shell — the single admin page that hosts all ware iframes.
 *
 * Replaces O(n) per-ware menu registrations with one top-level page.
 * Ware switching is instant client-side; the LRU iframe manager keeps
 * up to N recently-used wares live in memory simultaneously.
 *
 * @package Bazaar
 */

declare( strict_types=1 );

namespace Bazaar;

defined( 'ABSPATH' ) || exit;

/**
 * Registers and renders the Bazaar Shell — a single full-bleed admin page
 * that houses the nav rail and all ware iframes.
 */
final class BazaarShell {

	/** WordPress page slug. Replaces the old per-ware pages. */
	public const PAGE_SLUG = 'bazaar';

	/** JS/CSS handle. */
	public const HANDLE = 'bazaar-shell';

	/**
	 * Provides the ware index for the nav rail.
	 *
	 * @var WareRegistry
	 */
	private WareRegistry $registry;

	/**
	 * Screen ID returned by add_menu_page(). Populated after admin_menu.
	 *
	 * @var string
	 */
	private string $screen_id = '';

	/**
	 * Constructor.
	 *
	 * @param WareRegistry $registry Registry instance.
	 */
	public function __construct( WareRegistry $registry ) {
		$this->registry = $registry;
	}

	/**
	 * Register the single Bazaar top-level menu page.
	 * Bound to admin_menu.
	 */
	public function register_page(): void {
		$this->screen_id = (string) add_menu_page(
			esc_html__( 'Bazaar', 'bazaar' ),
			esc_html__( 'Bazaar', 'bazaar' ),
			'manage_options',
			self::PAGE_SLUG,
			array( $this, 'render_page' ),
			'dashicons-store',
			2
		);

	}

	/**
	 * Enqueue shell assets — only on the shell page.
	 *
	 * @param string $hook_suffix Current admin page hook.
	 */
	public function enqueue_assets( string $hook_suffix ): void {
		if ( $this->screen_id !== $hook_suffix ) {
			return;
		}

		list( $js_file, $css_file, $version ) = $this->resolve_assets();

		if ( '' !== $css_file ) {
			wp_enqueue_style( self::HANDLE, BAZAAR_URL . 'admin/dist/' . $css_file, array(), $version );

			/*
			 * Suppress the WP admin sidebar so Bazaar's own nav rail is the sole
			 * left-side navigation. Output in <head> via inline style so it applies
			 * before the sidebar paints — no FOUC, no body-class dependency.
			 */
			wp_add_inline_style(
				self::HANDLE,
				'#adminmenuwrap,#adminmenuback{display:none!important;}#wpcontent{margin-left:0!important;}'
			);
		}

		if ( '' !== $js_file ) {
			wp_enqueue_script( self::HANDLE, BAZAAR_URL . 'admin/dist/' . $js_file, array( 'wp-i18n' ), $version, true );
			wp_set_script_translations( self::HANDLE, 'bazaar', BAZAAR_DIR . 'languages' );

			$raw_color   = get_user_option( 'admin_color' );
			$admin_color = sanitize_key( $raw_color ? (string) $raw_color : 'fresh' );

			// Build ware index with per-ware trust + zero_trust flags.
			$index = array_map(
				static function ( array $ware ): array {
					return array_merge(
						$ware,
						array(
							'trust'      => $ware['trust'] ?? 'standard',
							'zero_trust' => ! empty( $ware['zero_trust'] ),
						)
					);
				},
				array_values( $this->registry->get_index() )
			);

			// Branding.
			$branding = get_option( 'bazaar_branding', array() );
			if ( ! is_array( $branding ) ) {
				$branding = array();
			}

			$outdated_wares = get_option( 'bazaar_outdated_wares', array() );
			$outdated_count = is_array( $outdated_wares ) ? count( $outdated_wares ) : 0;

			wp_localize_script(
				self::HANDLE,
				'bazaarShell',
				array(
					'restUrl'       => esc_url_raw( rest_url( 'bazaar/v1' ) ),
					'nonce'         => wp_create_nonce( 'wp_rest' ),
					'adminColor'    => $admin_color,
					'manageUrl'     => esc_url_raw( admin_url( 'admin.php?page=' . BazaarPage::PAGE_SLUG ) ),
					'wares'         => $index,
					'branding'      => $branding,
				'devMode'       => defined( 'WP_DEBUG' ) && WP_DEBUG,
				'outdatedCount' => $outdated_count,
				'swUrl'         => BAZAAR_URL . 'admin/dist/zero-trust-sw.js',
				)
			);
		}
	}

	/**
	 * Render the shell page wrapper — the JS takes over from here.
	 */
	public function render_page(): void {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'You do not have permission to access this page.', 'bazaar' ) );
		}
		require BAZAAR_DIR . 'templates/bazaar-shell.php';
	}

	// -------------------------------------------------------------------------
	// Private helpers
	// -------------------------------------------------------------------------

	/**
	 * Resolve shell asset filenames from Vite's manifest.json.
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
				$entry    = $manifest['admin/src/shell.js'] ?? array();
				$js_file  = $entry['file'] ?? '';
				$css_file = $entry['css'][0] ?? '';
				return array( $js_file, $css_file, BAZAAR_VERSION );
			}
		}

		// Dev fallback.
		if ( file_exists( BAZAAR_DIR . 'admin/dist/shell.js' ) ) {
			return array( 'shell.js', 'shell.css', BAZAAR_VERSION );
		}

		return array( '', '', '' );
	}
}
