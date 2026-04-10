<?php
/**
 * Ware container template — outputs the full-bleed iframe for a ware page.
 *
 * Available variables (set by WareRenderer::render()):
 *   string $ware_url  URL for the iframe src (REST file-server or dev server).
 *   string $name      Human-readable ware name.
 *   bool   $is_dev    True when the ware is pointing at a local dev server.
 *
 * @package Bazaar
 */

defined( 'ABSPATH' ) || exit;
?>
<style>
	/* Remove wp-admin's default padding so the iframe fills the content area. */
	#wpbody-content {
		padding-bottom: 0 !important;
	}
	#bazaar-ware-frame {
		display: block;
		width: 100%;
		/* Subtract the WP admin bar (32px) and any top chrome from viewport height. */
		height: calc(100vh - 32px);
		border: none;
		background: #fff;
	}
	<?php if ( $is_dev ) : ?>
	/* Dev-mode badge — visible only in WP_DEBUG mode. */
	#bazaar-dev-badge {
		position: fixed;
		bottom: 16px;
		right: 16px;
		z-index: 99999;
		display: flex;
		align-items: center;
		gap: 6px;
		background: #1d2327;
		color: #fff;
		font-size: 11px;
		font-family: ui-monospace, "SFMono-Regular", Consolas, monospace;
		padding: 5px 10px;
		border-radius: 4px;
		pointer-events: none;
		box-shadow: 0 2px 8px rgba(0, 0, 0, .35);
	}
	#bazaar-dev-badge::before {
		content: "";
		display: inline-block;
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: #46b450;
		animation: bazaar-pulse 2s ease-in-out infinite;
	}
	@keyframes bazaar-pulse {
		0%, 100% { opacity: 1; }
		50%       { opacity: .3; }
	}
	<?php endif; ?>
</style>

<?php if ( $is_dev ) : ?>
<div id="bazaar-dev-badge"><?php echo esc_html( $name ); ?> &mdash; dev mode</div>
<?php endif; ?>

<iframe
	id="bazaar-ware-frame"
	title="<?php echo esc_attr( $name ); ?>"
	src="<?php echo esc_url( $ware_url ); ?>"
	sandbox="allow-scripts allow-forms allow-same-origin allow-popups allow-downloads"
	referrerpolicy="same-origin"
></iframe>
