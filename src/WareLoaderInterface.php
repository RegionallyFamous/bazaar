<?php
/**
 * Interface for the ware loader.
 *
 * Defining behaviour through an interface lets UploadController and other
 * consumers depend on the abstraction rather than the concrete class,
 * which makes unit testing straightforward without removing the `final`
 * keyword from the production implementation.
 *
 * @package Bazaar
 */

declare( strict_types=1 );

namespace Bazaar;

use WP_Error;

/**
 * Describes the public contract for installing and deleting wares on disk.
 */
interface WareLoaderInterface {

	/**
	 * Validate and install a .wp archive.
	 *
	 * @param string $tmp_path      Absolute path to the uploaded temp file.
	 * @param string $original_name Original filename (used for extension check).
	 * @return array<string, mixed>|WP_Error Parsed manifest on success, WP_Error on failure.
	 */
	public function install( string $tmp_path, string $original_name ): array|WP_Error;

	/**
	 * Convenience wrapper — install a .wp archive when the filename equals basename($path).
	 * Used by the bundler, where files are already staged under their final name.
	 *
	 * @param string $path Absolute path to the .wp archive.
	 * @return array<string, mixed>|WP_Error Parsed manifest on success, WP_Error on failure.
	 */
	public function install_from_path( string $path ): array|WP_Error;

	/**
	 * Delete an installed ware's files from disk.
	 *
	 * @param string $slug Ware slug.
	 * @return bool|WP_Error True on success, WP_Error on failure.
	 */
	public function delete( string $slug ): bool|WP_Error;
}
