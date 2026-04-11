<?php
/**
 * Bazaar CLI — Operational commands.
 *
 * @package Bazaar
 */

declare( strict_types=1 );

namespace Bazaar\CLI\Traits;

defined( 'ABSPATH' ) || exit;

use Bazaar\AuditLog;
use Bazaar\CspPolicy;
use Bazaar\WareLoader;
use Bazaar\WareRegistry;
use Bazaar\RemoteRegistry;
use Bazaar\WareBundler;
use WP_CLI;
use WP_CLI\Utils;

/**
 * Operational commands: doctor, logs, bundle, audit, csp, analytics, license.
 */
trait WareOpsTrait {

	/**
	 * Manage the license key for a ware (set / check / remove).
	 *
	 * @param array<int,string>    $args       Positional args: action (set|check|remove), slug, key.
	 * @param array<string,string> $assoc_args Named flags: --porcelain for machine-readable check output.
	 */
	public function license( array $args, array $assoc_args ): void {
		$action = $args[0] ?? '';
		$slug   = sanitize_key( $args[1] ?? '' );

		if ( '' === $slug ) {
			WP_CLI::error( __( 'Please provide a ware slug.', 'bazaar' ) );
		}

		$ware = $this->registry->get( $slug );
		if ( null === $ware ) {
			/* translators: %s: ware slug */
			WP_CLI::error( sprintf( __( 'Ware "%s" not found.', 'bazaar' ), $slug ) );
			return;
		}

		switch ( $action ) {
			case 'set':
				$key = sanitize_text_field( $args[2] ?? '' );
				if ( '' === $key ) {
					WP_CLI::error( __( 'Please provide a license key.', 'bazaar' ) );
				}
				$this->license->set( $slug, $key );
				// Attempt remote validation.
				$license_meta = $ware['license'] ?? array();
				if ( ! empty( $license_meta['url'] ) ) {
					WP_CLI::log( __( 'Validating license key against vendor…', 'bazaar' ) );
					$valid = $this->license->validate( $slug, $key, $license_meta );
					if ( is_wp_error( $valid ) ) {
						WP_CLI::warning( $valid->get_error_message() );
					} else {
						WP_CLI::success( __( 'License key validated and stored.', 'bazaar' ) );
					}
				} else {
					WP_CLI::success( __( 'License key stored (no remote validation URL configured).', 'bazaar' ) );
				}
				break;

			case 'check':
				$licensed  = $this->license->is_licensed( $ware );
				$key       = $this->license->get_key( $slug );
				$porcelain = (bool) Utils\get_flag_value( $assoc_args, 'porcelain', false );
				if ( $porcelain ) {
					WP_CLI::log( $licensed ? 'valid' : 'invalid' );
					break;
				}
				/* translators: 1: ware slug, 2: license status */
				WP_CLI::line( sprintf( __( 'License status for "%1\$s": %2\$s', 'bazaar' ), $slug, $licensed ? 'valid' : 'not licensed' ) );
				if ( $key ) {
					// Never print the full credential — show only the first 8 characters.
					$masked = substr( $key, 0, 8 ) . str_repeat( '*', max( 0, strlen( $key ) - 8 ) );
					/* translators: %s: masked license key */
					WP_CLI::line( sprintf( __( 'Stored key: %s', 'bazaar' ), $masked ) );
				}
				break;

			case 'remove':
				$this->license->delete( $slug );
				/* translators: %s: ware slug */
				WP_CLI::success( sprintf( __( 'License key removed for "%s".', 'bazaar' ), $slug ) );
				break;

			default:
				/* translators: %s: unknown action name */
				WP_CLI::error( sprintf( __( 'Unknown action "%s". Use: set, check, remove.', 'bazaar' ), $action ) );
		}
	}

	/**
	 * Show analytics data: views and session duration per ware or per day.
	 *
	 * @param array<int,string>    $args       Optional ware slug for per-ware breakdown.
	 * @param array<string,string> $assoc_args Named flags: --days, --format.
	 */
	public function analytics( array $args, array $assoc_args ): void {
		global $wpdb;

		$slug   = sanitize_key( $args[0] ?? '' );
		$days   = absint( Utils\get_flag_value( $assoc_args, 'days', 30 ) );
		$format = Utils\get_flag_value( $assoc_args, 'format', 'table' );
		$since  = gmdate( 'Y-m-d H:i:s', (int) strtotime( "-{$days} days" ) );
		$table  = $wpdb->prefix . 'bazaar_analytics';

		if ( '' !== $slug ) {
			$rows   = $wpdb->get_results(
				$wpdb->prepare(
					"SELECT DATE(created_at) AS day, COUNT(*) AS views, COALESCE(SUM(duration_ms),0) AS total_ms
					 FROM %i WHERE slug = %s AND event_type = 'view' AND created_at >= %s
					 GROUP BY DATE(created_at) ORDER BY day ASC",
					$table,
					$slug,
					$since
				),
				ARRAY_A
			);
			$fields = array( 'day', 'views', 'total_ms' );
		} else {
			$rows   = $wpdb->get_results(
				$wpdb->prepare(
					"SELECT slug, COUNT(*) AS views, COALESCE(SUM(duration_ms),0) AS total_ms, COUNT(DISTINCT user_id) AS unique_users
					 FROM %i WHERE event_type = 'view' AND created_at >= %s
					 GROUP BY slug ORDER BY total_ms DESC",
					$table,
					$since
				),
				ARRAY_A
			);
			$fields = array( 'slug', 'views', 'total_ms', 'unique_users' );
		}

		if ( empty( $rows ) ) {
			/* translators: %d: number of days */
			WP_CLI::line( sprintf( __( 'No analytics data for the past %d days.', 'bazaar' ), $days ) );
			return;
		}

		Utils\format_items( $format, $rows, $fields );
	}

	/**
	 * Run health checks on installed wares: filesystem, manifest, entry point, .htaccess, bundle size.
	 *
	 * @param array<int,string>    $args       Unused positional args.
	 * @param array<string,string> $assoc_args Named flags: --slug to check a single ware, --format.
	 */
	public function doctor( array $args, array $assoc_args ): void {
		$slug   = Utils\get_flag_value( $assoc_args, 'slug', '' );
		$format = Utils\get_flag_value( $assoc_args, 'format', 'table' );
		$wares  = $slug ? array_filter( array( $this->registry->get( $slug ) ) ) : $this->registry->get_all();
		$rows   = array();

		WP_CLI::log( '🩺 Running Bazaar doctor checks…' );

		if ( ! function_exists( 'WP_Filesystem' ) ) {
			require_once ABSPATH . 'wp-admin/includes/file.php';
		}
		WP_Filesystem();
		global $wp_filesystem;
		if ( empty( $wp_filesystem ) ) {
			WP_CLI::error( __( 'WordPress filesystem could not be initialised.', 'bazaar' ) );
			return;
		}

		foreach ( $wares as $ware ) {
			$s = $ware['slug'];

			// 1. Filesystem presence.
			$dir    = rtrim( BAZAAR_WARES_DIR, '/' ) . '/' . $s;
			$exists = is_dir( $dir );
			$rows[] = array(
				'ware'   => $s,
				'check'  => 'filesystem',
				'status' => $exists ? 'ok' : 'error',
				'detail' => $exists ? 'Directory found' : "Missing: {$dir}",
			);

			// 2. Manifest parseable.
			$mf_path   = $dir . '/manifest.json';
			$mf_parsed = $exists && $wp_filesystem->is_file( $mf_path ) && is_array( json_decode( (string) $wp_filesystem->get_contents( $mf_path ), true ) );
			$rows[]    = array(
				'ware'   => $s,
				'check'  => 'manifest',
				'status' => $mf_parsed ? 'ok' : 'error',
				'detail' => $mf_parsed ? 'Valid JSON' : 'Cannot parse manifest.json',
			);

			// 3. Entry point file exists.
			$entry  = $ware['entry'] ?? 'index.html';
			$has_ep = $exists && file_exists( $dir . '/' . $entry );
			$rows[] = array(
				'ware'   => $s,
				'check'  => 'entry',
				'status' => $has_ep ? 'ok' : 'error',
				'detail' => $has_ep ? "{$entry} found" : "Entry {$entry} missing",
			);

			// 4. .htaccess protection.
			$htaccess = $dir . '/.htaccess';
			$has_ht   = $wp_filesystem->is_file( $htaccess ) && str_contains( (string) $wp_filesystem->get_contents( $htaccess ), 'php_flag' );
			$rows[]   = array(
				'ware'   => $s,
				'check'  => 'htaccess',
				'status' => $has_ht ? 'ok' : 'warn',
				'detail' => $has_ht ? 'PHP execution blocked' : '.htaccess missing or incomplete',
			);

			// 5. Bundle size estimate.
			$size   = $this->dir_size( $dir );
			$size_h = size_format( $size );
			$rows[] = array(
				'ware'   => $s,
				'check'  => 'bundle_size',
				'status' => $size < 50 * 1024 * 1024 ? 'ok' : 'warn',
				'detail' => "Total: {$size_h}",
			);

			// 6. Health-check URL reachable (if declared).
			if ( ! empty( $ware['health_check'] ) ) {
				$r      = wp_remote_get( $ware['health_check'], array( 'timeout' => 5 ) );
				$ok     = ! is_wp_error( $r ) && (int) wp_remote_retrieve_response_code( $r ) < 300;
				$rows[] = array(
					'ware'   => $s,
					'check'  => 'health_check',
					'status' => $ok ? 'ok' : 'error',
					'detail' => $ok ? 'Reachable' : ( is_wp_error( $r ) ? $r->get_error_message() : 'HTTP ' . wp_remote_retrieve_response_code( $r ) ),
				);
			}

			// 7. Jobs next run.
			foreach ( (array) ( $ware['jobs'] ?? array() ) as $job ) {
				if ( ! is_array( $job ) || empty( $job['id'] ) ) {
					continue;
				}
				$hook   = "bazaar_job_{$s}_{$job['id']}";
				$next   = wp_next_scheduled( $hook );
				$rows[] = array(
					'ware'   => $s,
					'check'  => "job:{$job['id']}",
					'status' => $next ? 'ok' : 'warn',
					'detail' => $next ? 'Next: ' . gmdate( 'Y-m-d H:i:s', $next ) : 'Not scheduled',
				);
			}
		}

		// Colour-code status column.
		foreach ( $rows as &$row ) {
			$row['status'] = match ( $row['status'] ) {
				'ok'    => WP_CLI::colorize( '%gok%n' ),
				'warn'  => WP_CLI::colorize( '%ywarn%n' ),
				default => WP_CLI::colorize( '%rerror%n' ),
			};
		}
		unset( $row );

		Utils\format_items( $format, $rows, array( 'ware', 'check', 'status', 'detail' ) );

		$errors = count( array_filter( $rows, fn( $r ) => str_contains( $r['status'], 'error' ) ) );
		$warns  = count( array_filter( $rows, fn( $r ) => str_contains( $r['status'], 'warn' ) ) );
		WP_CLI::log( '' );
		if ( $errors ) {
			WP_CLI::warning( "Found {$errors} error(s). Run with --format=json for details." );
		} elseif ( $warns ) {
			WP_CLI::warning( "Found {$warns} warning(s)." );
		} else {
			WP_CLI::success( 'All checks passed!' );
		}
	}

	/**
	 * Show recent error log entries, optionally filtered by ware slug.
	 *
	 * @param array<int,string>    $args       Optional ware slug to filter results.
	 * @param array<string,string> $assoc_args Named flags: --count (default 25), --format.
	 */
	public function logs( array $args, array $assoc_args ): void {
		global $wpdb;
		$slug   = $args[0] ?? '';
		$count  = max( 1, (int) Utils\get_flag_value( $assoc_args, 'count', 25 ) );
		$format = Utils\get_flag_value( $assoc_args, 'format', 'table' );
		$table  = $wpdb->prefix . 'bazaar_errors';

		if ( ! $wpdb->get_var( $wpdb->prepare( 'SHOW TABLES LIKE %s', $table ) ) ) {
			WP_CLI::error( 'Error log table does not exist. Run wp bazaar doctor to diagnose.' );
		}

		if ( $slug ) {
			$rows = $wpdb->get_results( $wpdb->prepare( 'SELECT id, slug, message, created_at FROM %i WHERE slug = %s ORDER BY id DESC LIMIT %d', $table, sanitize_key( $slug ), $count ), ARRAY_A ) ?? array();
		} else {
			$rows = $wpdb->get_results( $wpdb->prepare( 'SELECT id, slug, message, created_at FROM %i ORDER BY id DESC LIMIT %d', $table, $count ), ARRAY_A ) ?? array();
		}

		if ( ! $rows ) {
			WP_CLI::success( 'No error log entries.' );
			return; }
		Utils\format_items( $format, $rows, array( 'id', 'slug', 'message', 'created_at' ) );
	}

	/**
	 * Install multiple wares at once from a .wpbundle archive.
	 *
	 * @param array<int,string>    $args       Positional args: path to .wpbundle file.
	 * @param array<string,string> $assoc_args Named flags: --verbose to show per-ware details.
	 */
	public function bundle( array $args, array $assoc_args ): void {
		if ( empty( $args[0] ) ) {
			WP_CLI::error( 'Usage: wp bazaar bundle <file.wpbundle>' );
		}
		$path    = $args[0];
		$verbose = (bool) Utils\get_flag_value( $assoc_args, 'verbose', false );
		if ( ! file_exists( $path ) ) {
			WP_CLI::error( "File not found: {$path}" );
		}

		$bundler = new \Bazaar\WareBundler( $this->loader );
		try {
			$result = $bundler->install( $path );
		} catch ( \Throwable $e ) {
			WP_CLI::error( 'Bundle install failed: ' . $e->getMessage() );
			return;
		}

		WP_CLI::log( '' );
		WP_CLI::log( WP_CLI::colorize( "%BSummary for bundle: {$result['name']} v{$result['version']}%n" ) );

		if ( $result['installed'] ) {
			WP_CLI::success( 'Installed: ' . implode( ', ', $result['installed'] ) );
		}
		if ( $result['skipped'] ) {
			WP_CLI::warning( 'Skipped: ' . implode( ', ', $result['skipped'] ) );
		}
		foreach ( $result['errors'] as $err ) {
			WP_CLI::warning( "Error: {$err}" );
		}

		if ( $verbose ) {
			WP_CLI::log( 'Bundle path: ' . realpath( $path ) );
			WP_CLI::log( 'Wares installed: ' . count( $result['installed'] ) );
			WP_CLI::log( 'Wares skipped: ' . count( $result['skipped'] ) );
		}

		if ( empty( $result['errors'] ) ) {
			WP_CLI::success( 'Bundle installed successfully.' );
		} else {
			WP_CLI::warning( 'Bundle installed with errors. Run wp bazaar doctor for details.' );
		}
	}

	/**
	 * Show audit log entries, optionally filtered by ware slug and event type.
	 *
	 * @param array<int,string>    $args       Optional ware slug to filter results.
	 * @param array<string,string> $assoc_args Named flags: --event, --count (default 25), --format.
	 */
	public function audit( array $args, array $assoc_args ): void {
		global $wpdb;
		$slug   = $args[0] ?? '';
		$event  = Utils\get_flag_value( $assoc_args, 'event', '' );
		$count  = max( 1, (int) Utils\get_flag_value( $assoc_args, 'count', 25 ) );
		$format = Utils\get_flag_value( $assoc_args, 'format', 'table' );
		$table  = $wpdb->prefix . 'bazaar_audit_log';

		if ( ! $wpdb->get_var( $wpdb->prepare( 'SHOW TABLES LIKE %s', $table ) ) ) {
			WP_CLI::error( 'Audit log table does not exist. Run wp bazaar doctor.' );
		}

		$slug_key = $slug ? sanitize_key( $slug ) : '';
		$event_sf = $event ? sanitize_text_field( $event ) : '';

		if ( $slug_key && $event_sf ) {
			$rows = $wpdb->get_results( $wpdb->prepare( 'SELECT id, slug, event, user_id, meta, created_at FROM %i WHERE slug = %s AND event = %s ORDER BY id DESC LIMIT %d', $table, $slug_key, $event_sf, $count ), ARRAY_A ) ?? array();
		} elseif ( $slug_key ) {
			$rows = $wpdb->get_results( $wpdb->prepare( 'SELECT id, slug, event, user_id, meta, created_at FROM %i WHERE slug = %s ORDER BY id DESC LIMIT %d', $table, $slug_key, $count ), ARRAY_A ) ?? array();
		} elseif ( $event_sf ) {
			$rows = $wpdb->get_results( $wpdb->prepare( 'SELECT id, slug, event, user_id, meta, created_at FROM %i WHERE event = %s ORDER BY id DESC LIMIT %d', $table, $event_sf, $count ), ARRAY_A ) ?? array();
		} else {
			$rows = $wpdb->get_results( $wpdb->prepare( 'SELECT id, slug, event, user_id, meta, created_at FROM %i ORDER BY id DESC LIMIT %d', $table, $count ), ARRAY_A ) ?? array();
		}

		if ( ! $rows ) {
			WP_CLI::success( 'No audit log entries.' );
			return; }
		Utils\format_items( $format, $rows, array( 'id', 'slug', 'event', 'user_id', 'meta', 'created_at' ) );
	}

	/**
	 * View or update the Content Security Policy directives for a ware.
	 *
	 * @param array<int,string>    $args       Positional args: ware slug, optional directive, optional value.
	 * @param array<string,string> $assoc_args Named flags: --format.
	 */
	public function csp( array $args, array $assoc_args ): void {
		if ( empty( $args[0] ) ) {
			WP_CLI::error( 'Please provide a ware slug.' );
		}
		$slug = sanitize_key( $args[0] );

		if ( isset( $assoc_args['reset'] ) ) {
			delete_option( "bazaar_csp_{$slug}" );
			WP_CLI::success( "CSP reset to baseline for '{$slug}'." );
			return;
		}

		$set_json = Utils\get_flag_value( $assoc_args, 'set', '' );
		if ( $set_json ) {
			$dirs = json_decode( $set_json, true );
			if ( ! is_array( $dirs ) ) {
				WP_CLI::error( 'Invalid JSON for --set.' );
			}
			$existing = json_decode( (string) get_option( "bazaar_csp_{$slug}", '{}' ), true );
			if ( ! is_array( $existing ) ) {
				$existing = array();
			}
			$merged = array_merge( $existing, $dirs );
			update_option( "bazaar_csp_{$slug}", (string) wp_json_encode( $merged ), false );
			WP_CLI::success( "CSP updated for '{$slug}'." );
		}

		// Show current CSP.
		$header = \Bazaar\CspPolicy::header_for( $slug );
		WP_CLI::log( '' );
		WP_CLI::log( WP_CLI::colorize( '%BContent-Security-Policy:%n' ) );
		WP_CLI::log( $header );
	}

	// ── Private helpers ───────────────────────────────────────────────────────

	/**
	 * Recursively calculate the total size of a directory in bytes.
	 *
	 * @param string $path Absolute filesystem path to the directory.
	 * @return int Total size in bytes, or 0 if the path is not a directory.
	 */
	private function dir_size( string $path ): int {
		if ( ! is_dir( $path ) ) {
			return 0;
		}
		$total = 0;
		foreach ( new \RecursiveIteratorIterator( new \RecursiveDirectoryIterator( $path, \FilesystemIterator::SKIP_DOTS ) ) as $file ) {
			$total += $file->getSize();
		}
		return $total;
	}
}
