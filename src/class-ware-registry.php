<?php

declare( strict_types=1 );

namespace Bazaar;

defined( 'ABSPATH' ) || exit;

/**
 * Stores and retrieves metadata for all installed wares.
 *
 * Data is persisted as a JSON-encoded string in the `bazaar_registry` wp_option
 * with autoload disabled to avoid bloating the autoloaded options cache.
 */
final class WareRegistry {

	private const OPTION_KEY = 'bazaar_registry';

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
		$registry[ $slug ] = [
			'name'        => sanitize_text_field( $manifest['name'] ),
			'slug'        => $slug,
			'version'     => sanitize_text_field( $manifest['version'] ),
			'author'      => sanitize_text_field( $manifest['author'] ?? '' ),
			'description' => sanitize_textarea_field( $manifest['description'] ?? '' ),
			'icon'        => sanitize_text_field( $manifest['icon'] ?? 'icon.svg' ),
			'entry'       => sanitize_text_field( $manifest['entry'] ?? 'index.html' ),
			'menu'        => $this->sanitize_menu( $manifest['menu'] ?? [] ),
			'enabled'     => true,
			'installed'   => gmdate( 'Y-m-d\TH:i:s\Z' ),
		];

		return $this->save( $registry );
	}

	/**
	 * Remove a ware from the registry entirely.
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
	 */
	public function enable( string $slug ): bool {
		return $this->set_enabled( sanitize_key( $slug ), true );
	}

	/**
	 * Disable a ware — its menu page will no longer appear.
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
	 */
	public function exists( string $slug ): bool {
		return null !== $this->get( $slug );
	}

	// -------------------------------------------------------------------------
	// Private helpers
	// -------------------------------------------------------------------------

	/**
	 * @return array<string, array<string, mixed>>
	 */
	private function load(): array {
		$raw = get_option( self::OPTION_KEY, '[]' );
		if ( ! is_string( $raw ) ) {
			return [];
		}
		$decoded = json_decode( $raw, true );
		return is_array( $decoded ) ? $decoded : [];
	}

	/**
	 * @param array<string, array<string, mixed>> $registry
	 */
	private function save( array $registry ): bool {
		$encoded = wp_json_encode( $registry );
		if ( false === $encoded ) {
			return false;
		}
		return (bool) update_option( self::OPTION_KEY, $encoded, false );
	}

	private function set_enabled( string $slug, bool $enabled ): bool {
		$registry = $this->load();
		if ( ! isset( $registry[ $slug ] ) ) {
			return false;
		}
		$registry[ $slug ]['enabled'] = $enabled;
		return $this->save( $registry );
	}

	/**
	 * @param array<string, mixed> $menu
	 * @return array<string, mixed>
	 */
	private function sanitize_menu( array $menu ): array {
		return [
			'title'      => sanitize_text_field( $menu['title'] ?? '' ),
			'position'   => isset( $menu['position'] ) ? absint( $menu['position'] ) : null,
			'capability' => sanitize_text_field( $menu['capability'] ?? 'manage_options' ),
			'parent'     => isset( $menu['parent'] ) ? sanitize_key( $menu['parent'] ) : null,
		];
	}
}
