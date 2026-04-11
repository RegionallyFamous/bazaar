<?php
/**
 * Core Apps catalog endpoint.
 *
 * Fetches the first-party ware catalog from the bazaar GitHub repo and returns
 * it to the manage page so users can discover and install core apps in one click.
 *
 * The catalog JSON lives at:
 *   https://raw.githubusercontent.com/RegionallyFamous/bazaar/main/wares/registry.json
 *
 * It follows the same shape as the remote registry index, so each ware entry has:
 *   slug, name, description, version, author, icon_url, download_url, tags
 *
 * Results are cached for 1 hour in a transient to avoid hammering GitHub.
 *
 * Route
 * ─────
 *   GET /bazaar/v1/core-apps
 *
 * @package Bazaar
 */

declare( strict_types=1 );

namespace Bazaar\REST;

defined( 'ABSPATH' ) || exit;

use Bazaar\WareLoader;
use Bazaar\WareRegistry;
use Bazaar\REST\JobsController;
use WP_REST_Server;
use WP_REST_Request;
use WP_REST_Response;
use WP_Error;

/**
 * Serves the first-party core apps catalog and provides a URL-based install route.
 */
final class CoreAppsController extends BazaarController {

	/**
	 * Route base.
	 *
	 * @var string
	 */
	protected $rest_base = 'core-apps';

	/**
	 * WareRegistry instance.
	 *
	 * @var WareRegistry
	 */
	private WareRegistry $registry;

	/**
	 * WareLoader instance.
	 *
	 * @var WareLoader
	 */
	private WareLoader $loader;

	/**
	 * Constructor.
	 *
	 * @param WareRegistry $registry Registry instance.
	 */
	public function __construct( WareRegistry $registry ) {
		$this->registry = $registry;
		$this->loader   = new WareLoader( $registry );
	}

	/**
	 * URL of the raw registry JSON in the bazaar GitHub repo.
	 *
	 * Can be overridden via the `bazaar_core_apps_url` filter for self-hosted forks.
	 */
	private const REGISTRY_URL = 'https://raw.githubusercontent.com/RegionallyFamous/bazaar/main/wares/registry.json';

	/**
	 * Transient key.
	 */
	private const TRANSIENT = 'bazaar_core_apps';

	/**
	 * Cache TTL in seconds (1 hour).
	 */
	private const CACHE_TTL = HOUR_IN_SECONDS;

	/**
	 * HTTP request timeout.
	 */
	private const TIMEOUT = 8;

	/**
	 * Register routes.
	 */
	public function register_routes(): void {
		register_rest_route(
			$this->namespace,
			"/{$this->rest_base}",
			array(
				'methods'             => WP_REST_Server::READABLE,
				'callback'            => array( $this, 'get_catalog' ),
				'permission_callback' => $this->require_admin(),
			)
		);

		register_rest_route(
			$this->namespace,
			"/{$this->rest_base}/install",
			array(
				'methods'             => WP_REST_Server::CREATABLE,
				'callback'            => array( $this, 'install_from_url' ),
				'permission_callback' => $this->require_admin(),
				'args'                => array(
					'url' => array(
						'required'          => true,
						'type'              => 'string',
						'format'            => 'uri',
						'sanitize_callback' => 'esc_url_raw',
					),
				),
			)
		);
	}

	/**
	 * Path to the bundled fallback registry within the plugin.
	 */
	private const BUNDLED_REGISTRY = BAZAAR_DIR . 'wares/registry.json';

	/**
	 * Return the core apps catalog, fetching and caching from GitHub as needed.
	 * Falls back to the bundled wares/registry.json when the remote is unreachable.
	 *
	 * @return WP_REST_Response|WP_Error
	 */
	public function get_catalog(): WP_REST_Response|WP_Error {
		$cached = get_transient( self::TRANSIENT );
		if ( is_array( $cached ) && count( $cached ) > 0 ) {
			return new WP_REST_Response( $cached, 200 );
		}

		$url      = (string) apply_filters( 'bazaar_core_apps_url', self::REGISTRY_URL );
		$response = wp_remote_get(
			$url,
			array(
				'timeout'   => self::TIMEOUT,
				'sslverify' => true,
			)
		);

		if ( ! is_wp_error( $response ) ) {
			$code = (int) wp_remote_retrieve_response_code( $response );
			$body = wp_remote_retrieve_body( $response );
			$data = json_decode( $body, true );

			if ( 200 === $code && is_array( $data ) && isset( $data['wares'] ) && is_array( $data['wares'] ) ) {
				$wares = $this->sanitize_wares( $data['wares'] );
				set_transient( self::TRANSIENT, $wares, self::CACHE_TTL );
				return new WP_REST_Response( $wares, 200 );
			}
		}

		// Remote fetch failed or returned bad data — fall back to the bundled registry.
		$wares = $this->load_bundled_registry();
		if ( null !== $wares ) {
			// Cache briefly so the next request retries the remote sooner.
			set_transient( self::TRANSIENT, $wares, 5 * MINUTE_IN_SECONDS );
			return new WP_REST_Response( $wares, 200 );
		}

		return new WP_Error(
			'catalog_unavailable',
			__( 'Core apps catalog is unavailable.', 'bazaar' ),
			array( 'status' => 502 )
		);
	}

	/**
	 * Parse the bundled wares/registry.json and return sanitized entries.
	 * Returns null if the file is missing or unparseable.
	 *
	 * @return array<int, array<string, mixed>>|null
	 */
	private function load_bundled_registry(): ?array {
		if ( ! file_exists( self::BUNDLED_REGISTRY ) ) {
			return null;
		}
		// phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents
		$raw  = file_get_contents( self::BUNDLED_REGISTRY );
		$data = is_string( $raw ) ? json_decode( $raw, true ) : null;

		if ( ! is_array( $data ) || ! isset( $data['wares'] ) || ! is_array( $data['wares'] ) ) {
			return null;
		}

		return $this->sanitize_wares( $data['wares'] );
	}

	/**
	 * Download a .wp file from a trusted URL and install it.
	 *
	 * Only URLs under github.com/RegionallyFamous/bazaar/releases/ are accepted
	 * unless overridden via the `bazaar_core_apps_allowed_host` filter.
	 *
	 * @param WP_REST_Request $request Incoming request with `url` param.
	 * @return WP_REST_Response|WP_Error
	 */
	public function install_from_url( WP_REST_Request $request ): WP_REST_Response|WP_Error {
		$url          = esc_url_raw( (string) $request->get_param( 'url' ) );
		$allowed_host = (string) apply_filters( 'bazaar_core_apps_allowed_host', 'github.com' );

		if ( wp_parse_url( $url, PHP_URL_HOST ) !== $allowed_host ) {
			return new WP_Error(
				'untrusted_source',
				__( 'The supplied URL is not from an allowed host.', 'bazaar' ),
				array( 'status' => 400 )
			);
		}

		// Enforce the expected path prefix so only genuine release assets are
		// downloadable, even when the host filter is left at its default value.
		$allowed_prefix = (string) apply_filters(
			'bazaar_core_apps_allowed_path_prefix',
			'/RegionallyFamous/bazaar/releases/'
		);
		$url_path       = (string) ( wp_parse_url( $url, PHP_URL_PATH ) ?? '' );
		if ( '' !== $allowed_prefix && ! str_starts_with( $url_path, $allowed_prefix ) ) {
			return new WP_Error(
				'untrusted_path',
				__( 'The supplied URL path is not from an allowed location.', 'bazaar' ),
				array( 'status' => 400 )
			);
		}

		// Download to a temp file.
		$response = wp_remote_get(
			$url,
			array(
				'timeout'   => 30,
				'sslverify' => true,
			)
		);

		if ( is_wp_error( $response ) ) {
			return new WP_Error(
				'download_failed',
				__( 'Could not download the ware file.', 'bazaar' ),
				array( 'status' => 502 )
			);
		}

		$code = (int) wp_remote_retrieve_response_code( $response );
		if ( 200 !== $code ) {
			return new WP_Error(
				'download_error',
				/* translators: %d: HTTP status code */
				sprintf( __( 'Ware download returned HTTP %d.', 'bazaar' ), $code ),
				array( 'status' => 502 )
			);
		}

		$body = wp_remote_retrieve_body( $response );
		if ( '' === $body ) {
			return new WP_Error(
				'empty_download',
				__( 'Downloaded file is empty.', 'bazaar' ),
				array( 'status' => 502 )
			);
		}

		// Write to a unique temp file so WareLoader can read it.
		$tmp = wp_tempnam( 'bazaar-core-app-.wp' );
		if ( false === $tmp ) {
			return new WP_Error(
				'temp_failed',
				__( 'Could not create a temporary file for the download.', 'bazaar' ),
				array( 'status' => 500 )
			);
		}
		if ( false === file_put_contents( $tmp, $body ) ) { // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents
			wp_delete_file( $tmp );
			return new WP_Error(
				'write_failed',
				__( 'Could not write temporary file.', 'bazaar' ),
				array( 'status' => 500 )
			);
		}

		$url_path = (string) ( wp_parse_url( $url, PHP_URL_PATH ) ?? 'ware.wp' );
		$filename = sanitize_file_name( basename( $url_path ) );
		$manifest = $this->loader->install( $tmp, $filename );

		wp_delete_file( $tmp );

		if ( is_wp_error( $manifest ) ) {
			$manifest->add_data( array( 'status' => 422 ) );
			return $manifest;
		}

		$registered = $this->registry->register( $manifest );
		if ( ! $registered ) {
			return new WP_Error(
				'registry_failed',
				__( 'Ware was installed but could not be added to the registry.', 'bazaar' ),
				array( 'status' => 500 )
			);
		}

		$ware = $this->registry->get( $manifest['slug'] );

		if ( is_array( $ware ) ) {
			JobsController::register_ware_jobs( $ware );
		}

		/**
		 * Fires after a core app is installed via the REST API.
		 *
		 * @param string $slug Ware slug.
		 * @param array<string, mixed> $manifest Parsed manifest.
		 */
		do_action( 'bazaar_ware_installed', $manifest['slug'], $manifest );

		return new WP_REST_Response(
			array(
				'success' => true,
				'message' => sprintf(
					/* translators: %s: ware display name */
					__( '"%s" installed successfully.', 'bazaar' ),
					$manifest['name']
				),
				'ware'    => $ware,
			),
			201
		);
	}

	/**
	 * Sanitize the wares array from the remote catalog.
	 *
	 * @param array<int, mixed> $raw Raw wares array.
	 * @return array<int, array<string, mixed>>
	 */
	private function sanitize_wares( array $raw ): array {
		$out = array();

		foreach ( $raw as $item ) {
			if ( ! is_array( $item ) || empty( $item['slug'] ) ) {
				continue;
			}

			$slug = sanitize_key( (string) $item['slug'] );
			if ( '' === $slug ) {
				continue;
			}

			$tags = array();
			if ( isset( $item['tags'] ) && is_array( $item['tags'] ) ) {
				$tags = array_values(
					array_filter(
						array_map( 'sanitize_key', $item['tags'] ),
						static fn( string $t ) => '' !== $t,
					)
				);
			}

			$out[] = array(
				'slug'         => $slug,
				'name'         => sanitize_text_field( (string) ( $item['name'] ?? '' ) ),
				'description'  => sanitize_textarea_field( (string) ( $item['description'] ?? '' ) ),
				'version'      => sanitize_text_field( (string) ( $item['version'] ?? '' ) ),
				'author'       => sanitize_text_field( (string) ( $item['author'] ?? '' ) ),
				'icon_url'     => esc_url_raw( (string) ( $item['icon_url'] ?? '' ) ),
				'download_url' => esc_url_raw( (string) ( $item['download_url'] ?? '' ) ),
				'tags'         => $tags,
			);
		}

		return $out;
	}
}
