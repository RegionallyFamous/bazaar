<?php
/**
 * Menu manager — registers wp-admin pages for enabled wares.
 *
 * @package Bazaar
 */

declare( strict_types=1 );

namespace Bazaar;

defined( 'ABSPATH' ) || exit;

/**
 * Registers a WordPress admin menu page for every enabled ware.
 *
 * Hooked to admin_menu. Loops through the registry and calls add_menu_page()
 * or add_submenu_page() depending on the ware's manifest configuration.
 */
final class MenuManager {

	/** @var WareRegistry Provides the list of installed wares. */
	private WareRegistry $registry;

	/**
	 * Constructor.
	 *
	 * @param WareRegistry $registry Registry instance.
	 */
	public function __construct( WareRegistry $registry ) {
		$this->registry = $registry;
	}

	/**
	 * Register admin menu pages for all enabled wares.
	 * Bound to the admin_menu action.
	 */
	public function register(): void {
		foreach ( $this->registry->get_all() as $slug => $ware ) {
			if ( ! ( $ware['enabled'] ?? false ) ) {
				continue;
			}
			$this->add_ware_page( $slug, $ware );
		}
	}

	// -------------------------------------------------------------------------
	// Private helpers
	// -------------------------------------------------------------------------

	/**
	 * Add a single ware's wp-admin page (top-level or submenu).
	 *
	 * @param string               $slug Ware slug.
	 * @param array<string, mixed> $ware Ware metadata from the registry.
	 */
	private function add_ware_page( string $slug, array $ware ): void {
		$menu       = $ware['menu'] ?? array();
		$title      = ! empty( $menu['title'] ) ? $menu['title'] : $ware['name'];
		$capability = ! empty( $menu['capability'] ) ? $menu['capability'] : 'manage_options';
		$position   = isset( $menu['position'] ) ? absint( $menu['position'] ) : null;
		$parent     = ! empty( $menu['parent'] ) ? $menu['parent'] : null;

		$menu_title = esc_html( $title );
		$page_title = esc_html( $ware['name'] );
		$capability = sanitize_key( $capability );
		$menu_slug  = 'bazaar-ware-' . sanitize_key( $slug );
		$icon       = $this->resolve_icon( $slug, $ware['icon'] ?? '' );
		$callback   = function () use ( $slug ) {
			( new WareRenderer( $slug, $this->registry ) )->render();
		};

		if ( null !== $parent ) {
			add_submenu_page(
				sanitize_key( $parent ),
				$page_title,
				$menu_title,
				$capability,
				$menu_slug,
				$callback,
				$position
			);
		} else {
			add_menu_page(
				$page_title,
				$menu_title,
				$capability,
				$menu_slug,
				$callback,
				$icon,
				$position
			);
		}
	}

	/**
	 * Resolve the ware's icon to either a data URI (for SVG) or a dashicon string.
	 *
	 * @param string $slug      Ware slug (used to build the file path).
	 * @param string $icon_path Relative icon path from the ware manifest.
	 */
	private function resolve_icon( string $slug, string $icon_path ): string {
		if ( '' === $icon_path ) {
			return 'dashicons-admin-plugins';
		}

		$full_path = BAZAAR_WARES_DIR . sanitize_key( $slug ) . '/' . ltrim( $icon_path, '/' );

		if ( ! file_exists( $full_path ) ) {
			return 'dashicons-admin-plugins';
		}

		$ext = strtolower( pathinfo( $full_path, PATHINFO_EXTENSION ) );

		if ( 'svg' === $ext ) {
			$svg = file_get_contents( $full_path ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents
			if ( false !== $svg ) {
				return 'data:image/svg+xml;base64,' . base64_encode( $svg ); // phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions.obfuscation_base64_encode
			}
		}

		if ( in_array( $ext, array( 'png', 'jpg', 'jpeg', 'gif', 'webp' ), true ) ) {
			return esc_url( rest_url( 'bazaar/v1/serve/' . rawurlencode( $slug ) . '/' . rawurlencode( $icon_path ) ) );
		}

		return 'dashicons-admin-plugins';
	}
}
