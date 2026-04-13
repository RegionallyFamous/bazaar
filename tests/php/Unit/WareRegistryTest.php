<?php

declare( strict_types=1 );

namespace Bazaar\Tests\Unit;

use Bazaar\WareRegistry;
use Brain\Monkey\Functions;
use Bazaar\Tests\WareTestCase;

/**
 * Unit tests for WareRegistry.
 */
final class WareRegistryTest extends WareTestCase {

	/** @var array<string, mixed> In-memory option store for test isolation. */
	private array $store = array();

	protected function setUp(): void {
		parent::setUp();
		$this->store = array(
			'bazaar_index' => '{}',
		);
		$this->stub_wp_functions();
	}

	// -------------------------------------------------------------------------
	// Helpers
	// -------------------------------------------------------------------------

	/**
	 * Wire up the minimal set of WordPress functions every test needs.
	 * Uses the in-memory $store so option reads/writes are fully controlled.
	 */
	private function stub_wp_functions(): void {
		Functions\when( 'esc_url_raw' )->returnArg();
		Functions\when( 'absint' )->alias( 'intval' );
		Functions\when( 'wp_json_encode' )->alias( 'json_encode' );
		Functions\when( 'gmdate' )->alias( 'gmdate' );

		$store = &$this->store;

		Functions\when( 'get_option' )->alias(
			function ( string $opt, mixed $default = false ) use ( &$store ): mixed {
				return $store[ $opt ] ?? $default;
			}
		);

		Functions\when( 'update_option' )->alias(
			function ( string $opt, mixed $val, mixed $autoload = null ) use ( &$store ): bool {
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
	}

	/**
	 * Pre-populate the store with a registered ware so read-path tests work.
	 *
	 * @param string               $slug
	 * @param array<string, mixed> $overrides
	 */
	private function seed_ware( string $slug, array $overrides = array() ): void {
		$ware = array_merge(
			array(
				'slug'        => $slug,
				'name'        => 'Test Ware',
				'version'     => '1.0.0',
				'author'      => '',
				'description' => '',
				'icon'        => 'icon.svg',
				'entry'       => 'index.html',
				'menu'        => array(
					'title'      => 'Test Ware',
					'position'   => null,
					'capability' => 'manage_options',
					'parent'     => null,
					'group'      => null,
				),
				'permissions' => array(),
				'license'     => array(
					'type'     => 'free',
					'url'      => '',
					'required' => 'false',
				),
				'registry'    => array(),
				'enabled'     => true,
				'installed'   => '2025-01-01T00:00:00Z',
			),
			$overrides
		);

		$index_entry = array(
			'slug'        => $ware['slug'],
			'name'        => $ware['name'],
			'enabled'     => $ware['enabled'],
			'version'     => $ware['version'],
			'icon'        => $ware['icon'],
			'entry'       => $ware['entry'],
			'menu_title'  => $ware['menu']['title'],
			'capability'  => $ware['menu']['capability'],
			'group'       => null,
			'dev_url'     => null,
			'permissions' => array(),
		);

		$index                                 = json_decode( (string) ( $this->store['bazaar_index'] ?? '{}' ), true ) ?? array();
		$index[ $slug ]                        = $index_entry;
		$this->store['bazaar_index']           = (string) json_encode( $index );
		$this->store[ 'bazaar_ware_' . $slug ] = (string) json_encode( $ware );
	}

	// -------------------------------------------------------------------------
	// Registration
	// -------------------------------------------------------------------------

	public function test_register_stores_ware(): void {
		$registry = new WareRegistry();
		$result   = $registry->register(
			array(
				'name'    => 'Test Ware',
				'slug'    => 'test-ware',
				'version' => '1.0.0',
			)
		);

		$this->assertTrue( $result );
		$this->assertArrayHasKey( 'bazaar_ware_test-ware', $this->store );
	}

	public function test_register_rejects_empty_slug(): void {
		$registry = new WareRegistry();
		$result   = $registry->register(
			array(
				'name'    => 'Bad Ware',
				'slug'    => '',
				'version' => '1.0.0',
			)
		);

		$this->assertFalse( $result );
	}

	public function test_register_persists_index_entry(): void {
		$registry = new WareRegistry();
		$registry->register(
			array(
				'name'    => 'My Ware',
				'slug'    => 'my-ware',
				'version' => '2.3.4',
			)
		);

		$index = json_decode( (string) ( $this->store['bazaar_index'] ?? '{}' ), true );
		$this->assertArrayHasKey( 'my-ware', $index );
		$this->assertSame( '2.3.4', $index['my-ware']['version'] );
	}

	// -------------------------------------------------------------------------
	// Read operations
	// -------------------------------------------------------------------------

	public function test_get_returns_null_for_missing_slug(): void {
		$registry = new WareRegistry();
		$this->assertNull( $registry->get( 'nonexistent' ) );
	}

	public function test_exists_returns_false_for_unknown_slug(): void {
		$registry = new WareRegistry();
		$this->assertFalse( $registry->exists( 'ghost' ) );
	}

	public function test_get_returns_ware_for_known_slug(): void {
		$this->seed_ware( 'crm' );
		$registry = new WareRegistry();

		$ware = $registry->get( 'crm' );

		$this->assertIsArray( $ware );
		$this->assertSame( 'crm', $ware['slug'] );
		$this->assertSame( 'Test Ware', $ware['name'] );
	}

	public function test_exists_returns_true_for_known_slug(): void {
		$this->seed_ware( 'crm' );
		$registry = new WareRegistry();

		$this->assertTrue( $registry->exists( 'crm' ) );
	}

	public function test_get_index_returns_all_slugs(): void {
		$this->seed_ware( 'crm' );
		$this->seed_ware( 'board' );
		$registry = new WareRegistry();

		$index = $registry->get_index();

		$this->assertArrayHasKey( 'crm', $index );
		$this->assertArrayHasKey( 'board', $index );
	}

	public function test_get_all_returns_full_manifests(): void {
		$this->seed_ware( 'crm' );
		$registry = new WareRegistry();

		$all = $registry->get_all();

		$this->assertArrayHasKey( 'crm', $all );
		$this->assertArrayHasKey( 'license', $all['crm'] );
	}

	// -------------------------------------------------------------------------
	// Unregister
	// -------------------------------------------------------------------------

	public function test_unregister_removes_ware(): void {
		$this->seed_ware( 'crm' );
		$registry = new WareRegistry();

		$result = $registry->unregister( 'crm' );

		$this->assertTrue( $result );
		$this->assertNull( $registry->get( 'crm' ) );
		$this->assertArrayNotHasKey( 'bazaar_ware_crm', $this->store );
	}

	public function test_unregister_returns_false_for_missing_ware(): void {
		$registry = new WareRegistry();
		$this->assertFalse( $registry->unregister( 'nobody' ) );
	}

	// -------------------------------------------------------------------------
	// Enable / Disable
	// -------------------------------------------------------------------------

	public function test_disable_sets_enabled_false(): void {
		$this->seed_ware( 'crm', array( 'enabled' => true ) );
		$registry = new WareRegistry();

		$result = $registry->disable( 'crm' );

		$this->assertTrue( $result );
		$ware = $registry->get( 'crm' );
		$this->assertFalse( $ware['enabled'] ?? true );
	}

	public function test_enable_sets_enabled_true(): void {
		$this->seed_ware( 'crm', array( 'enabled' => false ) );
		// Also mark the index entry as disabled.
		$index                       = json_decode( (string) $this->store['bazaar_index'], true );
		$index['crm']['enabled']     = false;
		$this->store['bazaar_index'] = (string) json_encode( $index );

		$registry = new WareRegistry();

		$result = $registry->enable( 'crm' );

		$this->assertTrue( $result );
		$ware = $registry->get( 'crm' );
		$this->assertTrue( $ware['enabled'] ?? false );
	}

	public function test_enable_returns_false_for_missing_ware(): void {
		$registry = new WareRegistry();
		$this->assertFalse( $registry->enable( 'ghost' ) );
	}

	// -------------------------------------------------------------------------
	// Dev URL
	// -------------------------------------------------------------------------

	public function test_set_dev_url_stores_url(): void {
		$this->seed_ware( 'crm' );
		$registry = new WareRegistry();

		$result = $registry->set_dev_url( 'crm', 'http://localhost:5173' );

		$this->assertTrue( $result );
		$ware = $registry->get( 'crm' );
		$this->assertSame( 'http://localhost:5173', $ware['dev_url'] ?? '' );
	}

	public function test_set_dev_url_returns_false_for_missing_ware(): void {
		$registry = new WareRegistry();
		$this->assertFalse( $registry->set_dev_url( 'ghost', 'http://localhost' ) );
	}

	public function test_clear_dev_url_removes_dev_url(): void {
		$this->seed_ware( 'crm', array( 'dev_url' => 'http://localhost:5173' ) );
		$registry = new WareRegistry();

		$result = $registry->clear_dev_url( 'crm' );

		$this->assertTrue( $result );
		$ware = $registry->get( 'crm' );
		$this->assertNotNull( $ware );
		$this->assertArrayNotHasKey( 'dev_url', $ware );
	}

	// -------------------------------------------------------------------------
	// Regression: migrate_legacy() stale index overwrite
	// -------------------------------------------------------------------------

	/**
	 * Before the fix, migrate_legacy() called register() for each ware (which
	 * saved sanitized index entries) but then overwrote the index with entries
	 * built from the raw, pre-sanitization $ware array.  The index should
	 * reflect the sanitized data that register() persisted.
	 */
	public function test_migrate_legacy_index_uses_sanitized_register_data(): void {
		// Remove the new-format index so load_index() triggers migration.
		unset( $this->store['bazaar_index'] );

		// Populate the legacy option with one ware.
		$this->store['bazaar_registry'] = json_encode(
			array(
				'crm' => array(
					'name'    => "Bad <script>Name</script>",
					'version' => '2.0.0',
					'entry'   => 'index.html',
					'slug'    => 'crm',
				),
			)
		);

		// sanitize_text_field strips tags; mock that behaviour.
		Functions\when( 'sanitize_text_field' )->alias( 'strip_tags' );

		$registry = new WareRegistry();

		// Trigger load (and therefore migration) by listing wares.
		$index = $registry->get_index();

		// The index should exist and contain the sanitized name.
		$this->assertArrayHasKey( 'crm', $index, 'Migrated ware must appear in index.' );
		$this->assertStringNotContainsString(
			'<script>',
			$index['crm']['name'] ?? '',
			'Index must use sanitized data from register(), not raw legacy data.'
		);
	}

	/**
	 * Migration must not recurse: calling load_index() inside register()
	 * (which happens during migration) must find the empty seed cache and
	 * return early, not call migrate_legacy() again.
	 */
	public function test_migrate_legacy_does_not_recurse(): void {
		unset( $this->store['bazaar_index'] );

		$this->store['bazaar_registry'] = json_encode(
			array(
				'crm'    => array( 'name' => 'CRM',    'version' => '1.0', 'slug' => 'crm' ),
				'board' => array( 'name' => 'Board', 'version' => '1.0', 'slug' => 'board' ),
			)
		);

		// Should not throw a stack-overflow / infinite recursion.
		$registry = new WareRegistry();
		$index    = $registry->get_index();

		$this->assertCount( 2, $index, 'Both wares must be migrated exactly once.' );
	}

	// -------------------------------------------------------------------------
	// Regression: make_index_entry null/non-array menu
	// -------------------------------------------------------------------------

	/**
	 * Registering a ware whose 'menu' field is null must not throw a TypeError
	 * and must produce sensible defaults in the index entry.
	 */
	public function test_register_with_null_menu_uses_defaults(): void {
		$registry = new WareRegistry();
		$result   = $registry->register(
			array(
				'slug'    => 'null-menu',
				'name'    => 'Null Menu Ware',
				'version' => '1.0.0',
				'menu'    => null,
			)
		);

		$this->assertTrue( $result, 'register() must succeed even when menu is null.' );

		$index = $registry->get_index();
		$this->assertArrayHasKey( 'null-menu', $index );
		$this->assertSame( 'Null Menu Ware', $index['null-menu']['menu_title'], 'menu_title must fall back to ware name.' );
		$this->assertSame( 'manage_options', $index['null-menu']['capability'], 'capability must fall back to manage_options.' );
	}

	/**
	 * Same guard: 'menu' set to a non-array scalar (e.g. from corrupted storage).
	 */
	public function test_register_with_non_array_menu_uses_defaults(): void {
		$registry = new WareRegistry();
		$result   = $registry->register(
			array(
				'slug'    => 'bad-menu',
				'name'    => 'Bad Menu Ware',
				'version' => '1.0.0',
				'menu'    => 'corrupted-string',
			)
		);

		$this->assertTrue( $result );

		$index = $registry->get_index();
		$this->assertSame( 'manage_options', $index['bad-menu']['capability'] );
	}

	// -------------------------------------------------------------------------
	// Regression: save_index / save_ware false-negative on unchanged value
	// -------------------------------------------------------------------------

	/**
	 * update_option() returns false when the value is unchanged.
	 * save_index() must treat this as success, not a failure.
	 */
	public function test_save_index_returns_true_when_value_unchanged(): void {
		// Return false from update_option to simulate "value unchanged" path.
		$store   = &$this->store;
		$encoded = json_encode( array( 'crm' => array( 'slug' => 'crm', 'name' => 'CRM' ) ) );

		Functions\when( 'update_option' )->alias(
			function ( string $opt, mixed $val ) use ( &$store ): bool {
				// Simulate WordPress: return false when value is the same.
				if ( isset( $store[ $opt ] ) && $store[ $opt ] === $val ) {
					return false;
				}
				$store[ $opt ] = $val;
				return true;
			}
		);

		$this->store['bazaar_index'] = $encoded;

		$this->seed_ware( 'crm' );
		$registry = new WareRegistry();

		// Re-enabling an already-enabled ware hits the "unchanged" path.
		$result = $registry->enable( 'crm' );

		// Must succeed even though update_option returned false.
		$this->assertTrue( $result, 'enable() must succeed when the stored value is unchanged.' );
	}

	// -------------------------------------------------------------------------
	// Corrupt JSON resilience
	// -------------------------------------------------------------------------

	/**
	 * load_index() must return an empty index when bazaar_index contains
	 * invalid JSON (corrupt database row), rather than crashing.
	 */
	public function test_get_index_returns_empty_when_stored_index_json_is_corrupt(): void {
		$this->store['bazaar_index'] = '{not valid json';
		$registry                    = new WareRegistry();
		$index                       = $registry->get_index();

		$this->assertSame( array(), $index, 'Corrupt bazaar_index must yield an empty index, not a PHP error.' );
	}

	// -------------------------------------------------------------------------
	// update_field — URL sanitizer + save_index failure propagation
	// -------------------------------------------------------------------------

	/**
	 * update_field('dev_url', …) must sanitize the value with esc_url_raw,
	 * not sanitize_text_field.  We verify this by recording which sanitizer
	 * was invoked for the dev_url field.
	 */
	public function test_update_field_sanitizes_dev_url_with_esc_url_raw(): void {
		$this->seed_ware( 'crm' );

		$sanitized_via = null;
		$store         = &$this->store;

		// Track esc_url_raw calls.
		Functions\when( 'esc_url_raw' )->alias(
			function ( string $url ) use ( &$sanitized_via ): string {
				$sanitized_via = 'esc_url_raw';
				return $url;
			}
		);
		// Track sanitize_text_field calls so we can distinguish them.
		Functions\when( 'sanitize_text_field' )->alias(
			function ( string $val ) use ( &$sanitized_via ): string {
				// Only overwrite if esc_url_raw hasn't been called yet for dev_url.
				if ( null === $sanitized_via ) {
					$sanitized_via = 'sanitize_text_field';
				}
				return $val;
			}
		);

		$registry = new WareRegistry();
		$result   = $registry->update_field( 'crm', 'dev_url', 'http://localhost:5173' );

		$this->assertTrue( $result );
		$this->assertSame(
			'esc_url_raw',
			$sanitized_via,
			'update_field must use esc_url_raw (not sanitize_text_field) for dev_url.'
		);
	}

	/**
	 * When save_index() fails (update_option returns false AND the stored value
	 * doesn't match what we tried to save), update_field must propagate false.
	 */
	public function test_update_field_returns_false_when_save_index_fails(): void {
		$this->seed_ware( 'crm' );

		Functions\when( 'esc_url_raw' )->returnArg();
		Functions\when( 'sanitize_file_name' )->returnArg();

		$store = &$this->store;

		// update_option always returns false AND stores a different value,
		// so the "no-change fallback" in save_index also fails.
		Functions\when( 'update_option' )->alias(
			function ( string $opt, mixed $val ) use ( &$store ): bool {
				// Store the new value so the ware write succeeds.
				if ( str_starts_with( $opt, 'bazaar_ware_' ) ) {
					$store[ $opt ] = $val;
					return true;
				}
				// The index write always fails AND leaves a stale different value.
				$store[ $opt ] = 'stale';
				return false;
			}
		);

		$registry = new WareRegistry();
		$result   = $registry->update_field( 'crm', 'name', 'Updated Name' );

		$this->assertFalse(
			$result,
			'update_field must return false when save_index fails.'
		);
	}

	/**
	 * get() must return null when the per-ware option contains invalid JSON.
	 * A corrupt ware option must not propagate to callers as a crash.
	 */
	public function test_get_returns_null_when_ware_option_json_is_corrupt(): void {
		// Seed the index so the slug looks registered.
		$this->store['bazaar_index']      = (string) json_encode( array(
			'crm' => array(
				'slug'        => 'crm',
				'name'        => 'CRM',
				'enabled'     => true,
				'version'     => '1.0.0',
				'icon'        => '',
				'entry'       => 'index.html',
				'menu_title'  => 'CRM',
				'capability'  => 'manage_options',
				'group'       => null,
				'dev_url'     => null,
				'permissions' => array(),
			),
		) );
		// But the ware-specific option is corrupt.
		$this->store['bazaar_ware_crm']   = '{not valid json';

		$registry = new WareRegistry();
		$result   = $registry->get( 'crm' );

		$this->assertNull( $result, 'Corrupt per-ware option must return null, not crash.' );
	}
}
