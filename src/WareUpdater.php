<?php
/**
 * Ware auto-updater — checks the remote registry for updates and installs them.
 *
 * The updater runs on a WP cron schedule. It also supports on-demand updates
 * via the `wp bazaar update` CLI command.
 *
 * Cron hook: bazaar_check_updates  (daily)
 *
 * @package Bazaar
 */

declare( strict_types=1 );

namespace Bazaar;

defined( 'ABSPATH' ) || exit;

use Bazaar\REST\JobsController;
use WP_Error;

/**
 * Manages auto-update lifecycle for installed wares.
 */
final class WareUpdater {

	/** Option key that stores the result of the last update check. */
	private const LAST_CHECK_KEY = 'bazaar_last_update_check';

	/** Option key that stores outdated slugs as JSON. */
	private const OUTDATED_KEY = 'bazaar_outdated_wares';

	/**
	 * WareRegistry instance.
	 *
	 * @var WareRegistry
	 */
	private WareRegistry $registry;

	/**
	 * RemoteRegistry instance.
	 *
	 * @var RemoteRegistry
	 */
	private RemoteRegistry $remote;

	/**
	 * WareLoader instance.
	 *
	 * @var WareLoader
	 */
	private WareLoader $loader;

	/**
	 * Constructor.
	 *
	 * @param WareRegistry   $registry Description.
	 * @param RemoteRegistry $remote Description.
	 * @param WareLoader     $loader Description.
	 */
	public function __construct( WareRegistry $registry, RemoteRegistry $remote, WareLoader $loader ) {
		$this->registry = $registry;
		$this->remote   = $remote;
		$this->loader   = $loader;
	}

	// -------------------------------------------------------------------------
	// Hooks
	// -------------------------------------------------------------------------

	/**
	 * Register cron schedule and hook.
	 */
	public function register_hooks(): void {
		add_action( 'bazaar_check_updates', array( $this, 'cron_run_check' ) );
	}

	/**
	 * Cron handler: check for updates and, when auto-apply is enabled, install them.
	 *
	 * Auto-apply is enabled by setting the `bazaar_auto_update` option to `'1'`
	 * (or via the `bazaar_auto_update` filter). When disabled, this method only
	 * records outdated slugs so the admin badge and CLI `outdated` command work
	 * correctly — updates still require a manual `wp bazaar update` or UI action.
	 */
	public function cron_run_check(): void {
		$outdated = $this->run_check();

		$auto_apply = (bool) apply_filters(
			'bazaar_auto_update',
			get_option( 'bazaar_auto_update', '0' ) === '1'
		);

		if ( ! $auto_apply || empty( $outdated ) ) {
			return;
		}

		foreach ( array_keys( $outdated ) as $slug ) {
			$this->update( $slug );
		}
	}

	/**
	 * Schedule the daily cron job on plugin activation.
	 */
	public static function schedule(): void {
		if ( ! wp_next_scheduled( 'bazaar_check_updates' ) ) {
			wp_schedule_event( time(), 'daily', 'bazaar_check_updates' );
		}
	}

	/**
	 * Unschedule the cron job on plugin deactivation/uninstall.
	 */
	public static function unschedule(): void {
		$timestamp = wp_next_scheduled( 'bazaar_check_updates' );
		if ( $timestamp ) {
			wp_unschedule_event( $timestamp, 'bazaar_check_updates' );
		}
	}

	// -------------------------------------------------------------------------
	// Public API
	// -------------------------------------------------------------------------

	/**
	 * Run an update check: compare all installed wares against the registry.
	 * Stores results in `bazaar_outdated_wares` for the CLI and manage page.
	 *
	 * @return array<string, array{current: string, latest: string}>
	 */
	public function run_check(): array {
		$wares    = $this->registry->get_all();
		$outdated = array();

		foreach ( $wares as $slug => $ware ) {
			$check = $this->remote->check_update( $ware );
			if ( $check['has_update'] ) {
				$outdated[ $slug ] = array(
					'current' => $check['current'],
					'latest'  => $check['latest'],
				);
			}
		}

		update_option( self::LAST_CHECK_KEY, gmdate( 'Y-m-d\TH:i:s\Z' ), false );
		update_option( self::OUTDATED_KEY, wp_json_encode( $outdated ), false );

		return $outdated;
	}

	/**
	 * Return the last-known outdated wares (from cached check).
	 *
	 * @return array<string, array{current: string, latest: string}>
	 */
	public function get_outdated(): array {
		$raw = get_option( self::OUTDATED_KEY, '{}' );
		$dec = json_decode( (string) $raw, true );
		if ( json_last_error() !== JSON_ERROR_NONE || ! is_array( $dec ) ) {
			return array();
		}
		return $dec;
	}

	/**
	 * Update a single ware to the latest registry version.
	 * Deletes the old files, downloads and installs the new ones.
	 *
	 * On install failure the registry entry is restored so the ware remains
	 * visible in the Manage screen and can be re-installed without data loss.
	 *
	 * @param string $slug Ware slug.
	 * @return array<string, mixed>|WP_Error Updated manifest on success.
	 */
	public function update( string $slug ): array|WP_Error {
		$slug  = sanitize_key( $slug );
		$entry = $this->remote->get( $slug );
		if ( is_wp_error( $entry ) ) {
			return $entry;
		}

		// Snapshot the current registry manifest before touching anything.
		$old_manifest = $this->registry->get( $slug );

		// Snapshot the ware files to a backup directory before deletion so we
		// can restore them if the new version fails to install.
		$ware_dir   = BAZAAR_WARES_DIR . $slug;
		$backup_dir = BAZAAR_WARES_DIR . '.backup-' . $slug . '-' . time();
		$has_backup = false;

		if ( is_dir( $ware_dir ) ) {
			if ( ! function_exists( 'WP_Filesystem' ) ) {
				require_once ABSPATH . 'wp-admin/includes/file.php';
			}
			WP_Filesystem();
			global $wp_filesystem;
			if ( ! empty( $wp_filesystem ) && $wp_filesystem->move( $ware_dir, $backup_dir ) ) {
				$has_backup = true;
			} else {
				// Could not move to backup — fall back to delete-only (old behaviour).
				$del = $this->loader->delete( $slug );
				if ( is_wp_error( $del ) ) {
					return $del;
				}
			}
		}

		// Remove from registry so the installer can re-register.
		if ( ! $this->registry->unregister( $slug ) ) {
			// Restore backup files if present so the site remains functional.
			if ( $has_backup && is_dir( $backup_dir ) ) {
				global $wp_filesystem;
				$wp_filesystem?->move( $backup_dir, $ware_dir );
			}
			return new WP_Error(
				'unregister_failed',
				esc_html__( 'Could not unregister ware before update. Please try again.', 'bazaar' )
			);
		}

		// Re-install from registry.
		$manifest = $this->remote->install( $slug, $this->loader, $this->registry );
		if ( is_wp_error( $manifest ) ) {
			// Install failed: restore the backed-up files and re-register so
			// the ware remains visible and fully servable.
			if ( $has_backup && is_dir( $backup_dir ) ) {
				global $wp_filesystem;
				if ( ! empty( $wp_filesystem ) ) {
					$wp_filesystem->move( $backup_dir, $ware_dir );
				}
			}
			if ( is_array( $old_manifest ) ) {
				$restored = $this->registry->register( $old_manifest );
				if ( ! $restored ) {
					return new WP_Error(
						'rollback_failed',
						esc_html__( 'Update failed and the previous version could not be restored. The ware is in an inconsistent state.', 'bazaar' )
					);
				}
			}
			return $manifest;
		}

		// Install succeeded — clean up the file backup.
		if ( $has_backup && is_dir( $backup_dir ) ) {
			global $wp_filesystem;
			$wp_filesystem?->delete( $backup_dir, true );
		}

		// Schedule any manifest-declared background jobs from the new version.
		JobsController::register_ware_jobs( $manifest );

		// Remove from outdated list.
		$outdated = $this->get_outdated();
		unset( $outdated[ $slug ] );
		update_option( self::OUTDATED_KEY, wp_json_encode( $outdated ), false );

		do_action( 'bazaar_ware_updated', $slug, $manifest );

		return $manifest;
	}

	/**
	 * Update all outdated wares.
	 *
	 * @return array<string, array<string, mixed>|WP_Error> keyed by slug.
	 */
	public function update_all(): array {
		$outdated = $this->run_check();
		$results  = array();
		foreach ( array_keys( $outdated ) as $slug ) {
			$results[ $slug ] = $this->update( $slug );
		}
		return $results;
	}

	/**
	 * Return the datetime of the last update check.
	 *
	 * @return string ISO 8601 datetime or empty string.
	 */
	public function last_check_time(): string {
		return (string) get_option( self::LAST_CHECK_KEY, '' );
	}
}
