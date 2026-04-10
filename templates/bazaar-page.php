<?php
/**
 * Bazaar admin page template — ware gallery and upload UI.
 *
 * Available variables (set by BazaarPage::render_page()):
 *   array<string, array<string, mixed>> $wares     All installed wares from the registry.
 *   string                              $rest_url  Base REST URL for bazaar/v1.
 */

defined( 'ABSPATH' ) || exit;
?>
<div class="wrap bazaar-page" id="bazaar-app">

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
			<span class="dashicons dashicons-upload bazaar-dropzone__icon" aria-hidden="true"></span>
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
			<div class="bazaar-upload-progress__bar" id="bazaar-upload-bar"></div>
			<p class="bazaar-upload-progress__label" id="bazaar-upload-label">
				<?php esc_html_e( 'Uploading…', 'bazaar' ); ?>
			</p>
		</div>

		<div class="bazaar-notice bazaar-notice--error" id="bazaar-upload-error" hidden role="alert" aria-live="assertive"></div>
		<div class="bazaar-notice bazaar-notice--success" id="bazaar-upload-success" hidden role="status" aria-live="polite"></div>
	</section>

	<!-- Installed wares gallery -->
	<section class="bazaar-gallery-section" aria-labelledby="bazaar-gallery-heading">
		<h2 id="bazaar-gallery-heading" class="bazaar-section-heading">
			<?php esc_html_e( 'Installed Wares', 'bazaar' ); ?>
			<span class="bazaar-ware-count" id="bazaar-ware-count">
				(<?php echo esc_html( (string) count( $wares ) ); ?>)
			</span>
		</h2>

		<?php if ( empty( $wares ) ) : ?>
			<div class="bazaar-empty" id="bazaar-empty-state">
				<span class="dashicons dashicons-admin-plugins bazaar-empty__icon" aria-hidden="true"></span>
				<p><?php esc_html_e( 'No wares installed yet. Upload your first .wp file above.', 'bazaar' ); ?></p>
			</div>
		<?php endif; ?>

		<div
			class="bazaar-gallery"
			id="bazaar-gallery"
			role="list"
			aria-label="<?php esc_attr_e( 'Installed wares', 'bazaar' ); ?>"
		>
			<?php foreach ( $wares as $slug => $ware ) : ?>
				<?php
				$enabled    = ! empty( $ware['enabled'] );
				$icon_url   = esc_url(
					rest_url(
						'bazaar/v1/serve/' . rawurlencode( $slug ) . '/' . rawurlencode( $ware['icon'] ?? 'icon.svg' )
					)
				);
				$card_class = 'bazaar-card' . ( $enabled ? '' : ' bazaar-card--disabled' );
				?>
				<article
					class="<?php echo esc_attr( $card_class ); ?>"
					id="bazaar-card-<?php echo esc_attr( $slug ); ?>"
					data-slug="<?php echo esc_attr( $slug ); ?>"
					role="listitem"
				>
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
					</div>
					<div class="bazaar-card__actions">
						<label class="bazaar-toggle" title="<?php echo $enabled ? esc_attr__( 'Disable ware', 'bazaar' ) : esc_attr__( 'Enable ware', 'bazaar' ); ?>">
							<input
								type="checkbox"
								class="bazaar-toggle__input"
								data-slug="<?php echo esc_attr( $slug ); ?>"
								data-action="toggle"
								<?php checked( $enabled ); ?>
								aria-label="<?php echo $enabled ? esc_attr__( 'Disable ware', 'bazaar' ) : esc_attr__( 'Enable ware', 'bazaar' ); ?>"
							>
							<span class="bazaar-toggle__slider" aria-hidden="true"></span>
						</label>
						<button
							type="button"
							class="button bazaar-card__delete"
							data-slug="<?php echo esc_attr( $slug ); ?>"
							data-action="delete"
							data-confirm="<?php
								printf(
									/* translators: %s: ware name */
									esc_attr__( 'Delete "%s"? This cannot be undone.', 'bazaar' ),
									esc_attr( $ware['name'] )
								);
							?>"
							aria-label="<?php
								printf(
									/* translators: %s: ware name */
									esc_attr__( 'Delete %s', 'bazaar' ),
									esc_attr( $ware['name'] )
								);
							?>"
						>
							<span class="dashicons dashicons-trash" aria-hidden="true"></span>
						</button>
					</div>
				</article>
			<?php endforeach; ?>
		</div>
	</section>

</div><!-- /.bazaar-page -->
