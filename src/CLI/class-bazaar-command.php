<?php
/**
 * Bazaar WP-CLI command — manage wares from the command line.
 *
 * @package Bazaar
 */

declare( strict_types=1 );

namespace Bazaar\CLI;

defined( 'ABSPATH' ) || exit;

use Bazaar\RemoteRegistry;
use Bazaar\WareLoader;
use Bazaar\WareRegistry;
use Bazaar\WareUpdater;
use Bazaar\WareSigner;
use Bazaar\WareLicense;
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
	 * Fetches ware packages from the remote registry.
	 *
	 * @var RemoteRegistry
	 */
	private RemoteRegistry $remote;

	/**
	 * Checks for and applies ware updates.
	 *
	 * @var WareUpdater
	 */
	private WareUpdater $updater;

	/**
	 * Signs and verifies ware package signatures.
	 *
	 * @var WareSigner
	 */
	private WareSigner $signer;

	/**
	 * Manages per-ware license keys.
	 *
	 * @var WareLicense
	 */
	private WareLicense $license;

	/**
	 * Constructor — wires up registry, loader, remote, updater, signer, and license.
	 */
	public function __construct() {
		$this->registry = new WareRegistry();
		$this->loader   = new WareLoader( $this->registry );
		$this->remote   = new RemoteRegistry();
		$this->updater  = new WareUpdater( $this->registry, $this->remote, $this->loader );
		$this->signer   = new WareSigner();
		$this->license  = new WareLicense();
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

	// -------------------------------------------------------------------------
	// wp bazaar dev
	// -------------------------------------------------------------------------

	/**
	 * Manage dev mode — point a ware at a local dev server for live reload.
	 *
	 * ## SYNOPSIS
	 *
	 *     wp bazaar dev <action> <slug> [<url>]
	 *
	 * ## OPTIONS
	 *
	 * <action>
	 * : What to do.
	 * ---
	 * options:
	 *   - start
	 *   - stop
	 * ---
	 *
	 * <slug>
	 * : The ware slug to target.
	 *
	 * [<url>]
	 * : (Required for "start") The local dev server URL, e.g. http://localhost:5173.
	 *
	 * ## DESCRIPTION
	 *
	 * When dev mode is active, the ware's iframe points directly at your local
	 * Vite (or any other) dev server instead of the Bazaar REST file server.
	 * Changes are visible in wp-admin the moment you save — no packaging step.
	 *
	 * Dev mode is only honoured when WP_DEBUG is true. On production sites the
	 * dev_url field is silently ignored and the installed .wp files are used.
	 *
	 * ## EXAMPLES
	 *
	 *     # Start dev mode — link my-ware to the Vite dev server
	 *     $ wp bazaar dev start my-ware http://localhost:5173
	 *
	 *     # Stop dev mode — return to the installed .wp files
	 *     $ wp bazaar dev stop my-ware
	 *
	 * @subcommand dev
	 * @when after_wp_load
	 *
	 * @param string[]             $args       Positional arguments.
	 * @param array<string, mixed> $assoc_args Named flags (unused).
	 */
	public function dev( array $args, array $assoc_args ): void { // phpcs:ignore Generic.CodeAnalysis.UnusedFunctionParameter.FoundAfterLastUsed -- WP-CLI requires the second parameter in the signature
		$action = $args[0] ?? '';
		$slug   = sanitize_key( $args[1] ?? '' );

		if ( '' === $slug ) {
			WP_CLI::error( __( 'Please provide a ware slug.', 'bazaar' ) );
			return;
		}

		if ( ! $this->registry->exists( $slug ) ) {
			WP_CLI::error(
				sprintf(
					/* translators: %s: ware slug */
					__( 'Ware "%s" not found.', 'bazaar' ),
					$slug
				)
			);
			return;
		}

		switch ( $action ) {
			case 'start':
				$this->dev_start( $slug, $args[2] ?? '' );
				break;

			case 'stop':
				$this->dev_stop( $slug );
				break;

			default:
				WP_CLI::error(
					sprintf(
						/* translators: %s: the unknown action the user typed */
						__( 'Unknown action "%s". Use: wp bazaar dev start <slug> <url>', 'bazaar' ),
						$action
					)
				);
		}
	}

	/**
	 * Activate dev mode by storing the local dev server URL.
	 *
	 * @param string $slug Ware slug.
	 * @param string $url  Local dev server URL.
	 */
	private function dev_start( string $slug, string $url ): void {
		if ( '' === $url ) {
			WP_CLI::error( __( 'Please provide the dev server URL, e.g. http://localhost:5173.', 'bazaar' ) );
			return;
		}

		if ( ! filter_var( $url, FILTER_VALIDATE_URL ) ) {
			WP_CLI::error(
				sprintf(
					/* translators: %s: URL provided by the user */
					__( '"%s" is not a valid URL.', 'bazaar' ),
					$url
				)
			);
			return;
		}

		if ( ! $this->registry->set_dev_url( $slug, $url ) ) {
			WP_CLI::error(
				sprintf(
					/* translators: %s: ware slug */
					__( 'Could not set dev URL for "%s".', 'bazaar' ),
					$slug
				)
			);
			return;
		}

		$debug_status = ( defined( 'WP_DEBUG' ) && WP_DEBUG )
			? __( 'WP_DEBUG is true — dev mode will be active immediately.', 'bazaar' )
			: __( 'Note: WP_DEBUG is false on this site. Set WP_DEBUG=true for dev mode to take effect.', 'bazaar' );

		WP_CLI::success(
			sprintf(
				/* translators: 1: ware slug, 2: dev server URL */
				__( 'Dev mode started for "%1$s" → %2$s', 'bazaar' ),
				$slug,
				$url
			)
		);
		WP_CLI::line( $debug_status );
		WP_CLI::line(
			sprintf(
				/* translators: %s: ware slug */
				__( 'Stop with: wp bazaar dev stop %s', 'bazaar' ),
				$slug
			)
		);
	}

	/**
	 * Deactivate dev mode, returning the ware to its installed files.
	 *
	 * @param string $slug Ware slug.
	 */
	private function dev_stop( string $slug ): void {
		if ( ! $this->registry->clear_dev_url( $slug ) ) {
			WP_CLI::error(
				sprintf(
					/* translators: %s: ware slug */
					__( 'Could not clear dev URL for "%s" (was it in dev mode?).', 'bazaar' ),
					$slug
				)
			);
			return;
		}

		WP_CLI::success(
			sprintf(
				/* translators: %s: ware slug */
				__( 'Dev mode stopped for "%s". Ware is back on its installed files.', 'bazaar' ),
				$slug
			)
		);
	}

	// -------------------------------------------------------------------------
	// wp bazaar search
	// -------------------------------------------------------------------------

	/**
	 * Search the remote ware registry.
	 *
	 * ## OPTIONS
	 *
	 * [<query>]
	 * : Search term. Omit to list all available wares.
	 *
	 * [--format=<format>]
	 * : Output format: table, json, csv, yaml.
	 * ---
	 * default: table
	 * ---
	 *
	 * ## EXAMPLES
	 *
	 *     $ wp bazaar search crm
	 *     $ wp bazaar search --format=json
	 *
	 * @when after_wp_load
	 *
	 * @param string[]             $args       Positional arguments.
	 * @param array<string, mixed> $assoc_args Named flags.
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

	// -------------------------------------------------------------------------
	// wp bazaar get-from-registry
	// -------------------------------------------------------------------------

	/**
	 * Install a ware directly from the remote registry.
	 *
	 * ## OPTIONS
	 *
	 * <slug>
	 * : The ware slug to install from the registry.
	 *
	 * ## EXAMPLES
	 *
	 *     $ wp bazaar get-from-registry crm
	 *
	 * @subcommand get-from-registry
	 * @when after_wp_load
	 *
	 * @param string[] $args Positional arguments: $args[0] is the slug.
	 */
	public function get_from_registry( array $args ): void {
		$slug = sanitize_key( $args[0] ?? '' );
		if ( '' === $slug ) {
			WP_CLI::error( __( 'Please provide a ware slug.', 'bazaar' ) );
		}

		if ( $this->registry->exists( $slug ) ) {
			/* translators: %s: ware slug */
			WP_CLI::error( sprintf( __( 'Ware "%s" is already installed. Use wp bazaar update to upgrade.', 'bazaar' ), $slug ) );
		}

		/* translators: %s: ware slug */
		WP_CLI::log( sprintf( __( 'Downloading "%s" from registry…', 'bazaar' ), $slug ) );

		$manifest = $this->remote->install( $slug, $this->loader, $this->registry );
		if ( is_wp_error( $manifest ) ) {
			WP_CLI::error( $manifest->get_error_message() );
			return;
		}

		WP_CLI::success(
			sprintf(
				/* translators: 1: ware name, 2: ware slug, 3: version string */
				__( 'Installed "%1$s" (%2$s v%3$s) from registry.', 'bazaar' ),
				$manifest['name'],
				$slug,
				$manifest['version']
			)
		);
	}

	// -------------------------------------------------------------------------
	// wp bazaar outdated
	// -------------------------------------------------------------------------

	/**
	 * List installed wares with available updates.
	 *
	 * ## OPTIONS
	 *
	 * [--format=<format>]
	 * : Output format: table, json, csv.
	 * ---
	 * default: table
	 * ---
	 *
	 * [--refresh]
	 * : Force a fresh check against the registry (ignores cached results).
	 *
	 * ## EXAMPLES
	 *
	 *     $ wp bazaar outdated
	 *     $ wp bazaar outdated --refresh
	 *
	 * @when after_wp_load
	 *
	 * @param string[]             $args       Positional arguments (unused).
	 * @param array<string, mixed> $assoc_args Named flags.
	 */
	public function outdated( array $args, array $assoc_args ): void { // phpcs:ignore Generic.CodeAnalysis.UnusedFunctionParameter.FoundInExtendedClass
		$refresh  = (bool) Utils\get_flag_value( $assoc_args, 'refresh', false );
		$outdated = $refresh ? $this->updater->run_check() : $this->updater->get_outdated();

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

	// -------------------------------------------------------------------------
	// wp bazaar update
	// -------------------------------------------------------------------------

	/**
	 * Update one or all wares to their latest registry versions.
	 *
	 * ## OPTIONS
	 *
	 * [<slug>]
	 * : Ware slug to update. Omit when using --all.
	 *
	 * [--all]
	 * : Update every outdated ware.
	 *
	 * ## EXAMPLES
	 *
	 *     $ wp bazaar update crm
	 *     $ wp bazaar update --all
	 *
	 * @when after_wp_load
	 *
	 * @param string[]             $args       Positional arguments.
	 * @param array<string, mixed> $assoc_args Named flags.
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

	// -------------------------------------------------------------------------
	// wp bazaar scaffold
	// -------------------------------------------------------------------------

	/**
	 * Generate boilerplate code for a new PHP REST endpoint + client fetch.
	 *
	 * ## OPTIONS
	 *
	 * <name>
	 * : The endpoint name in camelCase, e.g. contactList or invoiceStatus.
	 *
	 * [--namespace=<namespace>]
	 * : PHP namespace prefix.
	 * ---
	 * default: MyWare
	 * ---
	 *
	 * [--route=<route>]
	 * : REST route pattern, relative to your ware's namespace.
	 * ---
	 * default: /items
	 * ---
	 *
	 * ## EXAMPLES
	 *
	 *     $ wp bazaar scaffold endpoint contactList
	 *     $ wp bazaar scaffold endpoint invoiceStatus --route=/invoices/status
	 *
	 * @subcommand scaffold
	 * @when after_wp_load
	 *
	 * @param string[]             $args       Positional arguments: $args[0] = name.
	 * @param array<string, mixed> $assoc_args Named flags.
	 */
	public function scaffold( array $args, array $assoc_args ): void {
		$name      = $args[0] ?? '';
		$action    = $args[1] ?? 'endpoint'; // Only 'endpoint' is supported for now.
		$namespace = sanitize_text_field( Utils\get_flag_value( $assoc_args, 'namespace', 'MyWare' ) );
		$route     = sanitize_text_field( Utils\get_flag_value( $assoc_args, 'route', '/items' ) );

		if ( '' === $name ) {
			WP_CLI::error( __( 'Usage: wp bazaar scaffold endpoint <name>', 'bazaar' ) );
		}

		$class_name = ucfirst( $name ) . 'Controller';
		$slug_name  = strtolower( preg_replace( '/([a-z])([A-Z])/', '$1-$2', $name ) ?? $name );
		$ts_fn_name = lcfirst( $name );
		$ns_slug    = strtolower( $namespace );

		$php = <<<PHP
<?php
/**
 * REST controller for {$name}.
 * Generated by: wp bazaar scaffold endpoint {$name}
 */

declare( strict_types=1 );

namespace {$namespace}\\REST;

use WP_REST_Controller;
use WP_REST_Server;
use WP_REST_Request;
use WP_REST_Response;

final class {$class_name} extends WP_REST_Controller {

	protected \$namespace = '{$ns_slug}/v1';
	protected \$rest_base = '{$slug_name}';

	public function register_routes(): void {
		register_rest_route( \$this->namespace, "/{$route}", [
			[
				'methods'             => WP_REST_Server::READABLE,
				'callback'            => [ \$this, 'get_items' ],
				'permission_callback' => [ \$this, 'auth' ],
			],
		] );
	}

	public function auth(): bool {
		return current_user_can( 'manage_options' );
	}

	public function get_items( WP_REST_Request \$request ): WP_REST_Response {
		// TODO: implement business logic
		return new WP_REST_Response( [], 200 );
	}
}
PHP;

		$ts = <<<TS
import { wpFetch } from '@bazaar/client';

export interface {$class_name}Response {
  // TODO: define response shape
  items: unknown[];
}

export async function {$ts_fn_name}(): Promise<{$class_name}Response> {
  return wpFetch<{$class_name}Response>( `/{$ns_slug}/v1{$route}` );
}
TS;

		$php_file = getcwd() . "/{$class_name}.php";
		$ts_file  = getcwd() . "/{$ts_fn_name}.ts";

		file_put_contents( $php_file, $php ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents,WordPress.WP.AlternativeFunctions.file_system_operations_file_get_contents,WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents -- WP_Filesystem is not available in WP-CLI context
		file_put_contents( $ts_file, $ts ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents,WordPress.WP.AlternativeFunctions.file_system_operations_file_get_contents,WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents -- WP_Filesystem is not available in WP-CLI context

		/* translators: %s: path to generated PHP file */
		WP_CLI::success( sprintf( __( 'Created %s', 'bazaar' ), $php_file ) );
		/* translators: %s: path to generated TypeScript file */
		WP_CLI::success( sprintf( __( 'Created %s', 'bazaar' ), $ts_file ) );
		WP_CLI::line( __( 'Register the controller in your plugin bootstrap with:', 'bazaar' ) );
		WP_CLI::line( "  add_action( 'rest_api_init', fn() => (new {$namespace}\\REST\\{$class_name}())->register_routes() );" );
	}

	// -------------------------------------------------------------------------
	// wp bazaar sign
	// -------------------------------------------------------------------------

	/**
	 * Sign a .wp archive with an RSA private key.
	 *
	 * ## OPTIONS
	 *
	 * <file>
	 * : Path to the .wp archive to sign.
	 *
	 * [--key=<key>]
	 * : Path to the PEM private key. Defaults to ./private.pem.
	 *
	 * [--passphrase=<passphrase>]
	 * : Passphrase for the private key (if encrypted).
	 *
	 * ## EXAMPLES
	 *
	 *     $ wp bazaar sign my-ware.wp --key=private.pem
	 *
	 * @when after_wp_load
	 *
	 * @param string[]             $args       Positional arguments.
	 * @param array<string, mixed> $assoc_args Named flags.
	 */
	public function sign( array $args, array $assoc_args ): void {
		$realpath   = realpath( $args[0] ?? '' );
		$file       = $realpath ? $realpath : '';
		$key_path   = Utils\get_flag_value( $assoc_args, 'key', 'private.pem' );
		$passphrase = (string) Utils\get_flag_value( $assoc_args, 'passphrase', '' );

		if ( '' === $file || ! is_file( $file ) ) {
			WP_CLI::error( __( 'Archive file not found.', 'bazaar' ) );
		}

		$sig = $this->signer->sign( $file, $key_path, $passphrase );
		if ( is_wp_error( $sig ) ) {
			WP_CLI::error( $sig->get_error_message() );
			return;
		}

		WP_CLI::line( __( 'Signature (base64):', 'bazaar' ) );
		WP_CLI::line( $sig );
		WP_CLI::line( '' );
		WP_CLI::line( __( 'Add this to your manifest.json:', 'bazaar' ) );
		WP_CLI::line( '  "signature": "' . $sig . '"' );
	}

	// -------------------------------------------------------------------------
	// wp bazaar keypair
	// -------------------------------------------------------------------------

	/**
	 * Generate a new RSA-2048 signing keypair.
	 *
	 * ## OPTIONS
	 *
	 * [--output=<dir>]
	 * : Directory to write private.pem and public.pem.
	 * ---
	 * default: .
	 * ---
	 *
	 * ## EXAMPLES
	 *
	 *     $ wp bazaar keypair
	 *     $ wp bazaar keypair --output=./keys
	 *
	 * @when after_wp_load
	 *
	 * @param string[]             $args       Positional arguments (unused).
	 * @param array<string, mixed> $assoc_args Named flags.
	 */
	public function keypair( array $args, array $assoc_args ): void { // phpcs:ignore Generic.CodeAnalysis.UnusedFunctionParameter.FoundInExtendedClass
		$dir = rtrim( Utils\get_flag_value( $assoc_args, 'output', '.' ), '/' );

		$pair = $this->signer->generate_keypair();
		if ( is_wp_error( $pair ) ) {
			WP_CLI::error( $pair->get_error_message() );
			return;
		}

		$priv_path = $dir . '/private.pem';
		$pub_path  = $dir . '/public.pem';

		file_put_contents( $priv_path, $pair['private'] ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents,WordPress.WP.AlternativeFunctions.file_system_operations_file_get_contents,WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents -- WP_Filesystem is not available in WP-CLI context
		file_put_contents( $pub_path, $pair['public'] ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents,WordPress.WP.AlternativeFunctions.file_system_operations_file_get_contents,WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents -- WP_Filesystem is not available in WP-CLI context
		chmod( $priv_path, 0600 ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_chmod -- WP_Filesystem does not expose chmod() in WP-CLI context

		/* translators: %s: path to private key file */
		WP_CLI::success( sprintf( __( 'Private key: %s (keep this secret!)', 'bazaar' ), $priv_path ) );
		/* translators: %s: path to public key file */
		WP_CLI::success( sprintf( __( 'Public key:  %s', 'bazaar' ), $pub_path ) );
		WP_CLI::line( __( 'Store the public key in Bazaar → Settings → Signing Public Key.', 'bazaar' ) );
	}

	// -------------------------------------------------------------------------
	// wp bazaar license
	// -------------------------------------------------------------------------

	/**
	 * Manage license keys for paid wares.
	 *
	 * ## SYNOPSIS
	 *
	 *     wp bazaar license <action> <slug> [<key>]
	 *
	 * ## OPTIONS
	 *
	 * <action>
	 * : Action to perform.
	 * ---
	 * options:
	 *   - set
	 *   - check
	 *   - remove
	 * ---
	 *
	 * <slug>
	 * : Ware slug.
	 *
	 * [<key>]
	 * : License key (required for "set").
	 *
	 * ## EXAMPLES
	 *
	 *     $ wp bazaar license set crm XXXX-YYYY-ZZZZ
	 *     $ wp bazaar license check crm
	 *     $ wp bazaar license remove crm
	 *
	 * @when after_wp_load
	 *
	 * @param string[]             $args       Positional arguments.
	 * @param array<string, mixed> $assoc_args Named flags (unused).
	 */
	public function license( array $args, array $assoc_args ): void { // phpcs:ignore Generic.CodeAnalysis.UnusedFunctionParameter.FoundInExtendedClass,Generic.CodeAnalysis.UnusedFunctionParameter.FoundAfterLastUsed -- WP-CLI requires this signature
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
				$licensed = $this->license->is_licensed( $ware );
				$key      = $this->license->get_key( $slug );
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

	// -------------------------------------------------------------------------
	// wp bazaar analytics
	// -------------------------------------------------------------------------

	/**
	 * Show ware analytics from the command line.
	 *
	 * ## OPTIONS
	 *
	 * [<slug>]
	 * : Ware slug for per-ware breakdown. Omit for aggregate.
	 *
	 * [--days=<days>]
	 * : Number of days to look back.
	 * ---
	 * default: 30
	 * ---
	 *
	 * [--format=<format>]
	 * : Output format.
	 * ---
	 * default: table
	 * ---
	 *
	 * ## EXAMPLES
	 *
	 *     $ wp bazaar analytics
	 *     $ wp bazaar analytics crm --days=7
	 *
	 * @when after_wp_load
	 *
	 * @param string[]             $args       Positional arguments.
	 * @param array<string, mixed> $assoc_args Named flags.
	 */
	public function analytics( array $args, array $assoc_args ): void {
		global $wpdb;

		$slug   = sanitize_key( $args[0] ?? '' );
		$days   = absint( Utils\get_flag_value( $assoc_args, 'days', 30 ) );
		$format = Utils\get_flag_value( $assoc_args, 'format', 'table' );
		$since  = gmdate( 'Y-m-d H:i:s', (int) strtotime( "-{$days} days" ) );
		$table  = $wpdb->prefix . 'bazaar_analytics';

		if ( '' !== $slug ) {
			// phpcs:disable WordPress.DB.PreparedSQL.InterpolatedNotPrepared
			$rows = $wpdb->get_results(
				$wpdb->prepare(
					"SELECT DATE(created_at) AS day, COUNT(*) AS views, COALESCE(SUM(duration_ms),0) AS total_ms
				 FROM {$table} WHERE slug=%s AND event_type='view' AND created_at>=%s
				 GROUP BY DATE(created_at) ORDER BY day ASC",
					$slug,
					$since
				),
				ARRAY_A
			);
			// phpcs:enable
			$fields = array( 'day', 'views', 'total_ms' );
		} else {
			// phpcs:disable WordPress.DB.PreparedSQL.InterpolatedNotPrepared
			$rows = $wpdb->get_results(
				$wpdb->prepare(
					"SELECT slug, COUNT(*) AS views, COALESCE(SUM(duration_ms),0) AS total_ms, COUNT(DISTINCT user_id) AS unique_users
				 FROM {$table} WHERE event_type='view' AND created_at>=%s
				 GROUP BY slug ORDER BY total_ms DESC",
					$since
				),
				ARRAY_A
			);
			// phpcs:enable
			$fields = array( 'slug', 'views', 'total_ms', 'unique_users' );
		}

		if ( empty( $rows ) ) {
			/* translators: %d: number of days */
			WP_CLI::line( sprintf( __( 'No analytics data for the past %d days.', 'bazaar' ), $days ) );
			return;
		}

		Utils\format_items( $format, $rows, $fields );
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

	// =========================================================================
	// Doctor
	// =========================================================================

	/**
	 * Run a health-check suite and report any problems.
	 *
	 * ## OPTIONS
	 *
	 * [--slug=<slug>]
	 * : Check only this ware.
	 *
	 * [--format=<format>]
	 * : Output format (table, json, csv). Default: table.
	 *
	 * ## EXAMPLES
	 *
	 *     $ wp bazaar doctor
	 *     $ wp bazaar doctor --slug=invoice-generator
	 *
	 * @subcommand doctor
	 * @param array<int,string>    $args Description.
	 * @param array<string,string> $assoc_args Description.
	 */
	public function doctor( array $args, array $assoc_args ): void {
		$slug   = Utils\get_flag_value( $assoc_args, 'slug', '' );
		$format = Utils\get_flag_value( $assoc_args, 'format', 'table' );
		$wares  = $slug ? array_filter( array( $this->registry->get( $slug ) ) ) : $this->registry->get_all();
		$rows   = array();

		WP_CLI::log( '🩺 Running Bazaar doctor checks…' );

		foreach ( $wares as $ware ) {
			$s = $ware['slug'];

			// 1. Filesystem presence.
			$dir    = WP_CONTENT_DIR . "/bazaar-wares/{$s}";
			$exists = is_dir( $dir );
			$rows[] = array(
				'ware'   => $s,
				'check'  => 'filesystem',
				'status' => $exists ? 'ok' : 'error',
				'detail' => $exists ? 'Directory found' : "Missing: {$dir}",
			);

			// 2. Manifest parseable.
			$mf_path   = $dir . '/manifest.json';
			$mf_parsed = $exists && file_exists( $mf_path ) && is_array( json_decode( (string) file_get_contents( $mf_path ), true ) ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents,WordPress.WP.AlternativeFunctions.file_system_operations_file_get_contents,WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents -- WP_Filesystem is not available in WP-CLI context
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
			$has_ht   = file_exists( $htaccess ) && str_contains( (string) file_get_contents( $htaccess ), 'php_flag' ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents,WordPress.WP.AlternativeFunctions.file_system_operations_file_get_contents,WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents -- WP_Filesystem is not available in WP-CLI context
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

	// =========================================================================
	// Logs
	// =========================================================================

	/**
	 * Display the error log for a ware (or all wares).
	 *
	 * ## OPTIONS
	 *
	 * [<slug>]
	 * : Ware slug. Omit to show all.
	 *
	 * [--count=<n>]
	 * : Number of entries to show. Default: 25.
	 *
	 * [--format=<format>]
	 * : Output format. Default: table.
	 *
	 * ## EXAMPLES
	 *
	 *     $ wp bazaar logs
	 *     $ wp bazaar logs invoice-generator --count=50
	 *
	 * @param array<int,string>    $args Description.
	 * @param array<string,string> $assoc_args Description.
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

		$where = $slug ? $wpdb->prepare( 'WHERE slug = %s', sanitize_key( $slug ) ) : '';
		// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$rows = $wpdb->get_results( "SELECT id, slug, message, created_at FROM `{$table}` {$where} ORDER BY id DESC LIMIT {$count}", ARRAY_A ) ?? array();

		if ( ! $rows ) {
			WP_CLI::success( 'No error log entries.' );
			return; }
		Utils\format_items( $format, $rows, array( 'id', 'slug', 'message', 'created_at' ) );
	}

	// =========================================================================
	// Types
	// =========================================================================

	/**
	 * Generate TypeScript type declarations from a ware's manifest.
	 *
	 * Emits a `.d.ts` file containing types for the ware's config schema,
	 * declared bus events, and job IDs — useful for type-safe ware development.
	 *
	 * ## OPTIONS
	 *
	 * <slug>
	 * : Ware slug.
	 *
	 * [--out=<path>]
	 * : Output file path. Default: stdout.
	 *
	 * ## EXAMPLES
	 *
	 *     $ wp bazaar types invoice-generator
	 *     $ wp bazaar types invoice-generator --out=types/invoice-generator.d.ts
	 *
	 * @param array<int,string>    $args Description.
	 * @param array<string,string> $assoc_args Description.
	 */
	public function types( array $args, array $assoc_args ): void {
		if ( empty( $args[0] ) ) {
			WP_CLI::error( 'Please provide a ware slug.' );
		}
		$slug = sanitize_key( $args[0] );
		$ware = $this->registry->get( $slug );
		if ( null === $ware ) {
			WP_CLI::error( "Ware '{$slug}' not found." );
		}

		$lines = array( "// Auto-generated by: wp bazaar types {$slug}", '// Do not edit manually.', '', 'declare module \'@bazaar/wares/' . $slug . "' {" );

		// Config types.
		$settings = (array) ( $ware['settings'] ?? array() );
		if ( $settings ) {
			$lines[] = '  export interface Config {';
			foreach ( $settings as $field ) {
				$key  = $field['key'] ?? '';
				$type = match ( $field['type'] ?? 'text' ) {
					'number'   => 'number',
					'checkbox' => 'boolean',
					default    => 'string',
				};
				$opt     = empty( $field['required'] ) ? '?' : '';
				$lines[] = "    $key{$opt}: {$type};";
			}
			$lines[] = '  }';
			$lines[] = '';
		}

		// Bus events.
		$events = (array) ( $ware['events'] ?? array() );
		if ( $events ) {
			$lines[] = '  export type BusEvent =';
			$union   = array_map( fn( $e ) => "    | '" . addslashes( $e ) . "'", $events );
			$lines[] = implode( "\n", $union ) . ';';
			$lines[] = '';
		}

		// Job IDs.
		$jobs = (array) ( $ware['jobs'] ?? array() );
		if ( $jobs ) {
			$ids     = array_map( fn( $j ) => "'" . addslashes( $j['id'] ?? '' ) . "'", $jobs );
			$lines[] = '  export type JobId = ' . implode( ' | ', $ids ) . ';';
			$lines[] = '';
		}

		$lines[] = '}';
		$output  = implode( "\n", $lines ) . "\n";

		$out = Utils\get_flag_value( $assoc_args, 'out', '' );
		if ( $out ) {
			file_put_contents( $out, $output ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents,WordPress.WP.AlternativeFunctions.file_system_operations_file_get_contents,WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents -- WP_Filesystem is not available in WP-CLI context
			WP_CLI::success( "Types written to {$out}" );
		} else {
			WP_CLI::log( $output );
		}
	}

	// =========================================================================
	// Bundle
	// =========================================================================

	/**
	 * Install a .wpbundle collection file.
	 *
	 * ## OPTIONS
	 *
	 * <file>
	 * : Path to the .wpbundle file.
	 *
	 * ## EXAMPLES
	 *
	 *     $ wp bazaar bundle install my-bundle.wpbundle
	 *
	 * @subcommand bundle
	 * @param array<int,string>    $args Description.
	 * @param array<string,string> $assoc_args Description.
	 */
	public function bundle( array $args, array $assoc_args ): void { // phpcs:ignore Generic.CodeAnalysis.UnusedFunctionParameter.FoundAfterLastUsed -- WP-CLI requires the second parameter in the signature
		if ( empty( $args[0] ) ) {
			WP_CLI::error( 'Usage: wp bazaar bundle <file.wpbundle>' );
		}
		$path = $args[0];
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

		if ( empty( $result['errors'] ) ) {
			WP_CLI::success( 'Bundle installed successfully.' );
		} else {
			WP_CLI::warning( 'Bundle installed with errors. Run wp bazaar doctor for details.' );
		}
	}

	// =========================================================================
	// Audit
	// =========================================================================

	/**
	 * View the ware audit log.
	 *
	 * ## OPTIONS
	 *
	 * [<slug>]
	 * : Ware slug to filter by.
	 *
	 * [--event=<event>]
	 * : Filter by event type (install, uninstall, enable, disable, config_change…).
	 *
	 * [--count=<n>]
	 * : Number of entries to show. Default: 25.
	 *
	 * [--format=<format>]
	 * : Output format (table, json, csv). Default: table.
	 *
	 * ## EXAMPLES
	 *
	 *     $ wp bazaar audit
	 *     $ wp bazaar audit invoice-generator --event=install
	 *     $ wp bazaar audit --count=100 --format=json
	 *
	 * @param array<int,string>    $args Description.
	 * @param array<string,string> $assoc_args Description.
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

		$wheres = array();
		$values = array();
		if ( $slug ) {
			$wheres[] = 'slug = %s';
			$values[] = sanitize_key( $slug ); }
		if ( $event ) {
			$wheres[] = 'event = %s';
			$values[] = sanitize_text_field( $event ); }

		$where_sql = $wheres ? 'WHERE ' . implode( ' AND ', $wheres ) : '';

		if ( $values ) {
			// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared,WordPress.DB.PreparedSQLPlaceholders.UnfinishedPrepare -- $table is a trusted prefix-prefixed name; $count is a pre-validated int
			$rows = $wpdb->get_results( $wpdb->prepare( "SELECT id, slug, event, user_id, meta, created_at FROM `{$table}` {$where_sql} ORDER BY id DESC LIMIT {$count}", ...$values ), ARRAY_A ) ?? array();
		} else {
			// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
			$rows = $wpdb->get_results( "SELECT id, slug, event, user_id, meta, created_at FROM `{$table}` ORDER BY id DESC LIMIT {$count}", ARRAY_A ) ?? array();
		}

		if ( ! $rows ) {
			WP_CLI::success( 'No audit log entries.' );
			return; }
		Utils\format_items( $format, $rows, array( 'id', 'slug', 'event', 'user_id', 'meta', 'created_at' ) );
	}

	// =========================================================================
	// CSP
	// =========================================================================

	/**
	 * View or set per-ware Content Security Policy directives.
	 *
	 * ## OPTIONS
	 *
	 * <slug>
	 * : Ware slug.
	 *
	 * [--set=<json>]
	 * : JSON object of directive→sources to merge in. E.g. '{"connect-src":"'"'"'self'"'"' https://api.example.com"}'
	 *
	 * [--reset]
	 * : Reset CSP to the Bazaar baseline.
	 *
	 * ## EXAMPLES
	 *
	 *     $ wp bazaar csp invoice-generator
	 *     $ wp bazaar csp invoice-generator --set='{"connect-src":"'"'"'self'"'"' https://api.example.com"}'
	 *     $ wp bazaar csp invoice-generator --reset
	 *
	 * @param array<int,string>    $args Description.
	 * @param array<string,string> $assoc_args Description.
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
		$header = \Bazaar\REST\CspController::header_for( $slug );
		WP_CLI::log( '' );
		WP_CLI::log( WP_CLI::colorize( '%BContent-Security-Policy:%n' ) );
		WP_CLI::log( $header );
	}

	// =========================================================================
	// Private helpers
	// =========================================================================

	/**
	 * Recursively calculate directory size.
	 *
	 * @param string $path Directory path.
	 * @return int Total size in bytes.
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
