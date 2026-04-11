<?php
/**
 * Bazaar Shell template — full-bleed single-page app container.
 *
 * The JS bootstrapped by BazaarShell::enqueue_assets() takes over from here:
 * it renders the nav rail and manages all ware iframes.
 *
 * @package Bazaar
 */

defined( 'ABSPATH' ) || exit;
?>
<style>
/* Remove wp-admin chrome padding so the shell can be full-bleed. */
#wpcontent         { padding-left: 0 !important; }
#wpbody-content    { padding: 0 !important; overflow: hidden; }
#bazaar-shell-root { margin: 0 !important; }

/*
 * Hide the WP admin sidebar — Bazaar owns its own nav rail.
 * The WP admin bar stays as the "return to WordPress" anchor.
 */
body.bazaar-shell-active #adminmenuwrap,
body.bazaar-shell-active #adminmenuback { display: none !important; }
body.bazaar-shell-active #wpcontent     { margin-left: 0 !important; }
</style>

<div id="bazaar-shell-root" class="bsh" aria-label="<?php esc_attr_e( 'Bazaar', 'bazaar' ); ?>">

	<nav class="bsh-nav" id="bsh-nav" aria-label="<?php esc_attr_e( 'Wares', 'bazaar' ); ?>">

		<div class="bsh-nav__header">
			<span class="dashicons dashicons-store bsh-nav__logo" aria-hidden="true" title="<?php esc_attr_e( 'Bazaar', 'bazaar' ); ?>"></span>
			<button
				class="bsh-nav__collapse"
				id="bsh-collapse"
				type="button"
				aria-label="<?php esc_attr_e( 'Collapse navigation', 'bazaar' ); ?>"
				aria-expanded="true"
				aria-controls="bsh-nav"
			>
				<span class="dashicons dashicons-arrow-left-alt2" aria-hidden="true"></span>
			</button>
		</div>

		<ul class="bsh-nav__list" id="bsh-nav-list" role="list">
			<!-- Populated by shell.js -->
		</ul>

	</nav>

	<div class="bsh-content">

		<div class="bsh-toolbar" id="bsh-toolbar" role="toolbar" aria-label="<?php esc_attr_e( 'View controls', 'bazaar' ); ?>">
			<!-- Buttons injected by shell.js -->
		</div>

		<main class="bsh-main" id="bsh-main" aria-live="polite">
			<!-- Iframes injected here by shell.js -->
			<div class="bsh-loading" id="bsh-loading" aria-hidden="true">
				<div class="bsh-loading__spinner" aria-hidden="true"></div>
				<p class="bsh-loading__label"><?php esc_html_e( 'Loading…', 'bazaar' ); ?></p>
			</div>
		</main>

	</div><!-- .bsh-content -->

</div>
