<?php
/**
 * Ware Bundle support — install a `.wpbundle` collection in one shot.
 *
 * A `.wpbundle` file is a ZIP archive containing:
 *   bundle.json  — manifest listing wares and config overrides
 *   {slug}.wp/   — one or more `.wp` ware packages (expanded or zipped)
 *
 * bundle.json schema:
 *   {
 *     "name":    "My Bundle",
 *     "version": "1.0.0",
 *     "wares": [
 *       { "file": "my-ware.wp" },
 *       { "file": "another-ware.wp", "config": { "theme": "dark" } }
 *     ]
 *   }
 *
 * CLI: `wp bazaar bundle install /path/to/bundle.wpbundle`
 *
 * @package Bazaar
 */

declare( strict_types=1 );

namespace Bazaar;

defined( 'ABSPATH' ) || exit;

use Bazaar\REST\AuditController;

/**
 * Installs .wpbundle archives.
 */
final class WareBundler {

	/**
	 * WareLoader instance.
	 *
	 * @var WareLoader
	 */
	private WareLoader $loader;

	/**
	 * Constructor.
	 *
	 * @param WareLoader $loader Description.
	 */
	public function __construct( WareLoader $loader ) {
		$this->loader = $loader;
	}

	/**
	 * Install a .wpbundle archive.
	 *
	 * @param string $bundle_path Absolute filesystem path to the .wpbundle file.
	 * @return array{name: string, version: string, installed: string[], skipped: string[], errors: string[]}
	 * @throws \RuntimeException When the bundle file cannot be read or is malformed.
	 */
	public function install( string $bundle_path ): array {
		if ( ! file_exists( $bundle_path ) ) {
			throw new \RuntimeException( "Bundle file not found: {$bundle_path}" );
		}

		require_once ABSPATH . 'wp-admin/includes/file.php';
		if ( ! WP_Filesystem() || empty( $GLOBALS['wp_filesystem'] ) ) {
			throw new \RuntimeException( 'Could not initialise WordPress filesystem.' );
		}

		$tmp    = get_temp_dir() . 'bazaar_bundle_' . wp_generate_password( 8, false );
		$result = unzip_file( $bundle_path, $tmp );
		if ( is_wp_error( $result ) ) {
			throw new \RuntimeException( 'Could not unzip bundle: ' . $result->get_error_message() );
		}

		$manifest_path = $tmp . '/bundle.json';
		if ( ! file_exists( $manifest_path ) ) {
			$this->cleanup( $tmp );
			throw new \RuntimeException( 'bundle.json not found inside .wpbundle archive.' );
		}

		global $wp_filesystem;
		$manifest = json_decode( (string) $wp_filesystem->get_contents( $manifest_path ), true );
		if ( ! is_array( $manifest ) || empty( $manifest['wares'] ) ) {
			$this->cleanup( $tmp );
			throw new \RuntimeException( 'bundle.json is invalid or missing "wares" list.' );
		}

		$installed = array();
		$skipped   = array();
		$errors    = array();

		foreach ( $manifest['wares'] as $entry ) {
			$file = $entry['file'] ?? '';
			if ( '' === $file ) {
				continue;
			}

			$ware_path = $tmp . '/' . basename( $file );
			if ( ! file_exists( $ware_path ) ) {
				$errors[] = "File not found in bundle: {$file}";
				continue;
			}

			try {
				$manifest_result = $this->loader->install_from_path( $ware_path );
				if ( is_wp_error( $manifest_result ) ) {
					$errors[] = "{$file}: " . $manifest_result->get_error_message();
					continue;
				}
				$slug        = $manifest_result['slug'];
				$installed[] = $slug;

				// Apply config overrides if declared.
				if ( ! empty( $entry['config'] ) && is_array( $entry['config'] ) ) {
					$current     = json_decode( (string) get_option( "bazaar_config_{$slug}", '{}' ), true );
					$merged      = array_merge( is_array( $current ) ? $current : array(), $entry['config'] );
					$merged_json = wp_json_encode( $merged );
					if ( false !== $merged_json ) {
						update_option( "bazaar_config_{$slug}", $merged_json, false );
					}
				}

				AuditLog::record(
					$slug,
					'install',
					array(
						'via'    => 'bundle',
						'bundle' => basename( $bundle_path ),
					)
				);
			} catch ( \Throwable $e ) {
				$errors[] = "{$file}: " . $e->getMessage();
			}
		}

		$this->cleanup( $tmp );

		return array(
			'name'      => $manifest['name'] ?? basename( $bundle_path ),
			'version'   => $manifest['version'] ?? '',
			'installed' => $installed,
			'skipped'   => $skipped,
			'errors'    => $errors,
		);
	}

	/**
	 * Cleanup.
	 *
	 * @param string $dir Description.
	 */
	private function cleanup( string $dir ): void {
		if ( ! str_starts_with( $dir, get_temp_dir() ) ) {
			return;
		}
		$this->rm_rf( $dir );
	}

	/**
	 * Rm rf.
	 *
	 * @param string $path Description.
	 */
	private function rm_rf( string $path ): void {
		global $wp_filesystem;
		if ( is_dir( $path ) ) {
			$wp_filesystem->rmdir( $path, true );
		} else {
			wp_delete_file( $path );
		}
	}
}
