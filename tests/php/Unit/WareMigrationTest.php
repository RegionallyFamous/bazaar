<?php
/**
 * Unit tests for WareMigration.
 *
 * @package Bazaar\Tests\Unit
 */

declare( strict_types=1 );

namespace Bazaar\Tests\Unit;

use Bazaar\WareMigration;
use Brain\Monkey\Functions;
use Bazaar\Tests\WareTestCase;

/**
 * Tests for the WareMigration::run() encode-failure guards.
 *
 * The migration guards against persisting corrupt data when wp_json_encode
 * fails (e.g. UTF-16 surrogates stored in legacy option values).
 */
final class WareMigrationTest extends WareTestCase {

	/** @var array<string, mixed> In-memory option store. */
	private array $store = array();

	protected function setUp(): void {
		parent::setUp();
		$this->store = array();
		$this->stub_wp_functions();
	}

	private function stub_wp_functions(): void {
		$store = &$this->store;

		Functions\when( 'wp_json_encode' )->alias( 'json_encode' );

		Functions\when( 'get_option' )->alias(
			function ( string $opt, mixed $default = false ) use ( &$store ): mixed {
				return $store[ $opt ] ?? $default;
			}
		);

		Functions\when( 'update_option' )->alias(
			function ( string $opt, mixed $val ) use ( &$store ): bool {
				$store[ $opt ] = $val;
				return true;
			}
		);

		Functions\when( 'add_option' )->alias(
			function ( string $opt, mixed $val ) use ( &$store ): bool {
				if ( isset( $store[ $opt ] ) ) {
					return false;
				}
				$store[ $opt ] = $val;
				return true;
			}
		);

		Functions\when( 'delete_option' )->alias(
			function ( string $opt ) use ( &$store ): bool {
				unset( $store[ $opt ] );
				return true;
			}
		);

		// is_dir returns false for missing BAZAAR_WARES_DIR subdirs, so
		// the rename() path inside v110_rename_slugs is skipped automatically.
	}

	/** Seed a legacy ware option in the in-memory store. */
	private function seed_legacy_ware( string $slug, string $new_slug ): void {
		$this->store[ 'bazaar_ware_' . $slug ] = (string) json_encode(
			array(
				'slug'    => $slug,
				'name'    => ucfirst( $slug ),
				'version' => '1.0.0',
			)
		);
	}

	/** Seed a legacy index option. */
	private function seed_legacy_index( array $slugs ): void {
		$index = array();
		foreach ( $slugs as $slug ) {
			$index[ $slug ] = array( 'slug' => $slug );
		}
		$this->store['bazaar_index'] = (string) json_encode( $index );
	}

	// ─── encode-failure: per-ware option write skipped ────────────────────────

	/**
	 * When wp_json_encode returns false (unencodeable ware data), the migration
	 * must skip writing the new option and must NOT delete the old option.
	 */
	public function test_v110_skips_ware_option_write_when_encode_fails(): void {
		// Seed the old-name ware option.
		$this->seed_legacy_ware( 'focus', 'flow' );

		// Simulate BAZAAR_WARES_DIR having NO on-disk directories so rename
		// calls are bypassed (is_dir will use real FS on sys_get_temp_dir path
		// which won't exist — that's fine, it returns false naturally).

		// Override wp_json_encode to always fail.
		Functions\when( 'wp_json_encode' )->justReturn( false );

		WareMigration::run();

		// Old option must still be present — we must not have deleted it.
		$this->assertArrayHasKey(
			'bazaar_ware_focus',
			$this->store,
			'Old ware option must NOT be deleted when encode fails.'
		);
		// New option must NOT have been created.
		$this->assertArrayNotHasKey(
			'bazaar_ware_flow',
			$this->store,
			'New ware option must NOT be written when encode fails.'
		);
	}

	// ─── encode-failure: index write skipped ─────────────────────────────────

	/**
	 * When wp_json_encode returns false (unencodeable index data), the migration
	 * must skip writing the new index.
	 */
	public function test_v110_skips_index_write_when_encode_fails(): void {
		// Seed a legacy index that the migration should re-key.
		$this->seed_legacy_index( array( 'focus' ) );

		// Lock the index value before the migration so we can detect if it changed.
		$index_before = $this->store['bazaar_index'];

		// wp_json_encode must fail.
		Functions\when( 'wp_json_encode' )->justReturn( false );

		WareMigration::run();

		// The bazaar_index option must be unchanged (not replaced with a failure value).
		$this->assertSame(
			$index_before,
			$this->store['bazaar_index'] ?? '',
			'bazaar_index must not be overwritten when wp_json_encode returns false.'
		);
	}

	// ─── happy path ──────────────────────────────────────────────────────────

	public function test_v110_renames_focus_to_flow_in_index(): void {
		$this->seed_legacy_index( array( 'focus' ) );

		WareMigration::run();

		$index = json_decode( (string) ( $this->store['bazaar_index'] ?? '{}' ), true );
		$this->assertArrayHasKey( 'flow', $index, 'Index must be re-keyed from focus to flow.' );
		$this->assertArrayNotHasKey( 'focus', $index, 'Old key must be removed from index.' );
	}

	public function test_v110_does_not_run_twice(): void {
		// Mark migration as already done.
		$this->store['bazaar_migration_v110_slugs'] = '1';

		$this->seed_legacy_ware( 'focus', 'flow' );

		WareMigration::run();

		// Since migration already ran, the old option must be untouched.
		$this->assertArrayHasKey(
			'bazaar_ware_focus',
			$this->store,
			'Migration must be a no-op when already completed.'
		);
		$this->assertArrayNotHasKey( 'bazaar_ware_flow', $this->store );
	}
}
