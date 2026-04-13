<?php

declare( strict_types=1 );

namespace Bazaar\Tests\Unit;

use Bazaar\MenuManager;
use Bazaar\WareRegistry;
use Brain\Monkey\Functions;
use Bazaar\Tests\WareTestCase;

/**
 * Unit tests for MenuManager.
 *
 * MenuManager is deprecated (the shell/iframe architecture is the active UX
 * path) but its logic is still exercised here to prevent silent regressions
 * for any site that opted in to the legacy menu path.
 */
final class MenuManagerTest extends WareTestCase {

	/** @var array<string, mixed> In-memory option store. */
	private array $store = array();

	/** @var array<string, int> Call counters keyed by WP function name. */
	private array $calls = array();

	private WareRegistry $registry;
	private MenuManager  $manager;

	protected function setUp(): void {
		parent::setUp();

		$this->store = array( 'bazaar_index' => '{}' );
		$this->calls = array(
			'add_menu_page'    => 0,
			'add_submenu_page' => 0,
		);
		$this->stub_wp_functions();

		if ( ! defined( 'BAZAAR_WARES_DIR' ) ) {
			define( 'BAZAAR_WARES_DIR', sys_get_temp_dir() . '/bazaar-test-wares/' );
		}

		$this->registry = new WareRegistry();
		$this->manager  = new MenuManager( $this->registry );
	}

	// ── Helpers ───────────────────────────────────────────────────────────────

	private function stub_wp_functions(): void {
		Functions\when( 'esc_url_raw' )->returnArg();
		Functions\when( 'absint' )->alias( 'intval' );
		Functions\when( 'wp_json_encode' )->alias( 'json_encode' );
		Functions\when( 'gmdate' )->alias( 'gmdate' );
		Functions\when( 'sanitize_title' )->returnArg();
		Functions\when( 'rest_url' )->alias( fn( $path ) => 'https://example.com/wp-json/' . ltrim( $path, '/' ) );
		Functions\when( 'esc_url' )->returnArg();

		$calls = &$this->calls;
		$store = &$this->store;

		Functions\when( 'add_menu_page' )->alias(
			function () use ( &$calls ) {
				$calls['add_menu_page']++;
				return '';
			}
		);
		Functions\when( 'add_submenu_page' )->alias(
			function () use ( &$calls ) {
				$calls['add_submenu_page']++;
				return '';
			}
		);
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
	}

	/**
	 * Register a ware into the test registry with the given enabled state.
	 *
	 * @param string  $slug
	 * @param bool    $enabled
	 * @param mixed[] $menu   Optional menu overrides.
	 */
	private function register_ware( string $slug, bool $enabled = true, array $menu = array() ): void {
		$manifest = array(
			'slug'    => $slug,
			'name'    => 'Test Ware',
			'version' => '1.0.0',
			'entry'   => 'index.html',
		);
		if ( ! empty( $menu ) ) {
			$manifest['menu'] = $menu;
		}
		$this->registry->register( $manifest );
		if ( ! $enabled ) {
			$this->registry->disable( $slug );
		}
	}

	// ── register() ────────────────────────────────────────────────────────────

	public function test_register_skips_disabled_wares(): void {
		$this->register_ware( 'my-ware', false );
		$this->manager->register();

		$this->assertSame( 0, $this->calls['add_menu_page'] );
		$this->assertSame( 0, $this->calls['add_submenu_page'] );
	}

	public function test_register_adds_top_level_menu_for_enabled_ware(): void {
		$this->register_ware( 'my-ware' );
		$this->manager->register();

		$this->assertSame( 1, $this->calls['add_menu_page'] );
		$this->assertSame( 0, $this->calls['add_submenu_page'] );
	}

	public function test_register_adds_submenu_when_parent_is_set(): void {
		$this->register_ware( 'my-ware', true, array( 'parent' => 'options-general.php' ) );
		$this->manager->register();

		$this->assertSame( 0, $this->calls['add_menu_page'] );
		$this->assertSame( 1, $this->calls['add_submenu_page'] );
	}

	public function test_register_uses_default_capability_when_not_specified(): void {
		$capability_used = '';
		Functions\when( 'add_menu_page' )->alias(
			function ( $p, $m, $cap ) use ( &$capability_used ) {
				$capability_used = $cap;
				return '';
			}
		);

		$this->register_ware( 'my-ware' );
		$this->manager->register();

		$this->assertSame( 'manage_options', $capability_used );
	}

	public function test_register_uses_custom_capability_from_manifest(): void {
		$capability_used = '';
		Functions\when( 'add_menu_page' )->alias(
			function ( $p, $m, $cap ) use ( &$capability_used ) {
				$capability_used = $cap;
				return '';
			}
		);

		$this->register_ware( 'my-ware', true, array( 'capability' => 'edit_posts' ) );
		$this->manager->register();

		$this->assertSame( 'edit_posts', $capability_used );
	}
}
