<?php
/**
 * Bazaar WP-CLI command — manage wares from the command line.
 *
 * @package Bazaar
 */

declare( strict_types=1 );

namespace Bazaar\CLI;

defined( 'ABSPATH' ) || exit;

use Bazaar\WareLoader;
use Bazaar\WareRegistry;
use WP_CLI;
use WP_CLI\Utils;

/**
 * Manage Bazaar wares from the command line.
 *
 * ## EXAMPLES
 *
 *     # List all installed wares
 *     $ wp bazaar list
 *
 *     # Install a ware from a .wp file
 *     $ wp bazaar install invoice-generator.wp
 *
 *     # Enable a disabled ware
 *     $ wp bazaar enable invoice-generator
 *
 * @package Bazaar
 */
final class BazaarCommand {

	/**
	 * Registry used for all ware lookups and state changes.
	 *
	 * @var WareRegistry
	 */
	private WareRegistry $registry;

	/**
	 * Loader used for install, validate, and delete operations.
	 *
	 * @var WareLoader
	 */
	private WareLoader $loader;

	/**
	 * Constructor — wires up registry and loader.
	 */
	public function __construct() {
		$this->registry = new WareRegistry();
		$this->loader   = new WareLoader( $this->registry );
	}

	// -------------------------------------------------------------------------
	// wp bazaar list
	// -------------------------------------------------------------------------

	/**
	 * List all installed wares.
	 *
	 * ## OPTIONS
	 *
	 * [--status=<status>]
	 * : Filter by status. Accepts: enabled, disabled, all.
	 * ---
	 * default: all
	 * options:
	 *   - all
	 *   - enabled
	 *   - disabled
	 * ---
	 *
	 * [--format=<format>]
	 * : Render output in a particular format.
	 * ---
	 * default: table
	 * options:
	 *   - table
	 *   - json
	 *   - csv
	 *   - yaml
	 *   - count
	 * ---
	 *
	 * [--fields=<fields>]
	 * : Comma-separated list of fields to include in output.
	 *
	 * ## EXAMPLES
	 *
	 *     $ wp bazaar list
	 *     $ wp bazaar list --status=enabled --format=json
	 *
	 * @subcommand list
	 * @when after_wp_load
	 *
	 * @param string[]             $args       Positional arguments (unused).
	 * @param array<string, mixed> $assoc_args Named flags passed by WP-CLI.
	 */
	public function list_wares( array $args, array $assoc_args ): void {
		$status = Utils\get_flag_value( $assoc_args, 'status', 'all' );
		$wares  = $this->registry->get_all();

		if ( 'enabled' === $status ) {
			$wares = array_filter( $wares, static fn( $w ) => ! empty( $w['enabled'] ) );
		} elseif ( 'disabled' === $status ) {
			$wares = array_filter( $wares, static fn( $w ) => empty( $w['enabled'] ) );
		}

		if ( empty( $wares ) ) {
			WP_CLI::line( 'No wares found.' );
			return;
		}

		$rows = array_map(
			static fn( $w ) => array(
				'slug'      => $w['slug'],
				'name'      => $w['name'],
				'version'   => $w['version'],
				'author'    => $w['author'] ?? '',
				'status'    => ! empty( $w['enabled'] ) ? 'enabled' : 'disabled',
				'installed' => $w['installed'] ?? '',
			),
			$wares
		);

		$default_fields = array( 'slug', 'name', 'version', 'author', 'status' );
		$fields         = Utils\get_flag_value( $assoc_args, 'fields', implode( ',', $default_fields ) );

		Utils\format_items(
			Utils\get_flag_value( $assoc_args, 'format', 'table' ),
			array_values( $rows ),
			explode( ',', $fields )
		);
	}

	// -------------------------------------------------------------------------
	// wp bazaar install
	// -------------------------------------------------------------------------

	/**
	 * Install a ware from a .wp file.
	 *
	 * ## OPTIONS
	 *
	 * <file>
	 * : Path to the .wp file to install.
	 *
	 * [--force]
	 * : Re-install even if a ware with the same slug is already installed
	 *   (deletes the existing ware first).
	 *
	 * ## EXAMPLES
	 *
	 *     $ wp bazaar install invoice-generator.wp
	 *     $ wp bazaar install ~/wares/project-tracker.wp --force
	 *
	 * @when after_wp_load
	 *
	 * @param string[]             $args       Positional arguments: $args[0] is the .wp file path.
	 * @param array<string, mixed> $assoc_args Named flags passed by WP-CLI (--force).
	 */
	public function install( array $args, array $assoc_args ): void {
		if ( empty( $args[0] ) ) {
			WP_CLI::error( 'Please provide the path to a .wp file.' );
		}

		$file_path = realpath( $args[0] );

		if ( false === $file_path || ! is_file( $file_path ) ) {
			WP_CLI::error( "File not found: {$args[0]}" );
		}

		$filename = basename( $file_path );
		$force    = (bool) Utils\get_flag_value( $assoc_args, 'force', false );

		// Pre-validate to get the slug before deciding on --force.
		$manifest = $this->loader->validate( $file_path, $filename );
		if ( is_wp_error( $manifest ) ) {
			WP_CLI::error( $manifest->get_error_message() );
		}

		$slug = $manifest['slug'];

		if ( $this->registry->exists( $slug ) ) {
			if ( ! $force ) {
				WP_CLI::error( "Ware \"{$slug}\" is already installed. Use --force to replace it." );
			}
			WP_CLI::log( "Removing existing ware \"{$slug}\"..." );
			$deleted = $this->loader->delete( $slug );
			if ( is_wp_error( $deleted ) ) {
				WP_CLI::error( $deleted->get_error_message() );
			}
			$this->registry->unregister( $slug );
		}

		WP_CLI::log( "Installing \"{$manifest['name']}\"..." );

		$result = $this->loader->install( $file_path, $filename );
		if ( is_wp_error( $result ) ) {
			WP_CLI::error( $result->get_error_message() );
		}

		$registered = $this->registry->register( $result );
		if ( ! $registered ) {
			WP_CLI::error( 'Ware installed but could not be added to the registry.' );
		}

		WP_CLI::success( "Installed \"{$manifest['name']}\" ({$slug} v{$manifest['version']})." );
	}

	// -------------------------------------------------------------------------
	// wp bazaar enable
	// -------------------------------------------------------------------------

	/**
	 * Enable an installed ware.
	 *
	 * ## OPTIONS
	 *
	 * <slug>
	 * : The ware slug to enable.
	 *
	 * ## EXAMPLES
	 *
	 *     $ wp bazaar enable invoice-generator
	 *
	 * @when after_wp_load
	 *
	 * @param string[] $args Positional arguments: $args[0] is the ware slug.
	 */
	public function enable( array $args ): void {
		$slug = sanitize_key( $args[0] ?? '' );
		if ( '' === $slug ) {
			WP_CLI::error( 'Please provide a ware slug.' );
		}

		if ( ! $this->registry->exists( $slug ) ) {
			WP_CLI::error( "Ware \"{$slug}\" not found." );
		}

		if ( ! $this->registry->enable( $slug ) ) {
			WP_CLI::error( "Could not enable \"{$slug}\"." );
		}

		WP_CLI::success( "Enabled \"{$slug}\"." );
	}

	// -------------------------------------------------------------------------
	// wp bazaar disable
	// -------------------------------------------------------------------------

	/**
	 * Disable an installed ware.
	 *
	 * ## OPTIONS
	 *
	 * <slug>
	 * : The ware slug to disable.
	 *
	 * ## EXAMPLES
	 *
	 *     $ wp bazaar disable invoice-generator
	 *
	 * @when after_wp_load
	 *
	 * @param string[] $args Positional arguments: $args[0] is the ware slug.
	 */
	public function disable( array $args ): void {
		$slug = sanitize_key( $args[0] ?? '' );
		if ( '' === $slug ) {
			WP_CLI::error( 'Please provide a ware slug.' );
		}

		if ( ! $this->registry->exists( $slug ) ) {
			WP_CLI::error( "Ware \"{$slug}\" not found." );
		}

		if ( ! $this->registry->disable( $slug ) ) {
			WP_CLI::error( "Could not disable \"{$slug}\"." );
		}

		WP_CLI::success( "Disabled \"{$slug}\"." );
	}

	// -------------------------------------------------------------------------
	// wp bazaar delete
	// -------------------------------------------------------------------------

	/**
	 * Delete a ware and remove its files.
	 *
	 * ## OPTIONS
	 *
	 * <slug>
	 * : The ware slug to delete.
	 *
	 * [--yes]
	 * : Skip the confirmation prompt.
	 *
	 * ## EXAMPLES
	 *
	 *     $ wp bazaar delete invoice-generator
	 *     $ wp bazaar delete invoice-generator --yes
	 *
	 * @when after_wp_load
	 *
	 * @param string[]             $args       Positional arguments: $args[0] is the ware slug.
	 * @param array<string, mixed> $assoc_args Named flags passed by WP-CLI (--yes).
	 */
	public function delete( array $args, array $assoc_args ): void {
		$slug = sanitize_key( $args[0] ?? '' );
		if ( '' === $slug ) {
			WP_CLI::error( 'Please provide a ware slug.' );
		}

		$ware = $this->registry->get( $slug );
		if ( null === $ware ) {
			WP_CLI::error( "Ware \"{$slug}\" not found." );
		}

		WP_CLI::confirm( "Delete \"{$ware['name']}\" and all its files?", $assoc_args );

		$deleted = $this->loader->delete( $slug );
		if ( is_wp_error( $deleted ) ) {
			WP_CLI::error( $deleted->get_error_message() );
		}

		$this->registry->unregister( $slug );
		WP_CLI::success( "Deleted \"{$slug}\"." );
	}

	// -------------------------------------------------------------------------
	// wp bazaar info
	// -------------------------------------------------------------------------

	/**
	 * Show details about an installed ware.
	 *
	 * ## OPTIONS
	 *
	 * <slug>
	 * : The ware slug to inspect.
	 *
	 * [--format=<format>]
	 * : Output format: table, json, yaml.
	 * ---
	 * default: table
	 * options:
	 *   - table
	 *   - json
	 *   - yaml
	 * ---
	 *
	 * ## EXAMPLES
	 *
	 *     $ wp bazaar info invoice-generator
	 *     $ wp bazaar info invoice-generator --format=json
	 *
	 * @when after_wp_load
	 *
	 * @param string[]             $args       Positional arguments: $args[0] is the ware slug.
	 * @param array<string, mixed> $assoc_args Named flags passed by WP-CLI (--format).
	 */
	public function info( array $args, array $assoc_args ): void {
		$slug = sanitize_key( $args[0] ?? '' );
		if ( '' === $slug ) {
			WP_CLI::error( 'Please provide a ware slug.' );
		}

		$ware = $this->registry->get( $slug );
		if ( null === $ware ) {
			WP_CLI::error( "Ware \"{$slug}\" not found." );
		}

		$format = Utils\get_flag_value( $assoc_args, 'format', 'table' );

		$rows = array(
			array(
				'Field' => 'slug',
				'Value' => $ware['slug'],
			),
			array(
				'Field' => 'name',
				'Value' => $ware['name'],
			),
			array(
				'Field' => 'version',
				'Value' => $ware['version'],
			),
			array(
				'Field' => 'author',
				'Value' => $ware['author'] ?? '',
			),
			array(
				'Field' => 'description',
				'Value' => $ware['description'] ?? '',
			),
			array(
				'Field' => 'status',
				'Value' => ! empty( $ware['enabled'] ) ? 'enabled' : 'disabled',
			),
			array(
				'Field' => 'entry',
				'Value' => $ware['entry'] ?? 'index.html',
			),
			array(
				'Field' => 'menu_title',
				'Value' => $ware['menu']['title'] ?? '',
			),
			array(
				'Field' => 'capability',
				'Value' => $ware['menu']['capability'] ?? 'manage_options',
			),
			array(
				'Field' => 'installed',
				'Value' => $ware['installed'] ?? '',
			),
		);

		Utils\format_items( $format, $rows, array( 'Field', 'Value' ) );
	}
}
