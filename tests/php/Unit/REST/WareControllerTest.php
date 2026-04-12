<?php

declare( strict_types=1 );

namespace Bazaar\Tests\Unit\REST;

use Bazaar\REST\WareController;
use Bazaar\WareRegistry;
use Brain\Monkey;
use Brain\Monkey\Functions;
use PHPUnit\Framework\TestCase;
use WP_REST_Request;
use WP_REST_Response;

/**
 * Unit tests for WareController REST handlers.
 *
 * Tests call handler methods directly — no HTTP layer involved.
 * Uses a real WareRegistry backed by an in-memory option store.
 */
final class WareControllerTest extends TestCase {

	/** @var array<string, mixed> */
	private array $store = array();

	protected function setUp(): void {
		parent::setUp();
		Monkey\setUp();
		$this->store = array(
			'bazaar_index' => '{}',
		);
		$this->stub_wp_functions();
		Functions\when( 'register_rest_route' )->justReturn( true );
	}

	protected function tearDown(): void {
		Monkey\tearDown();
		parent::tearDown();
	}

	// ─── Helpers ─────────────────────────────────────────────────────────────

	private function stub_wp_functions(): void {
		$store = &$this->store;

		Functions\when( 'sanitize_key' )->returnArg();
		Functions\when( 'sanitize_text_field' )->returnArg();
		Functions\when( 'sanitize_textarea_field' )->returnArg();
		Functions\when( 'esc_url_raw' )->returnArg();
		Functions\when( 'esc_html__' )->returnArg();
		Functions\when( 'esc_html' )->returnArg();
		Functions\when( 'absint' )->alias( 'intval' );
		Functions\when( 'wp_json_encode' )->alias( 'json_encode' );
		Functions\when( 'gmdate' )->alias( 'gmdate' );
		Functions\when( 'sprintf' )->alias( 'sprintf' );

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

	/** Build a full ware entry and seed it into the in-memory store. */
	private function seed_ware( string $slug, bool $enabled = true ): void {
		$ware = array(
			'slug'        => $slug,
			'name'        => ucfirst( $slug ),
			'version'     => '1.0.0',
			'enabled'     => $enabled,
			'icon'        => 'icon.svg',
			'entry'       => 'index.html',
			'author'      => '',
			'description' => '',
			'menu'        => array(
				'title'      => ucfirst( $slug ),
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
			'installed'   => '2025-01-01T00:00:00Z',
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

	// ─── get_index ───────────────────────────────────────────────────────────

	public function test_get_index_returns_200_with_index_entries(): void {
		$this->seed_ware( 'crm' );
		$this->seed_ware( 'board' );

		$controller = new WareController( new WareRegistry() );
		$response   = $controller->get_index();

		$this->assertInstanceOf( WP_REST_Response::class, $response );
		$this->assertSame( 200, $response->get_status() );
		$this->assertCount( 2, $response->get_data() );
	}

	// ─── list_wares ──────────────────────────────────────────────────────────

	public function test_list_wares_returns_all_wares_by_default(): void {
		$this->seed_ware( 'crm', true );
		$this->seed_ware( 'board', false );

		$request = new WP_REST_Request();
		$request->set_param( 'status', 'all' );

		$controller = new WareController( new WareRegistry() );
		$response   = $controller->list_wares( $request );

		$this->assertSame( 200, $response->get_status() );
		$this->assertCount( 2, $response->get_data() );
	}

	public function test_list_wares_filters_enabled(): void {
		$this->seed_ware( 'crm', true );
		$this->seed_ware( 'board', false );

		$request = new WP_REST_Request();
		$request->set_param( 'status', 'enabled' );

		$controller = new WareController( new WareRegistry() );
		$response   = $controller->list_wares( $request );

		$data = $response->get_data();
		$this->assertCount( 1, $data );
		$this->assertSame( 'crm', $data[0]['slug'] );
	}

	public function test_list_wares_filters_disabled(): void {
		$this->seed_ware( 'crm', true );
		$this->seed_ware( 'board', false );

		$request = new WP_REST_Request();
		$request->set_param( 'status', 'disabled' );

		$controller = new WareController( new WareRegistry() );
		$response   = $controller->list_wares( $request );

		$data = $response->get_data();
		$this->assertCount( 1, $data );
		$this->assertSame( 'board', $data[0]['slug'] );
	}

	// ─── get_ware ────────────────────────────────────────────────────────────

	public function test_get_ware_returns_200_for_known_slug(): void {
		$this->seed_ware( 'crm' );

		$request = new WP_REST_Request();
		$request->set_param( 'slug', 'crm' );

		$controller = new WareController( new WareRegistry() );
		$response   = $controller->get_ware( $request );

		$this->assertInstanceOf( WP_REST_Response::class, $response );
		$this->assertSame( 200, $response->get_status() );
		$this->assertSame( 'crm', $response->get_data()['slug'] );
	}

	public function test_get_ware_returns_404_for_unknown_slug(): void {
		$request = new WP_REST_Request();
		$request->set_param( 'slug', 'unknown' );

		$controller = new WareController( new WareRegistry() );
		$result     = $controller->get_ware( $request );

		$this->assertInstanceOf( \WP_Error::class, $result );
		$this->assertSame( 'ware_not_found', $result->get_error_code() );
	}

	// ─── toggle ──────────────────────────────────────────────────────────────

	public function test_toggle_enable_returns_200(): void {
		$this->seed_ware( 'crm', false );
		// Adjust index to show disabled.
		$index                       = json_decode( (string) $this->store['bazaar_index'], true );
		$index['crm']['enabled']     = false;
		$this->store['bazaar_index'] = (string) json_encode( $index );

		$request = new WP_REST_Request();
		$request->set_param( 'slug', 'crm' );
		$request->set_param( 'enabled', true );

		$controller = new WareController( new WareRegistry() );
		$response   = $controller->toggle( $request );

		$this->assertInstanceOf( WP_REST_Response::class, $response );
		$this->assertSame( 200, $response->get_status() );
	}

	public function test_toggle_returns_404_for_unknown_slug(): void {
		$request = new WP_REST_Request();
		$request->set_param( 'slug', 'ghost' );
		$request->set_param( 'enabled', true );

		$controller = new WareController( new WareRegistry() );
		$result     = $controller->toggle( $request );

		$this->assertInstanceOf( \WP_Error::class, $result );
		$this->assertSame( 'ware_not_found', $result->get_error_code() );
	}

	public function test_toggle_disable_returns_200(): void {
		$this->seed_ware( 'crm', true );

		$request = new WP_REST_Request();
		$request->set_param( 'slug', 'crm' );
		$request->set_param( 'enabled', false );

		$controller = new WareController( new WareRegistry() );
		$response   = $controller->toggle( $request );

		$this->assertInstanceOf( WP_REST_Response::class, $response );
		$this->assertSame( 200, $response->get_status() );
	}

	// ─── delete ──────────────────────────────────────────────────────────────

	public function test_delete_returns_404_for_unknown_slug(): void {
		$request = new WP_REST_Request();
		$request->set_param( 'slug', 'ghost' );

		$controller = new WareController( new WareRegistry() );
		$result     = $controller->delete( $request );

		$this->assertInstanceOf( \WP_Error::class, $result );
		$this->assertSame( 'ware_not_found', $result->get_error_code() );
	}

	/**
	 * Regression: before the fix, unregister()'s return value was ignored.
	 * If files are deleted but the registry update fails, delete() must return
	 * a 500 error rather than silently reporting success.
	 *
	 * We test this by making save_index() fail (update_option returns false
	 * AND get_option returns a stale value so the fallback also fails).
	 * WareLoader::delete() returns true immediately because the ware directory
	 * does not exist on the test filesystem.
	 */
	public function test_delete_returns_500_when_unregister_fails(): void {
		$this->seed_ware( 'crm' );

		// Re-stub get_option and update_option so save_index() returns false.
		// After this re-stub, the registry's in-memory cache (already loaded in
		// the constructor call below) returns the seeded ware while saves fail.
		$store = &$this->store;

		// Build the registry and PRIME its lazy index_cache before overriding
		// stubs.  The registry uses lazy loading — constructing it alone does not
		// read the index.  Calling get_index() forces load_index() to populate
		// index_cache from $store while the original stubs are still active.
		$registry = new WareRegistry();
		$registry->get_index(); // primes index_cache

		// Now re-stub so that subsequent save_index() calls inside unregister() fail.
		// update_option returns false for the index; get_option returns a stale/
		// mismatched value so the "unchanged" fallback in save_index() also fails.
		Functions\when( 'update_option' )->alias(
			function ( string $opt, mixed $val ) use ( &$store ): bool {
				if ( $opt === 'bazaar_index' ) {
					return false; // Simulate DB failure for the index save.
				}
				$store[ $opt ] = $val;
				return true;
			}
		);

		Functions\when( 'get_option' )->alias(
			function ( string $opt, mixed $default = false ) use ( &$store ): mixed {
				if ( $opt === 'bazaar_index' ) {
					return '{"stale":"data"}'; // Mismatch → fallback check also fails.
				}
				return $store[ $opt ] ?? $default;
			}
		);

		$request = new WP_REST_Request();
		$request->set_param( 'slug', 'crm' );

		$controller = new WareController( $registry );
		$result     = $controller->delete( $request );

		$this->assertInstanceOf( \WP_Error::class, $result );
		$this->assertSame( 'unregister_failed', $result->get_error_code() );
		$this->assertSame( 500, ( $result->get_error_data() )['status'] );
	}
}
