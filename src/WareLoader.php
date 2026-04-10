<?php

declare( strict_types=1 );

namespace Bazaar;

defined( 'ABSPATH' ) || exit;

use WP_Error;
use ZipArchive;

/**
 * Validates and extracts .wp ware archives.
 *
 * Responsibilities:
 * - Full validation pipeline (extension, ZIP integrity, manifest, slug, security)
 * - Extraction to wp-content/bazaar/{slug}/ via WP_Filesystem
 * - Writing the protective .htaccess on first install
 */
final class WareLoader {

	/** File extensions that are never allowed inside a .wp archive. */
	private const FORBIDDEN_EXTENSIONS = [ 'php', 'phtml', 'phar', 'php3', 'php4', 'php5', 'php7', 'phps' ];

	private WareRegistry $registry;

	public function __construct( WareRegistry $registry ) {
		$this->registry = $registry;
	}

	// -------------------------------------------------------------------------
	// Public API
	// -------------------------------------------------------------------------

	/**
	 * Validate a .wp file path and install it if valid.
	 *
	 * @param string $tmp_path Absolute path to the uploaded temporary file.
	 * @param string $filename Original filename (used for extension check).
	 * @return array<string, mixed>|WP_Error Manifest array on success, WP_Error on failure.
	 */
	public function install( string $tmp_path, string $filename ): array|WP_Error {
		$manifest = $this->validate( $tmp_path, $filename );
		if ( is_wp_error( $manifest ) ) {
			return $manifest;
		}

		$result = $this->extract( $tmp_path, $manifest['slug'] );
		if ( is_wp_error( $result ) ) {
			return $result;
		}

		return $manifest;
	}

	/**
	 * Run the full validation pipeline without installing.
	 *
	 * @param string $tmp_path Absolute path to the file to validate.
	 * @param string $filename Original filename.
	 * @return array<string, mixed>|WP_Error Manifest array on success, WP_Error on failure.
	 */
	public function validate( string $tmp_path, string $filename ): array|WP_Error {
		// 1. Extension check.
		if ( 'wp' !== strtolower( pathinfo( $filename, PATHINFO_EXTENSION ) ) ) {
			return new WP_Error(
				'invalid_extension',
				esc_html__( 'File must have a .wp extension.', 'bazaar' )
			);
		}

		// 2. Valid ZIP.
		$zip = new ZipArchive();
		$status = $zip->open( $tmp_path, ZipArchive::RDONLY );
		if ( true !== $status ) {
			return new WP_Error(
				'invalid_zip',
				esc_html__( 'File is not a valid ZIP archive.', 'bazaar' )
			);
		}

		// 3. No PHP files + collect uncompressed size.
		$total_size = 0;
		for ( $i = 0; $i < $zip->numFiles; $i++ ) {
			$stat = $zip->statIndex( $i );
			if ( false === $stat ) {
				continue;
			}
			$ext = strtolower( pathinfo( $stat['name'], PATHINFO_EXTENSION ) );
			if ( in_array( $ext, self::FORBIDDEN_EXTENSIONS, true ) ) {
				$zip->close();
				return new WP_Error(
					'php_not_allowed',
					/* translators: %s: filename found inside the archive */
					sprintf(
						esc_html__( 'PHP files are not allowed inside a ware archive. Found: %s', 'bazaar' ),
						esc_html( $stat['name'] )
					)
				);
			}
			$total_size += $stat['size'];
		}

		// 4. Uncompressed size limit.
		$max = absint( get_option( 'bazaar_max_ware_size', BAZAAR_MAX_UNCOMPRESSED_SIZE ) );
		if ( $total_size > $max ) {
			$zip->close();
			return new WP_Error(
				'too_large',
				sprintf(
					/* translators: 1: uncompressed size in MB, 2: limit in MB */
					esc_html__( 'Ware is too large (%1$s MB uncompressed). Maximum is %2$s MB.', 'bazaar' ),
					number_format_i18n( $total_size / 1024 / 1024, 1 ),
					number_format_i18n( $max / 1024 / 1024, 1 )
				)
			);
		}

		// 5. manifest.json exists at archive root.
		$manifest_raw = $zip->getFromName( 'manifest.json' );
		if ( false === $manifest_raw ) {
			$zip->close();
			return new WP_Error(
				'missing_manifest',
				esc_html__( 'manifest.json not found at the archive root.', 'bazaar' )
			);
		}

		// 6. Parse manifest.
		$manifest = json_decode( $manifest_raw, true );
		if ( ! is_array( $manifest ) ) {
			$zip->close();
			return new WP_Error(
				'invalid_manifest',
				esc_html__( 'manifest.json is not valid JSON.', 'bazaar' )
			);
		}

		// 7. Required fields.
		foreach ( [ 'name', 'slug', 'version' ] as $field ) {
			if ( empty( $manifest[ $field ] ) || ! is_string( $manifest[ $field ] ) ) {
				$zip->close();
				return new WP_Error(
					'missing_manifest_field',
					/* translators: %s: field name */
					sprintf(
						esc_html__( 'manifest.json is missing required field: %s', 'bazaar' ),
						esc_html( $field )
					)
				);
			}
		}

		// 8. Slug format: lowercase letters, numbers, hyphens only.
		if ( ! preg_match( '/^[a-z0-9-]+$/', $manifest['slug'] ) ) {
			$zip->close();
			return new WP_Error(
				'invalid_slug',
				esc_html__( 'Ware slug must contain only lowercase letters, numbers, and hyphens.', 'bazaar' )
			);
		}

		// 9. Slug uniqueness.
		if ( $this->registry->exists( $manifest['slug'] ) ) {
			$zip->close();
			return new WP_Error(
				'slug_exists',
				/* translators: %s: ware slug */
				sprintf(
					esc_html__( 'A ware with slug "%s" is already installed. Delete it before re-uploading.', 'bazaar' ),
					esc_html( $manifest['slug'] )
				)
			);
		}

		// 10. Entry file exists in archive.
		$entry = $manifest['entry'] ?? 'index.html';
		if ( false === $zip->getFromName( $entry ) ) {
			$zip->close();
			return new WP_Error(
				'missing_entry',
				/* translators: %s: entry filename from manifest.json */
				sprintf(
					esc_html__( 'Entry file "%s" not found in archive.', 'bazaar' ),
					esc_html( $entry )
				)
			);
		}

		$zip->close();
		return $manifest;
	}

	/**
	 * Remove an installed ware's files from disk.
	 *
	 * @return true|WP_Error
	 */
	public function delete( string $slug ): bool|WP_Error {
		$slug    = sanitize_key( $slug );
		$ware_dir = BAZAAR_WARES_DIR . $slug;

		if ( ! is_dir( $ware_dir ) ) {
			return true;
		}

		$filesystem = $this->get_filesystem();
		if ( is_wp_error( $filesystem ) ) {
			return $filesystem;
		}

		if ( ! $filesystem->delete( $ware_dir, true ) ) {
			return new WP_Error(
				'delete_failed',
				/* translators: %s: ware slug */
				sprintf(
					esc_html__( 'Could not delete ware files for "%s".', 'bazaar' ),
					esc_html( $slug )
				)
			);
		}

		return true;
	}

	// -------------------------------------------------------------------------
	// Private helpers
	// -------------------------------------------------------------------------

	/**
	 * Extract the ZIP archive to wp-content/bazaar/{slug}/ using WP_Filesystem.
	 *
	 * @return true|WP_Error
	 */
	private function extract( string $tmp_path, string $slug ): bool|WP_Error {
		$slug     = sanitize_key( $slug );
		$dest_dir = BAZAAR_WARES_DIR . $slug . '/';

		$filesystem = $this->get_filesystem();
		if ( is_wp_error( $filesystem ) ) {
			return $filesystem;
		}

		// Create destination directory.
		if ( ! $filesystem->is_dir( $dest_dir ) ) {
			$filesystem->mkdir( $dest_dir, FS_CHMOD_DIR );
		}

		// WP core provides unzip_file() which wraps ZipArchive with WP_Filesystem.
		if ( ! function_exists( 'unzip_file' ) ) {
			require_once ABSPATH . 'wp-admin/includes/file.php';
		}

		$result = unzip_file( $tmp_path, $dest_dir );
		if ( is_wp_error( $result ) ) {
			return $result;
		}

		return true;
	}

	/**
	 * Initialise and return the global WP_Filesystem object.
	 *
	 * @return \WP_Filesystem_Base|WP_Error
	 */
	private function get_filesystem(): \WP_Filesystem_Base|WP_Error {
		global $wp_filesystem;

		if ( empty( $wp_filesystem ) ) {
			if ( ! function_exists( 'WP_Filesystem' ) ) {
				require_once ABSPATH . 'wp-admin/includes/file.php';
			}
			WP_Filesystem();
		}

		if ( empty( $wp_filesystem ) ) {
			return new WP_Error(
				'filesystem_unavailable',
				esc_html__( 'WordPress filesystem is unavailable.', 'bazaar' )
			);
		}

		return $wp_filesystem;
	}
}
