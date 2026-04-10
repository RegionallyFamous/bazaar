<?php
/**
 * Interface for the ware registry.
 *
 * Defining behaviour through an interface lets WareController, WareLoader, and
 * other consumers depend on the abstraction rather than the concrete class,
 * which makes unit testing straightforward without removing the `final` keyword
 * from the production implementation.
 *
 * @package Bazaar
 */

declare( strict_types=1 );

namespace Bazaar;

/**
 * Describes the public contract for reading and writing ware metadata.
 */
interface WareRegistryInterface {

	/**
	 * Register a newly-installed ware.
	 *
	 * @param array<string, mixed> $manifest Validated manifest data.
	 */
	public function register( array $manifest ): bool;

	/**
	 * Remove a ware from the registry.
	 *
	 * @param string $slug Ware slug.
	 */
	public function unregister( string $slug ): bool;

	/**
	 * Set the dev-server URL for a ware.
	 *
	 * @param string $slug Ware slug.
	 * @param string $url  Dev server URL.
	 */
	public function set_dev_url( string $slug, string $url ): bool;

	/**
	 * Clear the dev-server URL for a ware.
	 *
	 * @param string $slug Ware slug.
	 */
	public function clear_dev_url( string $slug ): bool;

	/**
	 * Enable a ware.
	 *
	 * @param string $slug Ware slug.
	 */
	public function enable( string $slug ): bool;

	/**
	 * Disable a ware.
	 *
	 * @param string $slug Ware slug.
	 */
	public function disable( string $slug ): bool;

	/**
	 * Return the lightweight index of all registered wares.
	 *
	 * @return array<string, array<string, mixed>>
	 */
	public function get_index(): array;

	/**
	 * Return the full manifest for a single ware, or null if not found.
	 *
	 * @param string $slug Ware slug.
	 * @return array<string, mixed>|null
	 */
	public function get( string $slug ): ?array;

	/**
	 * Return full manifests for all registered wares.
	 *
	 * @return array<string, array<string, mixed>>
	 */
	public function get_all(): array;

	/**
	 * Return true if a ware with the given slug is registered.
	 *
	 * @param string $slug Ware slug.
	 */
	public function exists( string $slug ): bool;

	/**
	 * Update a single field in a ware's stored manifest.
	 *
	 * @param string $slug  Ware slug.
	 * @param string $field Field name.
	 * @param mixed  $value New value.
	 */
	public function update_field( string $slug, string $field, mixed $value ): bool;
}
