<?php
/**
 * Ware renderer — outputs the iframe container for a ware page.
 *
 * @package Bazaar
 */

declare( strict_types=1 );

namespace Bazaar;

defined( 'ABSPATH' ) || exit;

/**
 * Renders the full-bleed iframe container for an installed ware.
 *
 * In normal mode the iframe points at the authenticated REST file server.
 * In dev mode (WP_DEBUG = true + a dev_url registered via WP-CLI) the iframe
 * points directly at the local Vite dev server so hot-module replacement works
 * without packaging.
 *
 * @bazaar/client reads _wpnonce and _adminColor from the query string, so both
 * are injected into the REST URL (non-dev mode only — the dev URL is used as-is
 * so that the Vite dev server doesn't get confused by extra params).
 */
final class WareRenderer {

	/**
	 * Sanitized slug of the ware to render.
	 *
	 * @var string
	 */
	private string $slug;

	/**
	 * Registry used to look up ware metadata.
	 *
	 * @var WareRegistry
	 */
	private WareRegistry $registry;

	/**
	 * Constructor.
	 *
	 * @param string       $slug     Ware slug (will be sanitized).
	 * @param WareRegistry $registry Registry instance for ware lookups.
	 */
	public function __construct( string $slug, WareRegistry $registry ) {
		$this->slug     = sanitize_key( $slug );
		$this->registry = $registry;
	}

	/**
	 * Output the iframe wrapper page. Called by MenuManager as the menu page callback.
	 */
	public function render(): void {
		$ware = $this->registry->get( $this->slug );

		if ( null === $ware ) {
			echo '<div class="wrap"><p>' . esc_html__( 'Ware not found.', 'bazaar' ) . '</p></div>';
			return;
		}

		$dev_url = ! empty( $ware['dev_url'] ) ? (string) $ware['dev_url'] : '';
		$is_dev  = '' !== $dev_url && defined( 'WP_DEBUG' ) && WP_DEBUG;

		// Defence-in-depth: even in debug mode, only allow loopback origins as
		// the iframe src so that a crafted registry entry cannot point the admin
		// UI at an arbitrary remote site.
		if ( $is_dev ) {
			$dev_host = (string) wp_parse_url( $dev_url, PHP_URL_HOST );
			if ( ! in_array( $dev_host, array( 'localhost', '127.0.0.1', '::1' ), true ) ) {
				$is_dev = false;
			}
		}

		if ( $is_dev ) {
			// Dev mode: iframe points directly at the local dev server.
			// No nonce or file-server URL — HMR and the Vite WS socket work as normal.
			$ware_url = $dev_url;
		} else {
			// Production mode: serve files through the authenticated REST endpoint.
			$entry       = $ware['entry'] ?? 'index.html';
			$admin_color = get_user_option( 'admin_color' );
			$ware_url    = rest_url( 'bazaar/v1/serve/' . rawurlencode( $this->slug ) . '/' . rawurlencode( $entry ) );
			$ware_url    = add_query_arg(
				array(
					'_wpnonce'    => wp_create_nonce( 'wp_rest' ),
					// Inject the admin color scheme so @bazaar/client can read it.
					'_adminColor' => sanitize_key( $admin_color ? (string) $admin_color : 'fresh' ),
				),
				$ware_url
			);
		}

		$name = $ware['name'] ?? $this->slug;

		require BAZAAR_DIR . 'templates/ware-container.php';
	}
}
