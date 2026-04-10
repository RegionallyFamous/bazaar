<?php
/**
 * Ware registry — two-tier storage for installed-ware metadata.
 *
 * Storage layout
 * ──────────────
 *   bazaar_index            A flat map of { slug → index_entry } used for the
 *                           nav rail, hook checks, and permission lookups.
 *                           Each entry contains: slug, name, enabled, version,
 *                           icon, menu_title, capability.
 *
 *   bazaar_ware_{slug}      Full manifest + runtime fields for one ware.
 *                           Loaded only when the ware is rendered or when the
 *                           management page needs complete details.
 *
 * Both options use autoload=false so they never bloat the options cache.
 *
 * Migration
 * ─────────
 * If bazaar_index does not yet exist, load_index() transparently migrates
 * the legacy bazaar_registry option the first time it is called.
 *
 * @package Bazaar
 */

declare( strict_types=1 );

namespace Bazaar;

defined( 'ABSPATH' ) || exit;

/**
 * Stores and retrieves ware metadata across the two-tier option layout.
 */
final class WareRegistry implements WareRegistryInterface {

	/** Option key for the flat index. */
	private const INDEX_KEY = 'bazaar_index';

	/** Prefix for per-ware full-manifest options. */
	private const WARE_PREFIX = 'bazaar_ware_';

	/** Legacy single-option key — read only during migration. */
	private const LEGACY_KEY = 'bazaar_registry';

	/**
	 * In-memory index cache for this request.
	 * Null means not yet loaded.
	 *
	 * @var array<string, array<string, mixed>>|null
	 */
	private ?array $index_cache = null;

	/**
	 * Per-ware full-manifest cache, keyed by slug.
	 *
	 * @var array<string, array<string, mixed>>
	 */
	private array $ware_cache = array();

	// =========================================================================
	// Write operations
	// =========================================================================

	/**
	 * Register a newly-installed ware.
	 * Writes the full manifest to a per-ware option and adds an index entry.
	 *
	 * @param array<string, mixed> $manifest Validated manifest data.
	 */
	public function register( array $manifest ): bool {
		$slug = sanitize_key( $manifest['slug'] );
		if ( '' === $slug ) {
			return false;
		}

		$ware = array(
			'name'        => sanitize_text_field( $manifest['name'] ),
			'slug'        => $slug,
			'version'     => sanitize_text_field( $manifest['version'] ),
			'author'      => sanitize_text_field( $manifest['author'] ?? '' ),
			'description' => sanitize_textarea_field( $manifest['description'] ?? '' ),
			'icon'        => sanitize_text_field( $manifest['icon'] ?? 'icon.svg' ),
			'entry'       => sanitize_text_field( $manifest['entry'] ?? 'index.html' ),
			'menu'        => $this->sanitize_menu( $manifest['menu'] ?? array() ),
			'permissions' => $this->sanitize_permissions( $manifest['permissions'] ?? array() ),
			'license'     => $this->sanitize_license( $manifest['license'] ?? array() ),
			'registry'    => $this->sanitize_registry_meta( $manifest ),
			'enabled'     => true,
			'installed'   => gmdate( 'Y-m-d\TH:i:s\Z' ),
		);

		if ( ! $this->save_ware( $slug, $ware ) ) {
			return false;
		}

		$index          = $this->load_index();
		$index[ $slug ] = $this->make_index_entry( $ware );
		return $this->save_index( $index );
	}

	/**
	 * Remove a ware from both the index and its per-ware option.
	 *
	 * @param string $slug Ware slug to remove.
	 */
	public function unregister( string $slug ): bool {
		$slug  = sanitize_key( $slug );
		$index = $this->load_index();

		if ( ! isset( $index[ $slug ] ) ) {
			return false;
		}

		unset( $index[ $slug ], $this->ware_cache[ $slug ] );
		delete_option( self::WARE_PREFIX . $slug );
		return $this->save_index( $index );
	}

	/**
	 * Store a dev-mode URL for a ware.
	 * Stored in the per-ware option only (not duplicated in the index).
	 *
	 * @param string $slug Ware slug.
	 * @param string $url  Local dev server URL, e.g. http://localhost:5173.
	 */
	public function set_dev_url( string $slug, string $url ): bool {
		$slug = sanitize_key( $slug );
		$ware = $this->load_ware( $slug );
		if ( null === $ware ) {
			return false;
		}
		$ware['dev_url'] = esc_url_raw( $url );
		return $this->save_ware( $slug, $ware );
	}

	/**
	 * Remove the dev-mode URL from a ware.
	 *
	 * @param string $slug Ware slug.
	 */
	public function clear_dev_url( string $slug ): bool {
		$slug = sanitize_key( $slug );
		$ware = $this->load_ware( $slug );
		if ( null === $ware ) {
			return false;
		}
		unset( $ware['dev_url'] );
		return $this->save_ware( $slug, $ware );
	}

	/**
	 * Enable a ware — updates both the index and the per-ware option.
	 *
	 * @param string $slug Ware slug to enable.
	 */
	public function enable( string $slug ): bool {
		return $this->set_enabled( sanitize_key( $slug ), true );
	}

	/**
	 * Disable a ware — updates both the index and the per-ware option.
	 *
	 * @param string $slug Ware slug to disable.
	 */
	public function disable( string $slug ): bool {
		return $this->set_enabled( sanitize_key( $slug ), false );
	}

	// =========================================================================
	// Read operations
	// =========================================================================

	/**
	 * Return the flat index for all wares.
	 * This is cheap — one DB query at most per request.
	 *
	 * Each entry contains: slug, name, enabled, version, icon,
	 * menu_title, capability.
	 *
	 * @return array<string, array<string, mixed>>
	 */
	public function get_index(): array {
		return $this->load_index();
	}

	/**
	 * Return the full manifest for a single ware, or null if not found.
	 *
	 * @param string $slug Ware slug to look up.
	 * @return array<string, mixed>|null
	 */
	public function get( string $slug ): ?array {
		return $this->load_ware( sanitize_key( $slug ) );
	}

	/**
	 * Return full manifests for all installed wares.
	 *
	 * Iterates the index, then loads each per-ware option. Results are cached
	 * in-memory so repeated calls within the same request are free.
	 *
	 * @return array<string, array<string, mixed>>
	 */
	public function get_all(): array {
		$index = $this->load_index();
		$all   = array();

		foreach ( array_keys( $index ) as $slug ) {
			$ware = $this->load_ware( $slug );
			if ( null !== $ware ) {
				$all[ $slug ] = $ware;
			}
		}

		return $all;
	}

	/**
	 * Check whether a slug is already registered.
	 *
	 * @param string $slug Ware slug to check.
	 */
	public function exists( string $slug ): bool {
		$index = $this->load_index();
		return isset( $index[ sanitize_key( $slug ) ] );
	}

	// =========================================================================
	// Private — index helpers
	// =========================================================================

	/**
	 * Load the index option, migrating from the legacy registry if needed.
	 *
	 * @return array<string, array<string, mixed>>
	 */
	private function load_index(): array {
		if ( null !== $this->index_cache ) {
			return $this->index_cache;
		}

		$raw = get_option( self::INDEX_KEY );

		if ( false === $raw ) {
			// First run or fresh install — attempt migration.
			$this->index_cache = $this->migrate_legacy();
			return $this->index_cache;
		}

		$decoded           = json_decode( (string) $raw, true );
		$this->index_cache = is_array( $decoded ) ? $decoded : array();
		return $this->index_cache;
	}

	/**
	 * Persist the index and update the in-memory cache.
	 *
	 * @param array<string, array<string, mixed>> $index New index state.
	 */
	private function save_index( array $index ): bool {
		$encoded = wp_json_encode( $index );
		if ( false === $encoded ) {
			return false;
		}
		$saved = (bool) update_option( self::INDEX_KEY, $encoded, false );
		if ( $saved ) {
			$this->index_cache = $index;
		}
		return $saved;
	}

	/**
	 * Build a compact index entry from a full ware manifest.
	 *
	 * @param array<string, mixed> $ware Full ware data.
	 * @return array<string, mixed>
	 */
	private function make_index_entry( array $ware ): array {
		$menu = $ware['menu'] ?? array();
		return array(
			'slug'        => $ware['slug'],
			'name'        => $ware['name'],
			'enabled'     => (bool) ( $ware['enabled'] ?? false ),
			'version'     => $ware['version'],
			'icon'        => $ware['icon'] ?? 'icon.svg',
			'entry'       => $ware['entry'] ?? 'index.html',
			'menu_title'  => $menu['title'] ?? $ware['name'],
			'capability'  => $menu['capability'] ?? 'manage_options',
			'group'       => $menu['group'] ?? null,
			'dev_url'     => $ware['dev_url'] ?? null,
			'permissions' => $ware['permissions'] ?? array(),
		);
	}

	/**
	 * Migrate the legacy bazaar_registry option to the two-tier layout.
	 * Leaves the legacy option in place as a backup.
	 *
	 * @return array<string, array<string, mixed>> The migrated index.
	 */
	private function migrate_legacy(): array {
		$raw   = get_option( self::LEGACY_KEY );
		$index = array();

		if ( false !== $raw ) {
			$legacy = json_decode( (string) $raw, true );
			if ( is_array( $legacy ) ) {
				foreach ( $legacy as $slug => $ware ) {
					$slug = sanitize_key( (string) $slug );
					if ( '' === $slug ) {
						continue;
					}
					$this->save_ware( $slug, $ware );
					$index[ $slug ] = $this->make_index_entry( $ware );
				}
			}
		}

		$this->save_index( $index );
		return $index;
	}

	// =========================================================================
	// Private — per-ware helpers
	// =========================================================================

	/**
	 * Load the full manifest for a single ware from its option.
	 *
	 * @param string $slug Sanitized ware slug.
	 * @return array<string, mixed>|null
	 */
	private function load_ware( string $slug ): ?array {
		if ( isset( $this->ware_cache[ $slug ] ) ) {
			return $this->ware_cache[ $slug ];
		}

		// Quick existence check via the index before hitting the DB.
		$index = $this->load_index();
		if ( ! isset( $index[ $slug ] ) ) {
			return null;
		}

		$raw = get_option( self::WARE_PREFIX . $slug );
		if ( false === $raw ) {
			return null;
		}

		$decoded = json_decode( (string) $raw, true );
		if ( ! is_array( $decoded ) ) {
			return null;
		}

		$this->ware_cache[ $slug ] = $decoded;
		return $decoded;
	}

	/**
	 * Persist full ware data to its option and update the in-memory cache.
	 *
	 * @param string               $slug Sanitized ware slug.
	 * @param array<string, mixed> $ware Full ware data.
	 */
	private function save_ware( string $slug, array $ware ): bool {
		$encoded = wp_json_encode( $ware );
		if ( false === $encoded ) {
			return false;
		}
		$saved = (bool) update_option( self::WARE_PREFIX . $slug, $encoded, false );
		if ( $saved ) {
			$this->ware_cache[ $slug ] = $ware;
		}
		return $saved;
	}

	/**
	 * Toggle enabled state in both the index and the per-ware option.
	 *
	 * @param string $slug    Sanitized ware slug.
	 * @param bool   $enabled New enabled state.
	 */
	private function set_enabled( string $slug, bool $enabled ): bool {
		$index = $this->load_index();
		if ( ! isset( $index[ $slug ] ) ) {
			return false;
		}
		$index[ $slug ]['enabled'] = $enabled;
		if ( ! $this->save_index( $index ) ) {
			return false;
		}

		$ware = $this->load_ware( $slug );
		if ( null === $ware ) {
			return false;
		}
		$ware['enabled'] = $enabled;
		return $this->save_ware( $slug, $ware );
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
			'parent'     => isset( $menu['parent'] ) ? sanitize_text_field( (string) $menu['parent'] ) : null,
			'group'      => isset( $menu['group'] ) ? sanitize_text_field( (string) $menu['group'] ) : null,
		);
	}

	/**
	 * Sanitize a raw permissions array against the allowed set.
	 *
	 * @param mixed $raw Raw input value.
	 * @return array<int, string>
	 */
	private function sanitize_permissions( mixed $raw ): array {
		if ( ! is_array( $raw ) ) {
			return array();
		}
		$allowed = array(
			'read:posts',
			'write:posts',
			'delete:posts',
			'read:users',
			'write:users',
			'read:options',
			'write:options',
			'read:media',
			'write:media',
			'read:comments',
			'write:comments',
			'moderate:comments',
			'manage:plugins',
			'manage:themes',
			'read:analytics',
		);
		return array_values( array_intersect( array_map( 'sanitize_text_field', $raw ), $allowed ) );
	}

	/**
	 * Sanitize a raw license array.
	 *
	 * @param mixed $raw Raw input value.
	 * @return array<string, string>
	 */
	private function sanitize_license( mixed $raw ): array {
		if ( ! is_array( $raw ) ) {
			return array();
		}
		return array(
			'type'     => sanitize_text_field( $raw['type'] ?? 'free' ),
			'url'      => esc_url_raw( $raw['url'] ?? '' ),
			'required' => ( isset( $raw['required'] ) && $raw['required'] ) ? 'true' : 'false',
		);
	}

	/**
	 * Extract registry metadata from the manifest (source, update URL, signature).
	 *
	 * @param array<string, mixed> $manifest Raw manifest.
	 * @return array<string, string>
	 */
	private function sanitize_registry_meta( array $manifest ): array {
		$meta = array();
		if ( ! empty( $manifest['updateUrl'] ) ) {
			$meta['update_url'] = esc_url_raw( $manifest['updateUrl'] );
		}
		if ( ! empty( $manifest['signature'] ) ) {
			$meta['signature'] = sanitize_text_field( $manifest['signature'] );
		}
		if ( ! empty( $manifest['homepage'] ) ) {
			$meta['homepage'] = esc_url_raw( $manifest['homepage'] );
		}
		return $meta;
	}

	/**
	 * Update a single field in a ware's manifest and persist it.
	 *
	 * @param string $slug  Ware slug.
	 * @param string $field Manifest field key.
	 * @param mixed  $value New value to set.
	 * @return bool
	 */
	public function update_field( string $slug, string $field, mixed $value ): bool {
		$slug = sanitize_key( $slug );
		$ware = $this->load_ware( $slug );
		if ( null === $ware ) {
			return false;
		}
		$ware[ $field ] = $value;
		if ( ! $this->save_ware( $slug, $ware ) ) {
			return false;
		}
		// Also refresh the index entry in case the field is projected there.
		$index = $this->load_index();
		if ( isset( $index[ $slug ] ) ) {
			$index[ $slug ] = $this->make_index_entry( $ware );
			$this->save_index( $index );
		}
		return true;
	}
}
