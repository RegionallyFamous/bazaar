<?php
/**
 * WordPress Multisite / Network support for Bazaar.
 *
 * When Bazaar is network-activated, it exposes two models:
 *
 * 1. Shared wares (network library)
 *    Wares uploaded on the network admin screen are available to all sites.
 *    Per-site admins can enable/disable them for their site.
 *    Wares are stored in wp-content/bazaar/ (same single-site location; the
 *    network admin manages the directory).
 *
 * 2. Site-private wares
 *    Each site can still install its own wares, visible only to that site.
 *    These live in a sub-directory: wp-content/bazaar/sites/{blog_id}/
 *
 * Option storage
 * ─────────────
 *   Network option: bazaar_network_index     — global ware index
 *   Site option:    bazaar_site_index        — per-site enable/disable overrides
 *
 * @package Bazaar
 */

declare( strict_types=1 );

namespace Bazaar;

defined( 'ABSPATH' ) || exit;

/**
 * Handles network-activation, shared ware merging, and per-site overrides.
 */
final class Multisite {

	/**
	 * Whether Bazaar is currently network-activated.
	 */
	public static function is_network(): bool {
		if ( ! is_multisite() ) {
			return false;
		}
		$plugins = get_site_option( 'active_sitewide_plugins', array() );
		return isset( $plugins[ plugin_basename( BAZAAR_PLUGIN_FILE ) ] );
	}

	/**
	 * Register multisite hooks.
	 */
	public function register_hooks(): void {
		if ( ! is_multisite() ) {
			return;
		}

		add_filter(
			'network_admin_plugin_action_links_' . plugin_basename( BAZAAR_PLUGIN_FILE ),
			array( $this, 'network_action_links' )
		);

		add_action( 'network_admin_menu', array( $this, 'add_network_menu' ) );

		// When a blog is deleted, clean up any site-specific wares.
		add_action( 'delete_blog', array( $this, 'on_blog_deleted' ), 10, 1 );
	}

	/**
	 * Add "Network Wares" page to the network admin.
	 */
	public function add_network_menu(): void {
		add_menu_page(
			__( 'Bazaar Network Wares', 'bazaar' ),
			__( 'Bazaar Wares', 'bazaar' ),
			'manage_network_plugins',
			'bazaar-network',
			array( $this, 'render_network_page' ),
			'dashicons-store',
			80
		);
	}

	/**
	 * Render the network admin wares page.
	 */
	public function render_network_page(): void {
		echo '<div class="wrap"><h1>' . esc_html__( 'Bazaar Network Wares', 'bazaar' ) . '</h1>';
		echo '<p>' . esc_html__( 'Wares installed here are available to all sites in the network. Individual sites can enable or disable them.', 'bazaar' ) . '</p>';
		echo '</div>';
	}

	/**
	 * Add network action links.
	 *
	 * @param string[] $links Existing links.
	 * @return string[]
	 */
	public function network_action_links( array $links ): array {
		$links[] = '<a href="' . esc_url( network_admin_url( 'admin.php?page=bazaar-network' ) ) . '">' . esc_html__( 'Network Wares', 'bazaar' ) . '</a>';
		return $links;
	}

	/**
	 * Return a merged ware index that combines network-level wares with
	 * site-level overrides.
	 *
	 * If Bazaar is not network-activated, returns the standard site index.
	 *
	 * @param WareRegistry $registry Local site registry.
	 * @return array<string, array<string, mixed>>
	 */
	public static function merge_index( WareRegistry $registry ): array {
		$index = $registry->get_index();

		if ( ! self::is_network() ) {
			return $index;
		}

		// Merge in network-level wares that haven't been explicitly overridden.
		$network_raw = get_site_option( 'bazaar_network_index', '{}' );
		$network     = json_decode( (string) $network_raw, true );

		if ( is_array( $network ) ) {
			foreach ( $network as $slug => $entry ) {
				if ( ! is_array( $entry ) || isset( $index[ $slug ] ) ) {
					continue;
				}
				// Inherit from network but mark it as network-sourced.
				$entry['network'] = true;
				$index[ $slug ]   = $entry;
			}
		}

		return $index;
	}

	/**
	 * Enable a network ware for the current site.
	 *
	 * @param string $slug Ware slug.
	 */
	public static function enable_for_site( string $slug ): void {
		$overrides          = self::get_site_overrides();
		$slug               = sanitize_key( $slug );
		$overrides[ $slug ] = true;
		$json               = wp_json_encode( $overrides );
		if ( false !== $json ) {
			update_option( 'bazaar_site_overrides', $json, false );
		}
	}

	/**
	 * Disable a network ware for the current site.
	 *
	 * @param string $slug Ware slug.
	 */
	public static function disable_for_site( string $slug ): void {
		$overrides          = self::get_site_overrides();
		$slug               = sanitize_key( $slug );
		$overrides[ $slug ] = false;
		$json               = wp_json_encode( $overrides );
		if ( false !== $json ) {
			update_option( 'bazaar_site_overrides', $json, false );
		}
	}

	/**
	 * Cleanup wares for a deleted blog.
	 *
	 * @param int $blog_id The deleted blog's ID.
	 */
	public function on_blog_deleted( int $blog_id ): void {
		$site_dir = BAZAAR_WARES_DIR . 'sites/' . $blog_id . '/';
		if ( is_dir( $site_dir ) ) {
			$filesystem = null;
			if ( ! function_exists( 'WP_Filesystem' ) ) {
				require_once ABSPATH . 'wp-admin/includes/file.php';
			}
			WP_Filesystem();
			global $wp_filesystem;
			if ( $wp_filesystem ) {
				$wp_filesystem->delete( $site_dir, true );
			}
		}
		delete_blog_option( $blog_id, 'bazaar_site_overrides' );
	}

	// -------------------------------------------------------------------------

	/**
	 * Return per-site enabled/disabled overrides stored in bazaar_site_overrides option.
	 *
	 * @return array<string, bool>
	 */
	private static function get_site_overrides(): array {
		$raw = get_option( 'bazaar_site_overrides', '{}' );
		$dec = json_decode( (string) $raw, true );
		return is_array( $dec ) ? $dec : array();
	}
}
