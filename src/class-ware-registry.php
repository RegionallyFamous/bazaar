<?php
/**
 * Ware registry — persists installed-ware metadata in wp_options.
 *
 * @package Bazaar
 */

declare( strict_types=1 );

namespace Bazaar;

defined( 'ABSPATH' ) || exit;

/**
 * Stores and retrieves metadata for all installed wares.
 *
 * Data is persisted as a JSON-encoded string in the `bazaar_registry` wp_option
 * with autoload disabled to avoid bloating the autoloaded options cache.
 *
 * An in-memory request cache avoids repeated JSON-decode round-trips when the
 * registry is read multiple times in a single request (menu registration,
 * permission checks, REST responses, etc.).
 */
final class WareRegistry {

	/** WordPress option key used to persist the registry. */
	private const OPTION_KEY = 'bazaar_registry';

	/**
	 * Request-level in-memory cache. Null means the option has not been loaded
	 * yet this request; an array (possibly empty) means it has been loaded.
	 *
	 * @var array<string, array<string, mixed>>|null
	 */
	private ?array $cache = null;

	// -------------------------------------------------------------------------
	// Write operations
	// -------------------------------------------------------------------------

	/**
	 * Register a newly installed ware.
	 *
	 * @param array<string, mixed> $manifest Validated manifest data.
	 */
	public function register( array $manifest ): bool {
		$slug = sanitize_key( $manifest['slug'] );
		if ( '' === $slug ) {
			return false;
		}

		$registry          = $this->load();
		$registry[ $slug ] = array(
			'name'        => sanitize_text_field( $manifest['name'] ),
			'slug'        => $slug,
			'version'     => sanitize_text_field( $manifest['version'] ),
			'author'      => sanitize_text_field( $manifest['author'] ?? '' ),
			'description' => sanitize_textarea_field( $manifest['description'] ?? '' ),
			'icon'        => sanitize_text_field( $manifest['icon'] ?? 'icon.svg' ),
			'entry'       => sanitize_text_field( $manifest['entry'] ?? 'index.html' ),
			'menu'        => $this->sanitize_menu( $manifest['menu'] ?? array() ),
			'enabled'     => true,
			'installed'   => gmdate( 'Y-m-d\TH:i:s\Z' ),
		);

		return $this->save( $registry );
	}

	/**
	 * Remove a ware from the registry entirely.
	 *
	 * @param string $slug Ware slug to remove.
	 */
	public function unregister( string $slug ): bool {
		$slug     = sanitize_key( $slug );
		$registry = $this->load();

		if ( ! isset( $registry[ $slug ] ) ) {
			return false;
		}

		unset( $registry[ $slug ] );
		return $this->save( $registry );
	}

	/**
	 * Enable a ware so its menu page is registered.
	 *
	 * @param string $slug Ware slug to enable.
	 */
	public function enable( string $slug ): bool {
		return $this->set_enabled( sanitize_key( $slug ), true );
	}

	/**
	 * Disable a ware — its menu page will no longer appear.
	 *
	 * @param string $slug Ware slug to disable.
	 */
	public function disable( string $slug ): bool {
		return $this->set_enabled( sanitize_key( $slug ), false );
	}

	// -------------------------------------------------------------------------
	// Read operations
	// -------------------------------------------------------------------------

	/**
	 * Retrieve a single ware's metadata, or null if not found.
	 *
	 * @param string $slug Ware slug to look up.
	 * @return array<string, mixed>|null
	 */
	public function get( string $slug ): ?array {
		$slug     = sanitize_key( $slug );
		$registry = $this->load();
		return $registry[ $slug ] ?? null;
	}

	/**
	 * Retrieve all installed wares.
	 *
	 * @return array<string, array<string, mixed>>
	 */
	public function get_all(): array {
		return $this->load();
	}

	/**
	 * Check whether a slug is already registered.
	 *
	 * @param string $slug Ware slug to check.
	 */
	public function exists( string $slug ): bool {
		return null !== $this->get( $slug );
	}

	// -------------------------------------------------------------------------
	// Private helpers
	// -------------------------------------------------------------------------

	/**
	 * Decode the raw option value into a registry array, using the in-memory
	 * cache to avoid repeated JSON-decode calls within the same request.
	 *
	 * @return array<string, array<string, mixed>>
	 */
	private function load(): array {
		if ( null !== $this->cache ) {
			return $this->cache;
		}

		$raw = get_option( self::OPTION_KEY, '[]' );
		if ( ! is_string( $raw ) ) {
			$this->cache = array();
			return $this->cache;
		}

		$decoded     = json_decode( $raw, true );
		$this->cache = is_array( $decoded ) ? $decoded : array();
		return $this->cache;
	}

	/**
	 * JSON-encode and persist the registry to wp_options, then update the cache.
	 *
	 * @param array<string, array<string, mixed>> $registry Registry data to persist.
	 */
	private function save( array $registry ): bool {
		$encoded = wp_json_encode( $registry );
		if ( false === $encoded ) {
			return false;
		}
		$saved = (bool) update_option( self::OPTION_KEY, $encoded, false );
		if ( $saved ) {
			$this->cache = $registry;
		}
		return $saved;
	}

	/**
	 * Toggle the enabled state of a registered ware.
	 *
	 * @param string $slug    Sanitized ware slug.
	 * @param bool   $enabled Desired enabled state.
	 */
	private function set_enabled( string $slug, bool $enabled ): bool {
		$registry = $this->load();
		if ( ! isset( $registry[ $slug ] ) ) {
			return false;
		}
		$registry[ $slug ]['enabled'] = $enabled;
		return $this->save( $registry );
	}

	/**
	 * Sanitize raw menu configuration from a manifest.
	 *
	 * @param array<string, mixed> $menu Raw menu array from manifest.
	 * @return array<string, mixed>
	 */
	private function sanitize_menu( array $menu ): array {
		return array(
			'title'      => sanitize_text_field( $menu['title'] ?? '' ),
			'position'   => isset( $menu['position'] ) ? absint( $menu['position'] ) : null,
			'capability' => sanitize_text_field( $menu['capability'] ?? 'manage_options' ),
			// sanitize_text_field preserves dots, so parent slugs like "tools.php"
			// and query-string parents like "options-general.php" are kept intact.
			// sanitize_key() would incorrectly strip the dots.
			'parent'     => isset( $menu['parent'] ) ? sanitize_text_field( (string) $menu['parent'] ) : null,
		);
	}
}
