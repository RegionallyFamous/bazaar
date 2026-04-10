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

	/**
	 * Provides the list of installed wares.
	 *
	 * @var WareRegistry
	 */
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
			// sanitize_title() preserves dots and hyphens that are valid in
			// core parent slugs (e.g. options-general.php, tools.php), unlike
			// sanitize_key() which strips them.
			add_submenu_page(
				sanitize_title( $parent ),
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
	 * Uses realpath() confinement so a crafted icon path (e.g. ../../wp-config.php)
	 * cannot escape the ware's own directory.
	 *
	 * @param string $slug      Ware slug (used to build the file path).
	 * @param string $icon_path Relative icon path from the ware manifest.
	 */
	private function resolve_icon( string $slug, string $icon_path ): string {
		if ( '' === $icon_path ) {
			return 'dashicons-admin-plugins';
		}

		$ware_dir  = realpath( BAZAAR_WARES_DIR . sanitize_key( $slug ) );
		$full_path = realpath( BAZAAR_WARES_DIR . sanitize_key( $slug ) . '/' . ltrim( $icon_path, '/' ) );

		// Confinement check: both paths must resolve and the file must stay inside the ware dir.
		if (
			false === $ware_dir ||
			false === $full_path ||
			! str_starts_with( $full_path, $ware_dir . DIRECTORY_SEPARATOR ) ||
			! is_file( $full_path )
		) {
			return 'dashicons-admin-plugins';
		}

		$ext = strtolower( pathinfo( $full_path, PATHINFO_EXTENSION ) );

		if ( 'svg' === $ext ) {
			global $wp_filesystem;
			if ( empty( $wp_filesystem ) ) {
				require_once ABSPATH . 'wp-admin/includes/file.php';
				WP_Filesystem();
			}
			$svg = ! empty( $wp_filesystem ) ? $wp_filesystem->get_contents( $full_path ) : false;
			if ( is_string( $svg ) && '' !== $svg ) {
				$safe = $this->sanitize_svg( $svg );
				return 'data:image/svg+xml;base64,' . base64_encode( $safe ); // phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions.obfuscation_base64_encode
			}
		}

		if ( in_array( $ext, array( 'png', 'jpg', 'jpeg', 'gif', 'webp' ), true ) ) {
			return esc_url( rest_url( 'bazaar/v1/serve/' . rawurlencode( $slug ) . '/' . rawurlencode( $icon_path ) ) );
		}

		return 'dashicons-admin-plugins';
	}

	/**
	 * Strip script elements and event-handler attributes from an SVG string.
	 *
	 * This is a lightweight defence-in-depth pass for SVGs embedded as data
	 * URIs in the wp-admin sidebar. Wares already require manage_options to
	 * install, but we still sanitise to limit blast radius from a compromised
	 * registry or a confused-deputy scenario.
	 *
	 * @param string $svg Raw SVG markup.
	 * @return string Sanitized SVG markup.
	 */
	private function sanitize_svg( string $svg ): string {
		// Remove <script> blocks (including CDATA-wrapped).
		$svg = (string) preg_replace( '/<script\b[^>]*>.*?<\/script>/si', '', $svg );
		// Remove inline event handlers (onload, onerror, onclick, …).
		$svg = (string) preg_replace( '/\s+on[a-z]+\s*=\s*(?:"[^"]*"|\'[^\']*\')/i', '', $svg );
		// Remove javascript: URIs in href / xlink:href.
		$svg = (string) preg_replace( '/\b(href|xlink:href)\s*=\s*["\']javascript:[^"\']*["\']/i', '', $svg );
		return $svg;
	}
}
