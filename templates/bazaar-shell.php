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
			<!-- Home + Manage Wares injected by shell.js -->
		</div>

		<a
			class="bsh-nav__wp-link"
			href="<?php echo esc_url( get_admin_url() ); ?>"
			title="<?php esc_attr_e( 'Exit Bazaar', 'bazaar' ); ?>"
			aria-label="<?php esc_attr_e( 'Exit Bazaar', 'bazaar' ); ?>"
		>
			<span class="dashicons dashicons-exit bsh-nav__wp-icon" aria-hidden="true"></span>
			<span class="bsh-nav__wp-label"><?php esc_html_e( 'Exit Bazaar', 'bazaar' ); ?></span>
		</a>

		<div class="bsh-nav__resize-handle" id="bsh-resize-handle" aria-hidden="true"></div>

	</nav>

	<div class="bsh-content">

		<div class="bsh-toolbar" id="bsh-toolbar" role="toolbar" aria-label="<?php esc_attr_e( 'View controls', 'bazaar' ); ?>">
			<div class="bsh-toolbar__context" id="bsh-toolbar-context" aria-live="polite">
				<!-- Active ware breadcrumb injected by shell.js -->
			</div>
			<!-- Context-sensitive controls (reload, info) — updated on each navigation -->
			<div class="bsh-toolbar__ctx-btns" id="bsh-toolbar-ctx-btns" aria-live="polite"></div>
			<!-- Static action buttons injected by shell.js -->
		</div>

		<main class="bsh-main" id="bsh-main" aria-live="polite">
			<!-- Home screen panel (shown when slug === "home") -->
			<div class="bsh-home" id="bsh-home-screen" hidden aria-label="<?php esc_attr_e( 'Home', 'bazaar' ); ?>">
				<!-- Rendered by home.js -->
			</div>

		<!-- Skeleton loader (replaces spinner while iframe content loads) -->
		<div class="bsh-loading" id="bsh-loading" aria-hidden="true">
			<div class="bsh-skeleton">
				<div class="bsh-skeleton--card">
					<div class="bsh-skeleton__circle"></div>
					<div class="bsh-skeleton__lines">
						<div class="bsh-skeleton__bar bsh-skeleton__bar--header"></div>
						<div class="bsh-skeleton__bar bsh-skeleton__bar--wide"></div>
						<div class="bsh-skeleton__bar bsh-skeleton__bar--short"></div>
					</div>
				</div>
				<div class="bsh-skeleton--card">
					<div class="bsh-skeleton__circle"></div>
					<div class="bsh-skeleton__lines">
						<div class="bsh-skeleton__bar bsh-skeleton__bar--header"></div>
						<div class="bsh-skeleton__bar"></div>
						<div class="bsh-skeleton__bar bsh-skeleton__bar--wide"></div>
					</div>
				</div>
				<div class="bsh-skeleton--card">
					<div class="bsh-skeleton__circle"></div>
					<div class="bsh-skeleton__lines">
						<div class="bsh-skeleton__bar bsh-skeleton__bar--header"></div>
						<div class="bsh-skeleton__bar bsh-skeleton__bar--short"></div>
						<div class="bsh-skeleton__bar bsh-skeleton__bar--wide"></div>
					</div>
				</div>
			</div>
		</div>
		</main>

		<!-- Running-app taskbar: shows LRU-resident wares -->
		<div class="bsh-taskbar" id="bsh-taskbar" role="toolbar" aria-label="<?php esc_attr_e( 'Running wares', 'bazaar' ); ?>" hidden>
			<!-- Populated by shell.js -->
		</div>

		<!-- Status bar: ware name, trust level, clock -->
		<div class="bsh-statusbar" id="bsh-statusbar" aria-hidden="true">
			<div class="bsh-statusbar__left" id="bsh-statusbar-left"></div>
			<div class="bsh-statusbar__center" id="bsh-statusbar-center"></div>
			<div class="bsh-statusbar__right">
				<span class="bsh-statusbar__clock" id="bsh-statusbar-clock" aria-hidden="true"></span>
			</div>
		</div>

	</div><!-- .bsh-content -->

</div>
