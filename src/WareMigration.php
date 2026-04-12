<?php
/**
 * One-time data migrations for Bazaar.
 *
 * Each migration is keyed by a unique option flag so it only runs once.
 * New migrations should be appended as additional static methods and called
 * from run().
 *
 * @package Bazaar
 */

namespace Bazaar;

defined( 'ABSPATH' ) || exit;

/**
 * Handles one-time data migrations.
 */
final class WareMigration {

	/**
	 * Run all pending migrations.
	 * Called early in Plugin::boot() on every request — each migration
	 * self-guards with get_option() so the work only happens once.
	 */
	public static function run(): void {
		self::v110_rename_slugs();
	}

	// =========================================================================
	// v1.1.0 — rename ware slugs to brand names
	// =========================================================================

	/**
	 * Rename all six ware slugs from their old descriptive names to the brand
	 * names introduced in v1.1.0.  Updates both the on-disk ware directory and
	 * the WordPress options that store the ware registry.
	 */
	private static function v110_rename_slugs(): void {
		if ( get_option( 'bazaar_migration_v110_slugs' ) ) {
			return;
		}

		// add_option() is atomic — it succeeds only once across concurrent
		// requests, acting as a compare-and-swap lock.  A second request that
		// arrives while the first is still running will find the option already
		// set and bail out, preventing double-renames or partial state.
		if ( ! add_option( 'bazaar_migration_v110_lock', '1', '', false ) ) {
			return;
		}

		$map = array(
			'color-palette'     => 'swatch',
			'focus'             => 'flow',
			'invoice-generator' => 'ledger',
			'kanban'            => 'board',
			'pixel-art'         => 'mosaic',
			'retro-synth'       => 'sine',
		);

		try {
			// ── 1. Rename on-disk ware directories ───────────────────────────
			foreach ( $map as $old => $new ) {
				$old_dir = BAZAAR_WARES_DIR . $old;
				$new_dir = BAZAAR_WARES_DIR . $new;

				if ( is_dir( $old_dir ) && ! is_dir( $new_dir ) ) {
					// phpcs:ignore WordPress.WP.AlternativeFunctions.rename_rename
					rename( $old_dir, $new_dir );
				}
			}

			// ── 2. Migrate per-ware options ───────────────────────────────────
			foreach ( $map as $old => $new ) {
				$raw = get_option( 'bazaar_ware_' . $old );
				if ( false === $raw ) {
					continue;
				}

				$ware = json_decode( (string) $raw, true );
				if ( ! is_array( $ware ) ) {
					continue;
				}

				// Update the slug field stored inside the option value.
				$ware['slug'] = $new;

				update_option( 'bazaar_ware_' . $new, wp_json_encode( $ware ), false );
				delete_option( 'bazaar_ware_' . $old );
			}

			// ── 3. Re-key the index ───────────────────────────────────────────
			$raw_index = get_option( 'bazaar_index' );
			if ( false !== $raw_index ) {
				$index = json_decode( (string) $raw_index, true );
				if ( is_array( $index ) ) {
					$new_index = array();
					foreach ( $index as $slug => $entry ) {
						$renamed = $map[ $slug ] ?? $slug;
						if ( is_array( $entry ) ) {
							$entry['slug'] = $renamed;
						}
						$new_index[ $renamed ] = $entry;
					}
					update_option( 'bazaar_index', wp_json_encode( $new_index ), false );
				}
			}

			// ── 4. Mark migration complete ────────────────────────────────────
			add_option( 'bazaar_migration_v110_slugs', '1', '', false );
		} finally {
			// Always release the lock so a future request can retry if
			// the migration was interrupted partway through.
			delete_option( 'bazaar_migration_v110_lock' );
		}
	}
}
