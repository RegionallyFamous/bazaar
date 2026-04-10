<?php
/**
 * Ware loader — validates and installs .wp archive files.
 *
 * @package Bazaar
 */

declare( strict_types=1 );

namespace Bazaar;

defined( 'ABSPATH' ) || exit;

use WP_Error;
use ZipArchive;
use Bazaar\WareSigner;
use Bazaar\WareLicense;

/**
 * Validates and extracts .wp ware archives.
 *
 * Responsibilities:
 * - Full validation pipeline (extension, ZIP integrity, manifest, slug, security)
 * - Zip-bomb / archive-bomb protection (file count + compression ratio)
 * - Atomic extraction: extract to temp dir then rename to final location
 * - Writing the protective .htaccess on first install
 */
final class WareLoader {

	/** File extensions that are never allowed inside a .wp archive. */
	private const FORBIDDEN_EXTENSIONS = array( 'php', 'phtml', 'phar', 'php3', 'php4', 'php5', 'php7', 'phps', 'cgi', 'pl', 'py', 'rb', 'sh', 'bash' );

	/**
	 * Maximum number of files allowed in a single ware archive.
	 * Prevents archive-bomb attacks through sheer file count.
	 */
	private const MAX_FILE_COUNT = 2000;

	/**
	 * Maximum allowed compression ratio (uncompressed / compressed) for any
	 * single file in the archive. A ratio above this suggests a zip bomb.
	 *
	 * 100:1 is extremely generous (gzip typically achieves 2:1–5:1 for typical
	 * web assets). Legitimate minified JS/CSS rarely exceeds 10:1.
	 */
	private const MAX_COMPRESSION_RATIO = 100;

	/**
	 * Registry used to check slug uniqueness and update state.
	 *
	 * @var WareRegistry
	 */
	private WareRegistry $registry;

	/**
	 * Constructor.
	 *
	 * @param WareRegistry $registry Registry instance.
	 */
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

		// Optional signature verification.
		$signer = new WareSigner();
		$sig_ok = $signer->verify( $tmp_path, $manifest );
		if ( is_wp_error( $sig_ok ) ) {
			return $sig_ok;
		}

		// License gate: if the ware is paid and no key is stored, fail early so
		// the caller (REST or CLI) can prompt the user for a key.
		$license_meta = $manifest['license'] ?? array();
		$type         = $license_meta['type'] ?? 'free';
		if ( 'key' === $type && ! empty( $license_meta['required'] ) && 'true' === $license_meta['required'] ) {
			$lic    = new WareLicense();
			$stored = $lic->get_key( sanitize_key( $manifest['slug'] ) );
			if ( '' === $stored ) {
				return new WP_Error(
					'license_required',
					sprintf(
						/* translators: %s: ware name */
						esc_html__( '"%s" is a paid ware. Provide a license key before installing.', 'bazaar' ),
						esc_html( $manifest['name'] )
					)
				);
			}
		}

		$result = $this->extract( $tmp_path, $manifest['slug'] );
		if ( is_wp_error( $result ) ) {
			return $result;
		}

		return $manifest;
	}

	/**
	 * Convenience wrapper: install a .wp archive when the filename equals basename($path).
	 *
	 * Used by the bundler, where files are already staged under their final name.
	 *
	 * @param string $path Absolute path to the .wp archive.
	 * @return array<string, mixed>|WP_Error Manifest array on success, WP_Error on failure.
	 */
	public function install_from_path( string $path ): array|WP_Error {
		return $this->install( $path, basename( $path ) );
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
		$zip    = new ZipArchive();
		$status = $zip->open( $tmp_path, ZipArchive::RDONLY );
		if ( true !== $status ) {
			return new WP_Error(
				'invalid_zip',
				esc_html__( 'File is not a valid ZIP archive.', 'bazaar' )
			);
		}

		// 3. File count guard (zip bomb prevention).
		$file_count = $zip->count();
		if ( $file_count > self::MAX_FILE_COUNT ) {
			$zip->close();
			return new WP_Error(
				'too_many_files',
				sprintf(
					/* translators: 1: file count in the archive, 2: maximum allowed */
					esc_html__( 'Archive contains %1$d files. Maximum allowed is %2$d.', 'bazaar' ),
					$file_count,
					self::MAX_FILE_COUNT
				)
			);
		}

		// 4. Scan all entries: forbidden extensions, path traversal, symlinks,
		// compression ratio, and total uncompressed size.
		$total_uncompressed = 0;
		for ( $i = 0; $i < $file_count; $i++ ) {
			$stat = $zip->statIndex( $i );
			if ( false === $stat ) {
				continue;
			}

			$name = $stat['name'];

			// Path traversal inside the archive.
			if ( str_contains( $name, '..' ) || str_starts_with( $name, '/' ) ) {
				$zip->close();
				return new WP_Error(
					'path_traversal',
					sprintf(
						/* translators: %s: filename inside the archive */
						esc_html__( 'Archive contains a path-traversal entry: %s', 'bazaar' ),
						esc_html( $name )
					)
				);
			}

			$ext = strtolower( pathinfo( $name, PATHINFO_EXTENSION ) );

			// Forbidden server-executable extensions.
			if ( in_array( $ext, self::FORBIDDEN_EXTENSIONS, true ) ) {
				$zip->close();
				return new WP_Error(
					'forbidden_file_type',
					sprintf(
						/* translators: %s: filename found inside the archive */
						esc_html__( 'Server-executable files are not allowed in a ware archive. Found: %s', 'bazaar' ),
						esc_html( $name )
					)
				);
			}

			// Zip bomb: suspicious compression ratio on a single file.
			$compressed   = $stat['comp_size'];
			$uncompressed = $stat['size'];
			if ( $compressed > 0 && $uncompressed > 0 ) {
				$ratio = $uncompressed / $compressed;
				if ( $ratio > self::MAX_COMPRESSION_RATIO ) {
					$zip->close();
					return new WP_Error(
						'zip_bomb',
						sprintf(
							/* translators: 1: filename, 2: compression ratio */
							esc_html__( 'Suspicious compression ratio (%2$d:1) detected in file: %1$s', 'bazaar' ),
							esc_html( $name ),
							(int) $ratio
						)
					);
				}
			}

			$total_uncompressed += $uncompressed;
		}

		// 5. Total uncompressed size limit.
		$max = absint( get_option( 'bazaar_max_ware_size', BAZAAR_MAX_UNCOMPRESSED_SIZE ) );
		if ( $total_uncompressed > $max ) {
			$zip->close();
			return new WP_Error(
				'too_large',
				sprintf(
					/* translators: 1: uncompressed size in MB, 2: limit in MB */
					esc_html__( 'Ware is too large (%1$s MB uncompressed). Maximum is %2$s MB.', 'bazaar' ),
					number_format_i18n( $total_uncompressed / 1024 / 1024, 1 ),
					number_format_i18n( $max / 1024 / 1024, 1 )
				)
			);
		}

		// 6. manifest.json exists at archive root.
		$manifest_raw = $zip->getFromName( 'manifest.json' );
		if ( false === $manifest_raw ) {
			$zip->close();
			return new WP_Error(
				'missing_manifest',
				esc_html__( 'manifest.json not found at the archive root.', 'bazaar' )
			);
		}

		// 7. Parse manifest.
		$manifest = json_decode( $manifest_raw, true );
		if ( ! is_array( $manifest ) ) {
			$zip->close();
			return new WP_Error(
				'invalid_manifest',
				esc_html__( 'manifest.json is not valid JSON.', 'bazaar' )
			);
		}

		// 8. Required fields.
		foreach ( array( 'name', 'slug', 'version' ) as $field ) {
			if ( empty( $manifest[ $field ] ) || ! is_string( $manifest[ $field ] ) ) {
				$zip->close();
				return new WP_Error(
					'missing_manifest_field',
					sprintf(
						/* translators: %s: field name */
						esc_html__( 'manifest.json is missing required field: %s', 'bazaar' ),
						esc_html( $field )
					)
				);
			}
		}

		// 9. Slug format: lowercase letters, numbers, hyphens only.
		if ( ! preg_match( '/^[a-z0-9-]+$/', $manifest['slug'] ) ) {
			$zip->close();
			return new WP_Error(
				'invalid_slug',
				esc_html__( 'Ware slug must contain only lowercase letters, numbers, and hyphens.', 'bazaar' )
			);
		}

		// 10. Slug uniqueness.
		if ( $this->registry->exists( $manifest['slug'] ) ) {
			$zip->close();
			return new WP_Error(
				'slug_exists',
				sprintf(
					/* translators: %s: ware slug */
					esc_html__( 'A ware with slug "%s" is already installed. Delete it before re-uploading.', 'bazaar' ),
					esc_html( $manifest['slug'] )
				)
			);
		}

		// 11. Entry file exists in archive.
		$entry = $manifest['entry'] ?? 'index.html';
		if ( false === $zip->getFromName( $entry ) ) {
			$zip->close();
			return new WP_Error(
				'missing_entry',
				sprintf(
					/* translators: %s: entry filename from manifest.json */
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
	 * @param string $slug Ware slug whose files should be deleted.
	 * @return true|WP_Error
	 */
	public function delete( string $slug ): bool|WP_Error {
		$slug     = sanitize_key( $slug );
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
				sprintf(
					/* translators: %s: ware slug */
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
	 * Atomically extract the ZIP archive to wp-content/bazaar/{slug}/.
	 *
	 * Strategy: extract to a uniquely-named temp directory first, then rename
	 * to the final destination. This prevents a partially-extracted ware from
	 * being visible to the registry or the file server during installation.
	 *
	 * @param string $tmp_path Absolute path to the uploaded ZIP file.
	 * @param string $slug     Sanitized ware slug used as the destination directory name.
	 * @return true|WP_Error
	 */
	private function extract( string $tmp_path, string $slug ): bool|WP_Error {
		$slug     = sanitize_key( $slug );
		$dest_dir = BAZAAR_WARES_DIR . $slug . '/';
		$temp_dir = BAZAAR_WARES_DIR . '.tmp-' . $slug . '-' . wp_generate_password( 8, false ) . '/';

		$filesystem = $this->get_filesystem();
		if ( is_wp_error( $filesystem ) ) {
			return $filesystem;
		}

		// Create the staging temp directory.
		if ( ! $filesystem->mkdir( $temp_dir, FS_CHMOD_DIR ) ) {
			return new WP_Error(
				'extract_mkdir_failed',
				esc_html__( 'Could not create staging directory for extraction.', 'bazaar' )
			);
		}

		if ( ! function_exists( 'unzip_file' ) ) {
			require_once ABSPATH . 'wp-admin/includes/file.php';
		}

		$result = unzip_file( $tmp_path, $temp_dir );
		if ( is_wp_error( $result ) ) {
			$filesystem->delete( $temp_dir, true );
			return $result;
		}

		// Remove stale destination if it exists (e.g. a --force reinstall).
		if ( $filesystem->is_dir( $dest_dir ) ) {
			$filesystem->delete( $dest_dir, true );
		}

		// Move staging dir to final location via WP_Filesystem.
		if ( ! $filesystem->move( $temp_dir, $dest_dir ) ) {
			$filesystem->delete( $temp_dir, true );
			return new WP_Error(
				'extract_rename_failed',
				esc_html__( 'Could not finalize ware installation.', 'bazaar' )
			);
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
