<?php
/**
 * Ware container template — outputs the full-bleed iframe for a ware page.
 *
 * Available variables (set by WareRenderer::render()):
 *   string $ware_url  Authenticated REST URL to the ware's entry file.
 *   string $name      Human-readable ware name.
 */

defined( 'ABSPATH' ) || exit;
?>
<style>
	/* Remove wp-admin's default padding so the iframe can fill the entire content area. */
	#wpbody-content {
		padding-bottom: 0 !important;
	}
	#bazaar-ware-frame {
		display: block;
		width: 100%;
		/* Subtract the WP admin bar (32px) from the viewport height. */
		height: calc(100vh - 32px);
		border: none;
		background: #fff;
	}
</style>
<iframe
	id="bazaar-ware-frame"
	title="<?php echo esc_attr( $name ); ?>"
	src="<?php echo esc_url( $ware_url ); ?>"
	sandbox="allow-scripts allow-forms allow-same-origin allow-popups allow-downloads"
	referrerpolicy="same-origin"
></iframe>
