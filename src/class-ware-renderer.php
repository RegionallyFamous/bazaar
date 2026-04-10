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
 * Each ware page is essentially a full-screen iframe pointing at the WareServer
 * REST endpoint. The iframe sandbox isolates the ware's CSS/JS completely from
 * wp-admin, so wares render exactly as they would standalone.
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

		$entry    = $ware['entry'] ?? 'index.html';
		$ware_url = rest_url( 'bazaar/v1/serve/' . rawurlencode( $this->slug ) . '/' . rawurlencode( $entry ) );
		$ware_url = add_query_arg( '_wpnonce', wp_create_nonce( 'wp_rest' ), $ware_url );

		$name = $ware['name'];

		require BAZAAR_DIR . 'templates/ware-container.php';
	}
}
