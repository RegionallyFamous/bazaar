<?php
/**
 * Remote ware registry — fetch, search, and install from a hosted index.
 *
 * The registry is a JSON file served over HTTPS. Its format:
 *
 *   {
 *     "version": 1,
 *     "wares": [
 *       {
 *         "slug":        "crm",
 *         "name":        "Simple CRM",
 *         "description": "Contact management for small teams.",
 *         "version":     "1.2.0",
 *         "author":      "Acme Inc.",
 *         "homepage":    "https://example.com/crm",
 *         "download_url":"https://cdn.example.com/crm-1.2.0.wp",
 *         "icon_url":    "https://cdn.example.com/crm-icon.svg",
 *         "signature":   "base64-encoded-rsa-signature",
 *         "tags":        ["crm", "contacts"]
 *       }
 *     ]
 *   }
 *
 * The default registry URL ships with the plugin but can be overridden via
 * the `bazaar_registry_url` option or the `bazaar_registry_url` filter.
 *
 * @package Bazaar
 */

declare( strict_types=1 );

namespace Bazaar;

defined( 'ABSPATH' ) || exit;

use WP_Error;

/**
 * Fetches and caches a remote ware registry index.
 */
final class RemoteRegistry {

	/** Default registry manifest URL. Replace with the real hosted URL. */
	private const DEFAULT_URL = 'https://registry.usebazaar.com/index.json';

	/** Transient key for the cached registry. */
	private const CACHE_KEY = 'bazaar_remote_registry';

	/** Cache TTL — 1 hour. */
	private const CACHE_TTL = HOUR_IN_SECONDS;

	/**
	 * Resolved registry URL for this request.
	 *
	 * @var string
	 */
	private string $url;

	/**
	 * Constructor.
	 */
	public function __construct() {
		$override  = get_option( 'bazaar_registry_url', '' );
		$this->url = apply_filters(
			'bazaar_registry_url',
			! empty( $override ) ? esc_url_raw( $override ) : self::DEFAULT_URL
		);
	}

	// -------------------------------------------------------------------------
	// Public API
	// -------------------------------------------------------------------------

	/**
	 * Search the registry for wares matching a query.
	 *
	 * @param string $query Search string — matched against name, slug, description, tags.
	 * @return array<int, array<string, mixed>>|WP_Error
	 */
	public function search( string $query ): array|WP_Error {
		$index = $this->fetch();
		if ( is_wp_error( $index ) ) {
			return $index;
		}

		$q      = strtolower( trim( $query ) );
		$result = array();

		foreach ( $index as $ware ) {
			if (
				'' === $q ||
				str_contains( strtolower( $ware['name'] ?? '' ), $q ) ||
				str_contains( strtolower( $ware['slug'] ?? '' ), $q ) ||
				str_contains( strtolower( $ware['description'] ?? '' ), $q ) ||
				in_array( $q, array_map( 'strtolower', (array) ( $ware['tags'] ?? array() ) ), true )
			) {
				$result[] = $ware;
			}
		}

		return $result;
	}

	/**
	 * Get the registry entry for a specific slug.
	 *
	 * @param string $slug Ware slug.
	 * @return array<string, mixed>|WP_Error null if not found.
	 */
	public function get( string $slug ): array|WP_Error {
		$index = $this->fetch();
		if ( is_wp_error( $index ) ) {
			return $index;
		}

		foreach ( $index as $ware ) {
			if ( ( $ware['slug'] ?? '' ) === $slug ) {
				return $ware;
			}
		}

		return new WP_Error(
			'not_found',
			sprintf(
			/* translators: %s: ware slug */
				esc_html__( 'Ware "%s" not found in the registry.', 'bazaar' ),
				esc_html( $slug )
			)
		);
	}

	/**
	 * Download and install a ware from the registry.
	 *
	 * @param string       $slug   Ware slug to install.
	 * @param WareLoader   $loader WareLoader instance.
	 * @param WareRegistry $registry Local WareRegistry instance.
	 * @return array<string, mixed>|WP_Error Manifest on success.
	 */
	public function install( string $slug, WareLoader $loader, WareRegistry $registry ): array|WP_Error {
		$entry = $this->get( $slug );
		if ( is_wp_error( $entry ) ) {
			return $entry;
		}

		$download_url = esc_url_raw( $entry['download_url'] ?? '' );
		if ( '' === $download_url ) {
			return new WP_Error( 'no_download_url', esc_html__( 'Registry entry has no download URL.', 'bazaar' ) );
		}

		// Download the .wp file to a temp location.
		$tmp = $this->download( $download_url );
		if ( is_wp_error( $tmp ) ) {
			return $tmp;
		}

		$filename = $slug . '.wp';
		$manifest = $loader->install( $tmp, $filename );

		wp_delete_file( $tmp );

		if ( is_wp_error( $manifest ) ) {
			return $manifest;
		}

		$registry->register( $manifest );

		return $manifest;
	}

	/**
	 * Check whether a locally-installed ware has a newer version in the registry.
	 *
	 * @param array<string, mixed> $local_ware Full local ware manifest.
	 * @return array{current: string, latest: string, has_update: bool}
	 */
	public function check_update( array $local_ware ): array {
		$slug  = $local_ware['slug'] ?? '';
		$entry = $this->get( $slug );

		if ( is_wp_error( $entry ) ) {
			// Not in registry — no update available.
			return array(
				'current'    => $local_ware['version'] ?? '',
				'latest'     => '',
				'has_update' => false,
			);
		}

		$current    = $local_ware['version'] ?? '0.0.0';
		$latest     = $entry['version'] ?? '0.0.0';
		$has_update = version_compare( $latest, $current, '>' );

		return array(
			'current'    => $current,
			'latest'     => $latest,
			'has_update' => $has_update,
			'entry'      => $entry,
		);
	}

	/**
	 * Force-clear the registry cache.
	 */
	public function bust_cache(): void {
		delete_transient( self::CACHE_KEY );
	}

	// -------------------------------------------------------------------------
	// Private helpers
	// -------------------------------------------------------------------------

	/**
	 * Fetch and cache the registry index.
	 *
	 * @return array<int, array<string, mixed>>|WP_Error
	 */
	private function fetch(): array|WP_Error {
		$cached = get_transient( self::CACHE_KEY );
		if ( is_array( $cached ) ) {
			return $cached;
		}

		$response = wp_remote_get(
			$this->url,
			array(
				'timeout'    => 10,
				'user-agent' => 'Bazaar/' . BAZAAR_VERSION . '; WordPress/' . get_bloginfo( 'version' ),
			)
		);

		if ( is_wp_error( $response ) ) {
			return $response;
		}

		$code = wp_remote_retrieve_response_code( $response );
		if ( 200 !== (int) $code ) {
			return new WP_Error(
				'registry_http_error',
				/* translators: %d: HTTP status code returned by the remote registry */
				sprintf( esc_html__( 'Registry returned HTTP %d.', 'bazaar' ), $code )
			);
		}

		$body = wp_remote_retrieve_body( $response );
		$data = json_decode( $body, true );

		if ( ! is_array( $data ) || ! isset( $data['wares'] ) ) {
			return new WP_Error( 'registry_invalid', esc_html__( 'Registry response is not valid JSON.', 'bazaar' ) );
		}

		$wares = array_filter( (array) $data['wares'], fn( $w ) => is_array( $w ) && ! empty( $w['slug'] ) );
		$wares = array_values( $wares );

		set_transient( self::CACHE_KEY, $wares, self::CACHE_TTL );

		return $wares;
	}

	/**
	 * Download a remote URL to a temp file.
	 *
	 * @param string $url Remote URL.
	 * @return string|WP_Error Absolute path to the downloaded temp file.
	 */
	private function download( string $url ): string|WP_Error {
		if ( ! function_exists( 'download_url' ) ) {
			require_once ABSPATH . 'wp-admin/includes/file.php';
		}

		$tmp = download_url( $url, 30 );

		if ( is_wp_error( $tmp ) ) {
			return $tmp;
		}

		return $tmp;
	}
}
