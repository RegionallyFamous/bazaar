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
/* Remove wp-admin chrome padding so the shell can be full-bleed.
	Sidebar suppression is handled in <head> via wp_add_inline_style(). */
#wpcontent         { padding-left: 0 !important; }
#wpbody-content    { padding: 0 !important; overflow: hidden; }
#bazaar-shell-root { margin: 0 !important; }
#wpfooter          { display: none !important; }
</style>

<div id="bazaar-shell-root" class="bsh" aria-label="<?php esc_attr_e( 'Bazaar', 'bazaar' ); ?>">

	<nav class="bsh-nav" id="bsh-nav" aria-label="<?php esc_attr_e( 'Wares', 'bazaar' ); ?>">

		<div class="bsh-nav__header">
			<svg class="bsh-nav__logo" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
				<path d="M2.5 8.5 L5 3.5 H15 L17.5 8.5 H2.5Z" fill="currentColor" opacity="0.55"/>
				<rect x="2.5" y="8.5" width="15" height="8" rx="1.5" fill="currentColor" opacity="0.9"/>
				<rect x="7.5" y="12" width="5" height="4.5" rx="1" fill="none" stroke="var(--bsh-nav-bg)" stroke-width="1.2"/>
			</svg>
			<span class="bsh-nav__title"><?php esc_html_e( 'Wares', 'bazaar' ); ?></span>
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

		<div class="bsh-nav__footer" id="bsh-nav-footer">
			<!-- Manage Wares injected by shell.js -->
		</div>

		<a
			class="bsh-nav__wp-link"
			href="<?php echo esc_url( get_admin_url() ); ?>"
			title="<?php esc_attr_e( 'Back to WordPress', 'bazaar' ); ?>"
			aria-label="<?php esc_attr_e( 'Back to WordPress admin', 'bazaar' ); ?>"
		>
			<span class="dashicons dashicons-wordpress-alt bsh-nav__wp-icon" aria-hidden="true"></span>
			<span class="bsh-nav__wp-label"><?php esc_html_e( 'WordPress', 'bazaar' ); ?></span>
		</a>

		<div class="bsh-nav__resize-handle" id="bsh-resize-handle" aria-hidden="true"></div>

	</nav>

	<div class="bsh-content">

		<div class="bsh-toolbar" id="bsh-toolbar" role="toolbar" aria-label="<?php esc_attr_e( 'View controls', 'bazaar' ); ?>">
			<div class="bsh-toolbar__context" id="bsh-toolbar-context" aria-live="polite">
				<!-- Active ware breadcrumb injected by shell.js -->
			</div>
			<!-- Action buttons injected by shell.js -->
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
