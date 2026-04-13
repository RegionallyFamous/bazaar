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
	 * update() must return a WP_Error when RemoteRegistry::get() fails (e.g. HTTP 404).
	 * The test was previously misnamed as "unregister_failed" — it actually tests
	 * the propagation of a remote-get failure before unregister is ever reached.
	 */
	public function test_update_propagates_wp_error_from_remote_get(): void {
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

	/**
	 * get_outdated() must return an empty array when the stored option contains
	 * invalid JSON (guards against corrupt data crashing callers).
	 */
	public function test_get_outdated_returns_empty_array_for_corrupt_option(): void {
		$this->store['bazaar_outdated_wares'] = '{not valid json';

		Functions\when( 'get_transient' )->justReturn( false );
		Functions\when( 'esc_html__' )->returnArg();
		Functions\when( 'is_wp_error' )->alias( fn( $v ) => $v instanceof WP_Error );

		$registry = new WareRegistry();
		$remote   = new RemoteRegistry();
		$loader   = new WareLoader( $registry );
		$updater  = new WareUpdater( $registry, $remote, $loader );

		$result = $updater->get_outdated();

		$this->assertSame( array(), $result );
	}

	/**
	 * update() must return WP_Error('unregister_failed') when the ware exists
	 * in the registry but the unregister call itself fails.
	 *
	 * Strategy: seed the ware into the local registry; force save_index to fail
	 * by making update_option return false.
	 */
	public function test_update_returns_unregister_failed_when_local_registry_unregister_fails(): void {
		$slug = 'crm';

		// Seed ware into local registry via the in-memory store.
		$ware = array(
			'slug'        => $slug,
			'name'        => 'CRM',
			'version'     => '1.0.0',
			'enabled'     => true,
			'icon'        => '',
			'entry'       => 'index.html',
			'author'      => '',
			'description' => '',
			'menu'        => array(
				'title'      => 'CRM',
				'position'   => null,
				'capability' => 'manage_options',
				'parent'     => null,
				'group'      => null,
			),
			'permissions' => array(),
			'license'     => array( 'type' => 'free', 'url' => '', 'required' => 'false' ),
			'registry'    => array(),
			'installed'   => '2025-01-01T00:00:00Z',
		);
		$index = array(
			$slug => array(
				'slug'        => $slug,
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
		);
		$this->store['bazaar_index']            = (string) json_encode( $index );
		$this->store[ "bazaar_ware_{$slug}" ]   = (string) json_encode( $ware );

		// Serve the ware from remote cache.
		Functions\when( 'get_transient' )->justReturn(
			array(
				array(
					'slug'         => $slug,
					'name'         => 'CRM',
					'version'      => '2.0.0',
					'download_url' => 'https://example.com/crm.wp',
				),
			)
		);
		Functions\when( 'is_wp_error' )->alias( fn( $v ) => $v instanceof WP_Error );
		Functions\when( 'esc_html__' )->returnArg();
		Functions\when( 'esc_html' )->returnArg();
		Functions\when( 'sprintf' )->alias( 'sprintf' );

		// Override update_option to fail for the index so unregister() fails.
		$store = &$this->store;
		Functions\when( 'update_option' )->alias(
			function ( string $opt, mixed $val ) use ( &$store ): bool {
				if ( 'bazaar_index' === $opt ) {
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

		$registry = new WareRegistry();
		$remote   = new RemoteRegistry();
		$loader   = new WareLoader( $registry );
		$updater  = new WareUpdater( $registry, $remote, $loader );

		$result = $updater->update( $slug );

		$this->assertInstanceOf( WP_Error::class, $result );
		$this->assertSame( 'unregister_failed', $result->get_error_code() );
	}
}
