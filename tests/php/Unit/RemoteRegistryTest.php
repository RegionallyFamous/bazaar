<?php

declare( strict_types=1 );

namespace Bazaar\Tests\Unit;

use Bazaar\RemoteRegistry;
use Brain\Monkey\Functions;
use Bazaar\Tests\WareTestCase;

/**
 * Unit tests for RemoteRegistry.
 */
final class RemoteRegistryTest extends WareTestCase {

	// ─── bust_cache ──────────────────────────────────────────────────────────

	public function test_bust_cache_deletes_transient(): void {
		$deleted_key = null;
		Functions\when( 'get_option' )->justReturn( '' );
		Functions\when( 'esc_url_raw' )->returnArg();
		Functions\when( 'delete_transient' )->alias(
			function ( string $key ) use ( &$deleted_key ): bool {
				$deleted_key = $key;
				return true;
			}
		);

		$registry = new RemoteRegistry();
		$registry->bust_cache();

		$this->assertSame( 'bazaar_remote_registry', $deleted_key );
	}

	// ─── check_update ────────────────────────────────────────────────────────

	public function test_check_update_returns_no_update_when_ware_not_in_registry(): void {
		Functions\when( 'get_option' )->justReturn( '' );
		Functions\when( 'esc_url_raw' )->returnArg();
		// Cache miss → make fetch() return WP_Error (e.g. network failure).
		Functions\when( 'get_transient' )->justReturn( false );
		$wp_error = new \WP_Error( 'http_request_failed', 'Network error' );
		Functions\when( 'wp_remote_get' )->justReturn( $wp_error );
		Functions\when( 'get_bloginfo' )->justReturn( '6.7' );

		$registry = new RemoteRegistry();
		$result   = $registry->check_update(
			array(
				'slug'    => 'crm',
				'version' => '1.0.0',
			)
		);

		$this->assertFalse( $result['has_update'] );
		$this->assertSame( '1.0.0', $result['current'] );
		$this->assertSame( '', $result['latest'] );
	}

	public function test_check_update_detects_newer_version(): void {
		$cached_index = array(
			array(
				'slug'         => 'crm',
				'name'         => 'CRM',
				'version'      => '2.0.0',
				'download_url' => 'https://example.com/crm.wp',
			),
		);

		Functions\when( 'get_option' )->justReturn( '' );
		Functions\when( 'esc_url_raw' )->returnArg();
		Functions\when( 'get_transient' )->justReturn( $cached_index );

		$registry = new RemoteRegistry();
		$result   = $registry->check_update(
			array(
				'slug'    => 'crm',
				'version' => '1.0.0',
			)
		);

		$this->assertTrue( $result['has_update'] );
		$this->assertSame( '1.0.0', $result['current'] );
		$this->assertSame( '2.0.0', $result['latest'] );
		$this->assertArrayHasKey( 'entry', $result );
	}

	public function test_check_update_returns_no_update_when_version_is_same(): void {
		$cached_index = array(
			array(
				'slug'    => 'crm',
				'name'    => 'CRM',
				'version' => '1.0.0',
			),
		);

		Functions\when( 'get_option' )->justReturn( '' );
		Functions\when( 'esc_url_raw' )->returnArg();
		Functions\when( 'get_transient' )->justReturn( $cached_index );

		$registry = new RemoteRegistry();
		$result   = $registry->check_update(
			array(
				'slug'    => 'crm',
				'version' => '1.0.0',
			)
		);

		$this->assertFalse( $result['has_update'] );
	}

	// ─── get ────────────────────────────────────────────────────────────────

	public function test_get_returns_ware_from_cached_registry(): void {
		$cached_index = array(
			array(
				'slug'    => 'board',
				'name'    => 'Board',
				'version' => '3.1.0',
			),
		);

		Functions\when( 'get_option' )->justReturn( '' );
		Functions\when( 'esc_url_raw' )->returnArg();
		Functions\when( 'get_transient' )->justReturn( $cached_index );
		Functions\when( 'sprintf' )->alias( 'sprintf' );

		$registry = new RemoteRegistry();
		$result   = $registry->get( 'board' );

		$this->assertIsArray( $result );
		$this->assertSame( 'board', $result['slug'] );
	}

	public function test_get_returns_wp_error_for_unknown_slug(): void {
		$cached_index = array(
			array(
				'slug'    => 'crm',
				'name'    => 'CRM',
				'version' => '1.0.0',
			),
		);

		Functions\when( 'get_option' )->justReturn( '' );
		Functions\when( 'esc_url_raw' )->returnArg();
		Functions\when( 'get_transient' )->justReturn( $cached_index );
		Functions\when( 'sprintf' )->alias( 'sprintf' );

		$registry = new RemoteRegistry();
		$result   = $registry->get( 'unknown-ware' );

		$this->assertInstanceOf( \WP_Error::class, $result );
		$this->assertSame( 'not_found', $result->get_error_code() );
	}

	// ─── search ─────────────────────────────────────────────────────────────

	public function test_search_filters_by_name(): void {
		$cached_index = array(
			array(
				'slug'        => 'crm',
				'name'        => 'Simple CRM',
				'version'     => '1.0.0',
				'description' => '',
			),
			array(
				'slug'        => 'board',
				'name'        => 'Board',
				'version'     => '1.0.0',
				'description' => '',
			),
		);

		Functions\when( 'get_option' )->justReturn( '' );
		Functions\when( 'esc_url_raw' )->returnArg();
		Functions\when( 'get_transient' )->justReturn( $cached_index );

		$registry = new RemoteRegistry();
		$results  = $registry->search( 'crm' );

		$this->assertIsArray( $results );
		$this->assertCount( 1, $results );
		$this->assertSame( 'crm', $results[0]['slug'] );
	}

	// ─── install() regressions ───────────────────────────────────────────────

	/**
	 * install() must return WP_Error('no_download_url') when the remote entry
	 * has no download URL, before WareLoader or WareRegistry are ever touched.
	 */
	public function test_install_returns_no_download_url_when_missing(): void {
		Functions\when( 'get_option' )->justReturn( '' );
		Functions\when( 'esc_url_raw' )->returnArg();
		Functions\when( 'absint' )->alias( 'intval' );
		Functions\when( 'wp_json_encode' )->alias( 'json_encode' );
		Functions\when( 'gmdate' )->alias( 'gmdate' );
		Functions\when( 'get_bloginfo' )->justReturn( '6.6' );
		Functions\when( 'get_transient' )->justReturn(
			array(
				array( 'slug' => 'crm', 'name' => 'CRM', 'version' => '1.0.0' ), // No download_url.
			)
		);
		Functions\when( 'set_transient' )->justReturn( true );
		Functions\when( 'delete_transient' )->justReturn( true );

		$remote   = new RemoteRegistry();
		// Use real (final) instances — install() should bail before calling them.
		$registry = new \Bazaar\WareRegistry();
		$loader   = new \Bazaar\WareLoader( $registry );

		$result = $remote->install( 'crm', $loader, $registry );

		$this->assertInstanceOf( \WP_Error::class, $result );
		$this->assertSame( 'no_download_url', $result->get_error_code() );
	}

	public function test_search_empty_query_returns_all(): void {
		$cached_index = array(
			array(
				'slug'        => 'crm',
				'name'        => 'CRM',
				'version'     => '1.0.0',
				'description' => '',
			),
			array(
				'slug'        => 'board',
				'name'        => 'Board',
				'version'     => '1.0.0',
				'description' => '',
			),
		);

		Functions\when( 'get_option' )->justReturn( '' );
		Functions\when( 'esc_url_raw' )->returnArg();
		Functions\when( 'get_transient' )->justReturn( $cached_index );

		$registry = new RemoteRegistry();
		$results  = $registry->search( '' );

		$this->assertCount( 2, $results );
	}

	// ─── fetch() error matrix ────────────────────────────────────────────────

	/**
	 * Helper: set up stubs that make fetch() trigger a live HTTP call.
	 * Tests override individual stubs to produce the scenario they need.
	 */
	private function stub_for_live_fetch( string $body, int $code, bool $is_wp_error_response = false ): void {
		Functions\when( 'get_option' )->justReturn( '' );
		Functions\when( 'esc_url_raw' )->returnArg();
		Functions\when( 'get_bloginfo' )->justReturn( '6.6' );
		Functions\when( 'get_transient' )->justReturn( false ); // Cache miss.
		Functions\when( 'set_transient' )->justReturn( true );
		Functions\when( 'sprintf' )->alias( 'sprintf' );

		if ( $is_wp_error_response ) {
			Functions\when( 'wp_remote_get' )->justReturn( new \WP_Error( 'http_request_failed', 'cURL error' ) );
		} else {
			Functions\when( 'wp_remote_get' )->justReturn(
				array( 'response' => array( 'code' => $code ), 'body' => $body )
			);
			Functions\when( 'wp_remote_retrieve_response_code' )->justReturn( $code );
			Functions\when( 'wp_remote_retrieve_body' )->justReturn( $body );
		}
	}

	public function test_fetch_returns_wp_error_when_remote_get_fails(): void {
		$this->stub_for_live_fetch( '', 0, true );

		$registry = new RemoteRegistry();
		$result   = $registry->search( 'crm' ); // search() → fetch() internally.

		// When wp_remote_get returns WP_Error (e.g. cURL failure), fetch()
		// propagates it directly — the original error code is preserved.
		$this->assertInstanceOf( \WP_Error::class, $result );
		$this->assertSame( 'http_request_failed', $result->get_error_code() );
	}

	public function test_fetch_returns_wp_error_on_non_200_http_status(): void {
		$this->stub_for_live_fetch( '', 503 );

		$registry = new RemoteRegistry();
		$result   = $registry->search( 'crm' );

		$this->assertInstanceOf( \WP_Error::class, $result );
		$this->assertSame( 'registry_http_error', $result->get_error_code() );
	}

	public function test_fetch_returns_wp_error_for_invalid_json_body(): void {
		$this->stub_for_live_fetch( '{not valid json', 200 );

		$registry = new RemoteRegistry();
		$result   = $registry->search( 'crm' );

		$this->assertInstanceOf( \WP_Error::class, $result );
		$this->assertSame( 'registry_invalid', $result->get_error_code() );
	}

	public function test_fetch_returns_wp_error_when_wares_key_missing(): void {
		$this->stub_for_live_fetch( '{"data":[]}', 200 );

		$registry = new RemoteRegistry();
		$result   = $registry->search( 'crm' );

		$this->assertInstanceOf( \WP_Error::class, $result );
		$this->assertSame( 'registry_invalid', $result->get_error_code() );
	}

	public function test_fetch_caches_result_on_success(): void {
		$cached_key = null;
		$valid_body = (string) json_encode( array( 'wares' => array( array( 'slug' => 'crm', 'name' => 'CRM', 'version' => '1.0.0' ) ) ) );

		$this->stub_for_live_fetch( $valid_body, 200 );
		Functions\when( 'set_transient' )->alias(
			function ( string $key, mixed $val, int $ttl ) use ( &$cached_key ): bool {
				$cached_key = $key;
				return true;
			}
		);

		$registry = new RemoteRegistry();
		$registry->search( '' );

		$this->assertSame( 'bazaar_remote_registry', $cached_key );
	}
}
