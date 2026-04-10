<?php
/**
 * Bazaar CLI — Ware lifecycle commands.
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
 * Ware lifecycle commands: list, install, enable, disable, delete, search, outdated, update, info.
 */
trait WareLifecycleTrait {

	/**
	 * List installed wares, optionally filtered by status.
	 *
	 * @param array<int,string>    $args       Unused positional args.
	 * @param array<string,string> $assoc_args Named flags: --status (all|enabled|disabled), --format, --fields.
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
			WP_CLI::line( __( 'No wares found.', 'bazaar' ) );
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

	/**
	 * Install a ware from a .wp archive file.
	 *
	 * @param array<int,string>    $args       Positional args: path to .wp file.
	 * @param array<string,string> $assoc_args Named flags: --force to overwrite an existing ware.
	 */
	public function install( array $args, array $assoc_args ): void {
		if ( empty( $args[0] ) ) {
			WP_CLI::error( __( 'Please provide the path to a .wp file.', 'bazaar' ) );
		}

		$file_path = realpath( $args[0] );

		if ( false === $file_path || ! is_file( $file_path ) ) {
			WP_CLI::error(
				sprintf(
					/* translators: %s: file path provided by the user */
					__( 'File not found: %s', 'bazaar' ),
					$args[0]
				)
			);
			return;
		}

		$filename = basename( $file_path );
		$force    = (bool) Utils\get_flag_value( $assoc_args, 'force', false );

		// Pre-validate to get the slug before deciding on --force.
		$manifest = $this->loader->validate( $file_path, $filename );
		if ( is_wp_error( $manifest ) ) {
			WP_CLI::error( $manifest->get_error_message() );
			return;
		}

		$slug = $manifest['slug'];

		if ( $this->registry->exists( $slug ) ) {
			if ( ! $force ) {
				WP_CLI::error(
					sprintf(
						/* translators: %s: ware slug */
						__( 'Ware "%s" is already installed. Use --force to replace it.', 'bazaar' ),
						$slug
					)
				);
			}
			WP_CLI::log(
				sprintf(
					/* translators: %s: ware slug */
					__( 'Removing existing ware "%s"…', 'bazaar' ),
					$slug
				)
			);
			$deleted = $this->loader->delete( $slug );
			if ( is_wp_error( $deleted ) ) {
				WP_CLI::error( $deleted->get_error_message() );
			}
			$this->registry->unregister( $slug );
		}

		WP_CLI::log(
			sprintf(
				/* translators: %s: ware display name */
				__( 'Installing "%s"…', 'bazaar' ),
				$manifest['name']
			)
		);

		$result = $this->loader->install( $file_path, $filename );
		if ( is_wp_error( $result ) ) {
			WP_CLI::error( $result->get_error_message() );
			return;
		}

		$registered = $this->registry->register( $result );
		if ( ! $registered ) {
			WP_CLI::error( __( 'Ware installed but could not be added to the registry.', 'bazaar' ) );
		}

		WP_CLI::success(
			sprintf(
				/* translators: 1: ware display name, 2: ware slug, 3: version number */
				__( 'Installed "%1$s" (%2$s v%3$s).', 'bazaar' ),
				$manifest['name'],
				$slug,
				$manifest['version']
			)
		);
	}

	/**
	 * Enable an installed ware so it appears in the shell.
	 *
	 * @param array<int,string> $args Positional args: ware slug.
	 */
	public function enable( array $args ): void {
		$slug = sanitize_key( $args[0] ?? '' );
		if ( '' === $slug ) {
			WP_CLI::error( __( 'Please provide a ware slug.', 'bazaar' ) );
		}

		if ( ! $this->registry->exists( $slug ) ) {
			WP_CLI::error(
				sprintf(
					/* translators: %s: ware slug */
					__( 'Ware "%s" not found.', 'bazaar' ),
					$slug
				)
			);
		}

		if ( ! $this->registry->enable( $slug ) ) {
			WP_CLI::error(
				sprintf(
					/* translators: %s: ware slug */
					__( 'Could not enable "%s".', 'bazaar' ),
					$slug
				)
			);
		}

		WP_CLI::success(
			sprintf(
				/* translators: %s: ware slug */
				__( 'Enabled "%s".', 'bazaar' ),
				$slug
			)
		);
	}

	/**
	 * Disable an installed ware without removing its files.
	 *
	 * @param array<int,string> $args Positional args: ware slug.
	 */
	public function disable( array $args ): void {
		$slug = sanitize_key( $args[0] ?? '' );
		if ( '' === $slug ) {
			WP_CLI::error( __( 'Please provide a ware slug.', 'bazaar' ) );
		}

		if ( ! $this->registry->exists( $slug ) ) {
			WP_CLI::error(
				sprintf(
					/* translators: %s: ware slug */
					__( 'Ware "%s" not found.', 'bazaar' ),
					$slug
				)
			);
		}

		if ( ! $this->registry->disable( $slug ) ) {
			WP_CLI::error(
				sprintf(
					/* translators: %s: ware slug */
					__( 'Could not disable "%s".', 'bazaar' ),
					$slug
				)
			);
		}

		WP_CLI::success(
			sprintf(
				/* translators: %s: ware slug */
				__( 'Disabled "%s".', 'bazaar' ),
				$slug
			)
		);
	}

	/**
	 * Permanently delete a ware and remove all its files from disk.
	 *
	 * @param array<int,string>    $args       Positional args: ware slug.
	 * @param array<string,string> $assoc_args Named flags: --yes to skip the confirmation prompt.
	 */
	public function delete( array $args, array $assoc_args ): void {
		$slug = sanitize_key( $args[0] ?? '' );
		if ( '' === $slug ) {
			WP_CLI::error( __( 'Please provide a ware slug.', 'bazaar' ) );
		}

		$ware = $this->registry->get( $slug );
		if ( null === $ware ) {
			WP_CLI::error(
				sprintf(
					/* translators: %s: ware slug */
					__( 'Ware "%s" not found.', 'bazaar' ),
					$slug
				)
			);
			return;
		}

		WP_CLI::confirm(
			sprintf(
				/* translators: %s: ware display name */
				__( 'Delete "%s" and all its files?', 'bazaar' ),
				$ware['name']
			),
			$assoc_args
		);

		$deleted = $this->loader->delete( $slug );
		if ( is_wp_error( $deleted ) ) {
			WP_CLI::error( $deleted->get_error_message() );
		}

		$this->registry->unregister( $slug );
		WP_CLI::success(
			sprintf(
				/* translators: %s: ware slug */
				__( 'Deleted "%s".', 'bazaar' ),
				$slug
			)
		);
	}

	/**
	 * Search the remote registry for wares matching a keyword.
	 *
	 * @param array<int,string>    $args       Positional args: search query string.
	 * @param array<string,string> $assoc_args Named flags: --format.
	 */
	public function search( array $args, array $assoc_args ): void {
		$query   = $args[0] ?? '';
		$results = $this->remote->search( $query );

		if ( is_wp_error( $results ) ) {
			WP_CLI::error( $results->get_error_message() );
			return;
		}

		if ( empty( $results ) ) {
			WP_CLI::line( __( 'No wares found matching that query.', 'bazaar' ) );
			return;
		}

		$rows = array_map(
			static fn( $w ) => array(
				'slug'        => $w['slug'] ?? '',
				'name'        => $w['name'] ?? '',
				'version'     => $w['version'] ?? '',
				'author'      => $w['author'] ?? '',
				'description' => mb_strimwidth( $w['description'] ?? '', 0, 60, '…' ),
			),
			$results
		);

		Utils\format_items(
			Utils\get_flag_value( $assoc_args, 'format', 'table' ),
			$rows,
			array( 'slug', 'name', 'version', 'author', 'description' )
		);
	}

	/**
	 * List installed wares that have updates available in the remote registry.
	 *
	 * @param array<int,string>    $args       Optional slug to check a single ware.
	 * @param array<string,string> $assoc_args Named flags: --refresh (force re-check), --format.
	 */
	public function outdated( array $args, array $assoc_args ): void {
		$slug_filter = sanitize_key( $args[0] ?? '' );
		$refresh     = (bool) Utils\get_flag_value( $assoc_args, 'refresh', false );
		$outdated    = $refresh ? $this->updater->run_check() : $this->updater->get_outdated();

		if ( $slug_filter ) {
			$outdated = array_filter( $outdated, static fn( $s ) => $s === $slug_filter, ARRAY_FILTER_USE_KEY );
		}

		if ( empty( $outdated ) ) {
			WP_CLI::success( __( 'All wares are up to date.', 'bazaar' ) );
			return;
		}

		$rows = array();
		foreach ( $outdated as $slug => $info ) {
			$rows[] = array(
				'slug'    => $slug,
				'current' => $info['current'],
				'latest'  => $info['latest'],
			);
		}

		Utils\format_items(
			Utils\get_flag_value( $assoc_args, 'format', 'table' ),
			$rows,
			array( 'slug', 'current', 'latest' )
		);
	}

	/**
	 * Update one or all installed wares to their latest version.
	 *
	 * @param array<int,string>    $args       Positional args: ware slug (omit when using --all).
	 * @param array<string,string> $assoc_args Named flags: --all to update every ware at once.
	 */
	public function update( array $args, array $assoc_args ): void {
		$all = (bool) Utils\get_flag_value( $assoc_args, 'all', false );

		if ( $all ) {
			$results = $this->updater->update_all();
			foreach ( $results as $slug => $result ) {
				if ( is_wp_error( $result ) ) {
					/* translators: 1: ware slug, 2: error message */
					WP_CLI::warning( sprintf( __( 'Failed to update "%1\$s": %2\$s', 'bazaar' ), $slug, $result->get_error_message() ) );
				} else {
					/* translators: 1: ware slug, 2: version string */
					WP_CLI::success( sprintf( __( 'Updated "%1\$s" to v%2\$s.', 'bazaar' ), $slug, $result['version'] ?? '?' ) );
				}
			}
			return;
		}

		$slug = sanitize_key( $args[0] ?? '' );
		if ( '' === $slug ) {
			WP_CLI::error( __( 'Please provide a ware slug or use --all.', 'bazaar' ) );
		}

		/* translators: %s: ware slug */
		WP_CLI::log( sprintf( __( 'Updating "%s"…', 'bazaar' ), $slug ) );
		$result = $this->updater->update( $slug );

		if ( is_wp_error( $result ) ) {
			WP_CLI::error( $result->get_error_message() );
		} else {
			/* translators: 1: ware slug, 2: version string */
			WP_CLI::success( sprintf( __( 'Updated "%1$s" to v%2$s.', 'bazaar' ), $slug, $result['version'] ?? '?' ) );
		}
	}

	/**
	 * Show detailed metadata for a single installed ware.
	 *
	 * @param array<int,string>    $args       Positional args: ware slug.
	 * @param array<string,string> $assoc_args Named flags: --format.
	 */
	public function info( array $args, array $assoc_args ): void {
		$slug = sanitize_key( $args[0] ?? '' );
		if ( '' === $slug ) {
			WP_CLI::error( __( 'Please provide a ware slug.', 'bazaar' ) );
		}

		$ware = $this->registry->get( $slug );
		if ( null === $ware ) {
			WP_CLI::error(
				sprintf(
					/* translators: %s: ware slug */
					__( 'Ware "%s" not found.', 'bazaar' ),
					$slug
				)
			);
			return;
		}

		$format = Utils\get_flag_value( $assoc_args, 'format', 'table' );

		$rows = array(
			array(
				'Field' => __( 'slug', 'bazaar' ),
				'Value' => $ware['slug'],
			),
			array(
				'Field' => __( 'name', 'bazaar' ),
				'Value' => $ware['name'],
			),
			array(
				'Field' => __( 'version', 'bazaar' ),
				'Value' => $ware['version'],
			),
			array(
				'Field' => __( 'author', 'bazaar' ),
				'Value' => $ware['author'] ?? '',
			),
			array(
				'Field' => __( 'description', 'bazaar' ),
				'Value' => $ware['description'] ?? '',
			),
			array(
				'Field' => __( 'status', 'bazaar' ),
				'Value' => ! empty( $ware['enabled'] ) ? __( 'enabled', 'bazaar' ) : __( 'disabled', 'bazaar' ),
			),
			array(
				'Field' => __( 'entry', 'bazaar' ),
				'Value' => $ware['entry'] ?? 'index.html',
			),
			array(
				'Field' => __( 'menu_title', 'bazaar' ),
				'Value' => $ware['menu']['title'] ?? '',
			),
			array(
				'Field' => __( 'capability', 'bazaar' ),
				'Value' => $ware['menu']['capability'] ?? 'manage_options',
			),
			array(
				'Field' => __( 'installed', 'bazaar' ),
				'Value' => $ware['installed'] ?? '',
			),
		);

		Utils\format_items( $format, $rows, array( 'Field', 'Value' ) );
	}
}
