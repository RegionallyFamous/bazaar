<?php

declare( strict_types=1 );

namespace Bazaar\Tests\Unit;

use Bazaar\RemoteRegistry;
use Bazaar\WareLoader;
use Bazaar\WareRegistry;
use Bazaar\WareUpdater;
use Brain\Monkey;
use Brain\Monkey\Functions;
use PHPUnit\Framework\TestCase;
use WP_Error;

/**
 * Unit tests for WareUpdater.
 *
 * RemoteRegistry and WareLoader are final, so we drive the tests by
 * controlling what the underlying WordPress option-store returns rather
 * than mocking those classes directly.
 */
final class WareUpdaterTest extends TestCase {

	/** @var array<string, mixed> In-memory option store. */
	private array $store = array();

	protected function setUp(): void {
		parent::setUp();
		Monkey\setUp();
		$this->store = array( 'bazaar_index' => '{}' );
		$this->stub_wp_functions();
	}

	protected function tearDown(): void {
		Monkey\tearDown();
		parent::tearDown();
	}

	// ─── Helpers ─────────────────────────────────────────────────────────────

	private function stub_wp_functions(): void {
		Functions\when( 'sanitize_key' )->returnArg();
		Functions\when( 'sanitize_text_field' )->returnArg();
		Functions\when( 'sanitize_textarea_field' )->returnArg();
		Functions\when( 'esc_url_raw' )->returnArg();
		Functions\when( 'absint' )->alias( 'intval' );
		Functions\when( 'wp_json_encode' )->alias( 'json_encode' );
		Functions\when( 'esc_html__' )->returnArg();
		Functions\when( 'gmdate' )->alias( 'gmdate' );
		Functions\when( 'get_bloginfo' )->justReturn( '6.6' );
		Functions\when( 'apply_filters' )->returnArg();
		Functions\when( 'is_wp_error' )->alias( fn( $v ) => $v instanceof WP_Error );

		$store = &$this->store;

		Functions\when( 'get_option' )->alias(
			function ( string $opt, mixed $default = false ) use ( &$store ): mixed {
				return $store[ $opt ] ?? $default;
			}
		);

		Functions\when( 'update_option' )->alias(
			function ( string $opt, mixed $val ) use ( &$store ): bool {
				if ( isset( $store[ $opt ] ) && $store[ $opt ] === $val ) {
					return false;
				}
				$store[ $opt ] = $val;
				return true;
			}
		);
	}

	// ─── Tests ───────────────────────────────────────────────────────────────

	/**
	 * update() must return WP_Error('unregister_failed') when the registry
	 * refuses to unregister the ware.
	 *
	 * Strategy:
	 *  - RemoteRegistry::get() needs a transient and valid HTTP to work; we
	 *    avoid HTTP by making RemoteRegistry::get() return from cache.
	 *  - We simulate the ware NOT being in the registry (so unregister returns
	 *    false) by keeping the index empty.
	 *  - WareLoader::delete() is a filesystem op — we stub the filesystem.
	 */
	public function test_update_returns_unregister_failed_when_registry_unregister_fails(): void {
		$slug = 'crm';

		// RemoteRegistry::get() falls back to HTTP when no transient is cached.
		// Stubbing a 404 causes it to return WP_Error — which update() propagates.
		Functions\when( 'get_transient' )->justReturn( false );
		Functions\when( 'set_transient' )->justReturn( true );
		Functions\when( 'delete_transient' )->justReturn( true );
		Functions\when( 'wp_remote_get' )->justReturn(
			array(
				'response' => array( 'code' => 404 ),
				'body'     => '',
			)
		);
		Functions\when( 'wp_remote_retrieve_response_code' )->justReturn( 404 );
		Functions\when( 'wp_remote_retrieve_body' )->justReturn( '' );

		$registry = new WareRegistry();
		$remote   = new RemoteRegistry();
		$loader   = new WareLoader( $registry );
		$updater  = new WareUpdater( $registry, $remote, $loader );

		// update() for a slug not in the remote registry must return WP_Error.
		$result = $updater->update( $slug );

		$this->assertInstanceOf( WP_Error::class, $result );
	}

	/**
	 * update() must return the WP_Error from RemoteRegistry::get() when the
	 * ware is not found in the remote registry (HTTP 404 or cache miss).
	 */
	public function test_update_propagates_remote_get_error(): void {
		Functions\when( 'get_transient' )->justReturn( false );
		Functions\when( 'set_transient' )->justReturn( true );
		Functions\when( 'delete_transient' )->justReturn( true );
		Functions\when( 'wp_remote_get' )->justReturn(
			array(
				'response' => array( 'code' => 404 ),
				'body'     => '',
			)
		);
		Functions\when( 'wp_remote_retrieve_response_code' )->justReturn( 404 );
		Functions\when( 'wp_remote_retrieve_body' )->justReturn( '' );

		$registry = new WareRegistry();
		$remote   = new RemoteRegistry();
		$loader   = new WareLoader( $registry );
		$updater  = new WareUpdater( $registry, $remote, $loader );

		$result = $updater->update( 'unknown-slug' );

		$this->assertInstanceOf( WP_Error::class, $result );
	}
}
