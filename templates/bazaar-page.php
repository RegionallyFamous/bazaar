<?php
/**
 * Bazaar admin page template — ware gallery and upload UI.
 *
 * Available variables (set by BazaarPage::render_page()):
 *   array<string, array<string, mixed>> $wares     All installed wares from the registry.
 *   string                              $rest_url  Base REST URL for bazaar/v1.
 *
 * @package Bazaar
 */

defined( 'ABSPATH' ) || exit;
?>
<div class="wrap bazaar-page<?php echo empty( $wares ) ? ' bazaar-page--empty' : ''; ?>" id="bazaar-app">

	<header class="bazaar-header">
		<h1 class="bazaar-title">
			<span class="dashicons dashicons-store" aria-hidden="true"></span>
			<?php esc_html_e( 'Bazaar', 'bazaar' ); ?>
		</h1>
		<p class="bazaar-tagline"><?php esc_html_e( 'Your WordPress app marketplace. Install a ware and it appears instantly in your sidebar.', 'bazaar' ); ?></p>
	</header>

	<!-- Upload zone -->
	<section class="bazaar-upload-section" aria-labelledby="bazaar-upload-heading">
		<h2 id="bazaar-upload-heading" class="screen-reader-text"><?php esc_html_e( 'Upload a Ware', 'bazaar' ); ?></h2>

		<div
			class="bazaar-dropzone"
			id="bazaar-dropzone"
			role="button"
			tabindex="0"
			aria-label="<?php esc_attr_e( 'Drop a .wp file here or click to browse', 'bazaar' ); ?>"
		>
			<span class="bazaar-dropzone__icon-wrap" aria-hidden="true">
				<span class="dashicons dashicons-upload bazaar-dropzone__icon"></span>
			</span>
			<p class="bazaar-dropzone__text">
				<?php esc_html_e( 'Drop a .wp file here, or', 'bazaar' ); ?>
				<label for="bazaar-file-input" class="bazaar-dropzone__browse">
					<?php esc_html_e( 'browse to upload', 'bazaar' ); ?>
				</label>
			</p>
			<p class="bazaar-dropzone__hint">
				<?php esc_html_e( '.wp files only', 'bazaar' ); ?>
			</p>
			<input
				type="file"
				id="bazaar-file-input"
				accept=".wp"
				class="bazaar-dropzone__input"
				aria-hidden="true"
				tabindex="-1"
			>
		</div>

		<div class="bazaar-upload-progress" id="bazaar-upload-progress" hidden aria-live="polite">
			<div class="bazaar-upload-progress__bar-wrap">
				<div class="bazaar-upload-progress__bar" id="bazaar-upload-bar"></div>
			</div>
			<p class="bazaar-upload-progress__label" id="bazaar-upload-label">
				<?php esc_html_e( 'Uploading…', 'bazaar' ); ?>
			</p>
		</div>

		<div class="bazaar-notice bazaar-notice--error" id="bazaar-upload-error" hidden role="alert" aria-live="assertive"></div>
		<div class="bazaar-notice bazaar-notice--success" id="bazaar-upload-success" hidden role="status" aria-live="polite"></div>
	</section>

	<!-- Core Apps discovery -->
	<section class="bazaar-core-section" id="bazaar-core-section" aria-labelledby="bazaar-core-heading">
		<div class="bazaar-core-header">
			<h2 id="bazaar-core-heading" class="bazaar-section-heading">
				<?php esc_html_e( 'App Directory', 'bazaar' ); ?>
			</h2>
			<span class="bazaar-core-count-badge" id="bazaar-core-count" aria-live="polite"></span>
		</div>
		<p class="bazaar-core-description">
			<?php esc_html_e( 'First-party apps built for Bazaar — install any in one click.', 'bazaar' ); ?>
		</p>

		<div class="bazaar-core-grid bazaar-core-grid--loading" id="bazaar-core-grid" role="list">
			<div class="bazaar-core-skeleton" aria-hidden="true">
				<div class="bazaar-core-skeleton__top">
					<div class="bazaar-core-skeleton__icon"></div>
					<div class="bazaar-core-skeleton__lines">
						<div class="bazaar-core-skeleton__line bazaar-core-skeleton__line--title"></div>
						<div class="bazaar-core-skeleton__line bazaar-core-skeleton__line--byline"></div>
					</div>
				</div>
				<div class="bazaar-core-skeleton__desc-lines">
					<div class="bazaar-core-skeleton__line bazaar-core-skeleton__line--d1"></div>
					<div class="bazaar-core-skeleton__line bazaar-core-skeleton__line--d2"></div>
					<div class="bazaar-core-skeleton__line bazaar-core-skeleton__line--d3"></div>
				</div>
				<div class="bazaar-core-skeleton__btn"></div>
			</div>
			<div class="bazaar-core-skeleton" aria-hidden="true">
				<div class="bazaar-core-skeleton__top">
					<div class="bazaar-core-skeleton__icon"></div>
					<div class="bazaar-core-skeleton__lines">
						<div class="bazaar-core-skeleton__line bazaar-core-skeleton__line--title"></div>
						<div class="bazaar-core-skeleton__line bazaar-core-skeleton__line--byline"></div>
					</div>
				</div>
				<div class="bazaar-core-skeleton__desc-lines">
					<div class="bazaar-core-skeleton__line bazaar-core-skeleton__line--d1"></div>
					<div class="bazaar-core-skeleton__line bazaar-core-skeleton__line--d2"></div>
					<div class="bazaar-core-skeleton__line bazaar-core-skeleton__line--d3"></div>
				</div>
				<div class="bazaar-core-skeleton__btn"></div>
			</div>
			<div class="bazaar-core-skeleton" aria-hidden="true">
				<div class="bazaar-core-skeleton__top">
					<div class="bazaar-core-skeleton__icon"></div>
					<div class="bazaar-core-skeleton__lines">
						<div class="bazaar-core-skeleton__line bazaar-core-skeleton__line--title"></div>
						<div class="bazaar-core-skeleton__line bazaar-core-skeleton__line--byline"></div>
					</div>
				</div>
				<div class="bazaar-core-skeleton__desc-lines">
					<div class="bazaar-core-skeleton__line bazaar-core-skeleton__line--d1"></div>
					<div class="bazaar-core-skeleton__line bazaar-core-skeleton__line--d2"></div>
					<div class="bazaar-core-skeleton__line bazaar-core-skeleton__line--d3"></div>
				</div>
				<div class="bazaar-core-skeleton__btn"></div>
			</div>
		</div>
	</section>

	<!-- Installed wares gallery -->
	<section class="bazaar-gallery-section" aria-labelledby="bazaar-gallery-heading">

		<div class="bazaar-gallery-header">
			<h2 id="bazaar-gallery-heading" class="bazaar-section-heading">
				<?php esc_html_e( 'Installed Wares', 'bazaar' ); ?>
				<span
					class="bazaar-ware-count"
					id="bazaar-ware-count"
					role="status"
					aria-live="polite"
					data-count="<?php echo esc_attr( (string) count( $wares ) ); ?>"
				>(<?php echo esc_html( (string) count( $wares ) ); ?>)</span>
			</h2>

			<!-- Filter bar — always rendered; hidden until the first ware is installed -->
			<div class="bazaar-filters" id="bazaar-filters"<?php echo empty( $wares ) ? ' hidden' : ''; ?>>
				<div
					class="bazaar-filter-tabs"
					id="bazaar-filter-tabs"
					role="tablist"
					aria-label="<?php esc_attr_e( 'Filter by status', 'bazaar' ); ?>"
				>
					<button type="button" role="tab" class="bazaar-filter-tab bazaar-filter-tab--active" data-filter="all" aria-selected="true"><?php esc_html_e( 'All', 'bazaar' ); ?></button>
					<button type="button" role="tab" class="bazaar-filter-tab" data-filter="enabled" aria-selected="false"><?php esc_html_e( 'Enabled', 'bazaar' ); ?></button>
					<button type="button" role="tab" class="bazaar-filter-tab" data-filter="disabled" aria-selected="false"><?php esc_html_e( 'Disabled', 'bazaar' ); ?></button>
				</div>
				<label for="bazaar-search" class="screen-reader-text"><?php esc_html_e( 'Search wares', 'bazaar' ); ?></label>
				<input
					type="search"
					id="bazaar-search"
					class="bazaar-search"
					placeholder="<?php esc_attr_e( 'Search wares…', 'bazaar' ); ?>"
					aria-controls="bazaar-gallery"
				>
			</div>
		</div>

		<!-- True empty state — no wares installed at all -->
		<div class="bazaar-empty" id="bazaar-empty-state"<?php echo ! empty( $wares ) ? ' hidden' : ''; ?>>
			<span class="dashicons dashicons-admin-plugins bazaar-empty__icon" aria-hidden="true"></span>
			<p><?php esc_html_e( 'No wares installed yet. Upload your first .wp file above.', 'bazaar' ); ?></p>
		</div>

		<!-- No-results state — wares exist but search/filter returns nothing -->
		<div class="bazaar-no-results" id="bazaar-no-results" hidden>
			<span class="dashicons dashicons-search bazaar-empty__icon" aria-hidden="true"></span>
			<p><?php esc_html_e( 'No wares match your search.', 'bazaar' ); ?></p>
		</div>

		<div
			class="bazaar-gallery"
			id="bazaar-gallery"
			role="list"
			aria-label="<?php esc_attr_e( 'Installed wares', 'bazaar' ); ?>"
		>
			<?php
			$perm_labels = array(
				'read:posts'        => __( 'Read posts', 'bazaar' ),
				'write:posts'       => __( 'Write posts', 'bazaar' ),
				'delete:posts'      => __( 'Delete posts', 'bazaar' ),
				'read:users'        => __( 'Read users', 'bazaar' ),
				'write:users'       => __( 'Write users', 'bazaar' ),
				'read:options'      => __( 'Read options', 'bazaar' ),
				'write:options'     => __( 'Write options', 'bazaar' ),
				'read:media'        => __( 'Read media', 'bazaar' ),
				'write:media'       => __( 'Write media', 'bazaar' ),
				'read:comments'     => __( 'Read comments', 'bazaar' ),
				'write:comments'    => __( 'Write comments', 'bazaar' ),
				'moderate:comments' => __( 'Moderate comments', 'bazaar' ),
				'manage:plugins'    => __( 'Manage plugins', 'bazaar' ),
				'manage:themes'     => __( 'Manage themes', 'bazaar' ),
				'read:analytics'    => __( 'Read analytics', 'bazaar' ),
			);
			?>
			<?php foreach ( $wares as $slug => $ware ) : ?>
				<?php
				$enabled        = ! empty( $ware['enabled'] );
				$card_class     = 'bazaar-card' . ( $enabled ? '' : ' bazaar-card--disabled' );
				$icon_url       = esc_url(
					rest_url(
						'bazaar/v1/serve/' . rawurlencode( $slug ) . '/' . rawurlencode( $ware['icon'] ?? 'icon.svg' )
					)
				);
				$toggle_label   = $enabled
					? __( 'Disable ware', 'bazaar' )
					: __( 'Enable ware', 'bazaar' );
				$delete_confirm = sprintf(
					/* translators: %s: ware name */
					__( 'Delete "%s"? This cannot be undone.', 'bazaar' ),
					$ware['name']
				);
				$delete_label = sprintf(
					/* translators: %s: ware name */
					__( 'Delete %s', 'bazaar' ),
					$ware['name']
				);
				$permissions = array_filter( (array) ( $ware['permissions'] ?? array() ) );
				?>
				<article
					class="<?php echo esc_attr( $card_class ); ?>"
					id="bazaar-card-<?php echo esc_attr( $slug ); ?>"
					data-slug="<?php echo esc_attr( $slug ); ?>"
					data-name="<?php echo esc_attr( $ware['name'] ); ?>"
					data-status="<?php echo $enabled ? 'enabled' : 'disabled'; ?>"
					role="listitem"
				>
					<div class="bazaar-card__content">
						<div class="bazaar-card__icon-wrap">
							<img
								src="<?php echo $icon_url; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- already esc_url'd ?>"
								alt=""
								class="bazaar-card__icon"
								width="48"
								height="48"
								onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 20 20%22><rect width=%2220%22 height=%2220%22 rx=%222%22 fill=%22%23ddd%22/></svg>'"
							>
						</div>
						<div class="bazaar-card__body">
							<h3 class="bazaar-card__name"><?php echo esc_html( $ware['name'] ); ?></h3>
							<p class="bazaar-card__meta">
								<span class="bazaar-card__version">v<?php echo esc_html( $ware['version'] ); ?></span>
								<?php if ( ! empty( $ware['author'] ) ) : ?>
									<span class="bazaar-card__author">
										<?php
										printf(
											/* translators: %s: author name */
											esc_html__( 'by %s', 'bazaar' ),
											esc_html( $ware['author'] )
										);
										?>
									</span>
								<?php endif; ?>
							</p>
						<?php if ( ! empty( $ware['description'] ) ) : ?>
							<p class="bazaar-card__description"><?php echo esc_html( $ware['description'] ); ?></p>
						<?php endif; ?>
						<?php if ( ! empty( $permissions ) ) : ?>
							<details class="bazaar-card__perms">
								<summary class="bazaar-card__perms-summary">
									<?php
									printf(
										/* translators: %d: number of permissions requested */
										esc_html( _n( '%d permission', '%d permissions', count( $permissions ), 'bazaar' ) ),
										count( $permissions )
									);
									?>
								</summary>
								<ul class="bazaar-card__perms-list">
									<?php foreach ( $permissions as $perm ) : ?>
										<li class="bazaar-card__perm-item">
											<span class="bazaar-card__perm-icon dashicons dashicons-yes-alt" aria-hidden="true"></span>
											<?php echo esc_html( $perm_labels[ $perm ] ?? $perm ); ?>
										</li>
									<?php endforeach; ?>
								</ul>
							</details>
						<?php endif; ?>
					</div>
						<div class="bazaar-card__actions">
							<label class="bazaar-toggle" title="<?php echo esc_attr( $toggle_label ); ?>">
								<input
									type="checkbox"
									class="bazaar-toggle__input"
									data-slug="<?php echo esc_attr( $slug ); ?>"
									data-action="toggle"
									<?php checked( $enabled ); ?>
									aria-label="<?php echo esc_attr( $toggle_label ); ?>"
								>
								<span class="bazaar-toggle__slider" aria-hidden="true"></span>
							</label>
							<button
								type="button"
								class="button bazaar-card__delete"
								data-slug="<?php echo esc_attr( $slug ); ?>"
								data-action="delete"
								data-confirm="<?php echo esc_attr( $delete_confirm ); ?>"
								aria-label="<?php echo esc_attr( $delete_label ); ?>"
							>
								<span class="dashicons dashicons-trash" aria-hidden="true"></span>
							</button>
						</div>
					</div>
				</article>
			<?php endforeach; ?>
		</div>
	</section>

</div><!-- /.bazaar-page -->
