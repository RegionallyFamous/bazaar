<?php
/**
 * Loads UpdaterMcUpdateface for Bazaar plugin self-updates via GitHub Releases.
 *
 * The class ships under packages/updater-mcupdateface/ and is also resolvable
 * from vendor/ when Composer is used during development.
 *
 * @package Bazaar
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

// Guard against "Cannot declare class … already in use" when Composer (or another
// plugin) has already autoloaded the same class from vendor/ at a different realpath.
if ( ! class_exists( \RegionallyFamous\UpdaterMcUpdateface\UpdaterMcUpdateface::class, false ) ) {
	$bazaar_ghu_paths = array(
		__DIR__ . '/vendor/regionallyfamous/updater-mcupdateface/src/UpdaterMcUpdateface.php',
		__DIR__ . '/packages/updater-mcupdateface/src/UpdaterMcUpdateface.php',
	);

	foreach ( $bazaar_ghu_paths as $bazaar_ghu_file ) {
		if ( is_readable( $bazaar_ghu_file ) ) {
			require_once $bazaar_ghu_file;
			break;
		}
	}

	unset( $bazaar_ghu_paths, $bazaar_ghu_file );
}

if ( ! class_exists( 'GitHub_Plugin_Updater', false ) ) {
	class_alias( \RegionallyFamous\UpdaterMcUpdateface\UpdaterMcUpdateface::class, 'GitHub_Plugin_Updater' );
}
