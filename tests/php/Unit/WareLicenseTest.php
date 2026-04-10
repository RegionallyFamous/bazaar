<?php

declare( strict_types=1 );

namespace Bazaar\Tests\Unit;

use Bazaar\WareLicense;
use Brain\Monkey;
use Brain\Monkey\Functions;
use PHPUnit\Framework\TestCase;

/**
 * Unit tests for WareLicense.
 */
final class WareLicenseTest extends TestCase {

	/** @var array<string, mixed> */
	private array $store = array();

	protected function setUp(): void {
		parent::setUp();
		Monkey\setUp();
		$this->store = array();
		$this->stub_option_functions();
	}

	protected function tearDown(): void {
		Monkey\tearDown();
		parent::tearDown();
	}

	private function stub_option_functions(): void {
		$store = &$this->store;

		Functions\when( 'sanitize_key' )->returnArg();
		Functions\when( 'sanitize_text_field' )->returnArg();

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

		Functions\when( 'wp_json_encode' )->alias( 'json_encode' );
	}

	// ─── is_licensed ────────────────────────────────────────────────────────

	public function test_free_ware_is_always_licensed(): void {
		$license = new WareLicense();
		$this->assertTrue(
			$license->is_licensed(
				array(
					'slug'    => 'crm',
					'license' => array( 'type' => 'free' ),
				)
			)
		);
	}

	public function test_open_source_ware_is_always_licensed(): void {
		$license = new WareLicense();
		$this->assertTrue(
			$license->is_licensed(
				array(
					'slug'    => 'crm',
					'license' => array( 'type' => 'open-source' ),
				)
			)
		);
	}

	public function test_ware_with_no_license_field_is_free(): void {
		$license = new WareLicense();
		$this->assertTrue( $license->is_licensed( array( 'slug' => 'crm' ) ) );
	}

	public function test_paid_ware_without_stored_key_is_not_licensed(): void {
		$license = new WareLicense();
		// No license option stored → get_option returns false → load() returns []
		$this->assertFalse(
			$license->is_licensed(
				array(
					'slug'    => 'crm',
					'license' => array( 'type' => 'key' ),
				)
			)
		);
	}

	public function test_paid_ware_with_valid_key_is_licensed(): void {
		// Pre-store a validated, non-expired license.
		$this->store['bazaar_license_crm'] = json_encode(
			array(
				'key'       => 'XXXX-YYYY',
				'validated' => true,
				'expires'   => null,
			)
		);

		$license = new WareLicense();
		$this->assertTrue(
			$license->is_licensed(
				array(
					'slug'    => 'crm',
					'license' => array( 'type' => 'key' ),
				)
			)
		);
	}

	public function test_paid_ware_with_unvalidated_key_is_not_licensed(): void {
		$this->store['bazaar_license_crm'] = json_encode(
			array(
				'key'       => 'XXXX-YYYY',
				'validated' => false,
				'expires'   => null,
			)
		);

		$license = new WareLicense();
		$this->assertFalse(
			$license->is_licensed(
				array(
					'slug'    => 'crm',
					'license' => array( 'type' => 'key' ),
				)
			)
		);
	}

	public function test_paid_ware_with_expired_license_is_not_licensed(): void {
		$this->store['bazaar_license_crm'] = json_encode(
			array(
				'key'       => 'XXXX-YYYY',
				'validated' => true,
				'expires'   => '2020-01-01', // already past
			)
		);

		$license = new WareLicense();
		$this->assertFalse(
			$license->is_licensed(
				array(
					'slug'    => 'crm',
					'license' => array( 'type' => 'key' ),
				)
			)
		);
	}

	public function test_paid_ware_with_future_expiry_is_licensed(): void {
		$this->store['bazaar_license_crm'] = json_encode(
			array(
				'key'       => 'XXXX-YYYY',
				'validated' => true,
				'expires'   => '2099-01-01',
			)
		);

		$license = new WareLicense();
		$this->assertTrue(
			$license->is_licensed(
				array(
					'slug'    => 'crm',
					'license' => array( 'type' => 'key' ),
				)
			)
		);
	}

	// ─── set / get_key / delete ──────────────────────────────────────────────

	public function test_set_stores_key_as_unvalidated(): void {
		$license = new WareLicense();
		$license->set( 'crm', 'ABCD-1234' );

		$raw = $this->store['bazaar_license_crm'] ?? null;
		$this->assertNotNull( $raw );
		$data = json_decode( (string) $raw, true );
		$this->assertSame( 'ABCD-1234', $data['key'] );
		$this->assertFalse( $data['validated'] );
		$this->assertNull( $data['expires'] );
	}

	public function test_get_key_returns_stored_key(): void {
		$this->store['bazaar_license_crm'] = json_encode(
			array(
				'key'       => 'STORED-KEY',
				'validated' => true,
				'expires'   => null,
			)
		);

		$license = new WareLicense();
		$this->assertSame( 'STORED-KEY', $license->get_key( 'crm' ) );
	}

	public function test_get_key_returns_empty_string_when_none(): void {
		$license = new WareLicense();
		$this->assertSame( '', $license->get_key( 'crm' ) );
	}

	public function test_delete_removes_license_option(): void {
		$this->store['bazaar_license_crm'] = json_encode( array( 'key' => 'K' ) );

		$license = new WareLicense();
		$license->delete( 'crm' );

		$this->assertArrayNotHasKey( 'bazaar_license_crm', $this->store );
	}

	// ─── validate ───────────────────────────────────────────────────────────

	public function test_validate_accepts_key_when_no_validation_url(): void {
		Functions\when( 'esc_url_raw' )->justReturn( '' );
		Functions\when( 'home_url' )->justReturn( 'http://example.com' );

		$license = new WareLicense();
		$result  = $license->validate( 'crm', 'MY-KEY', array( 'url' => '' ) );

		$this->assertTrue( $result );
		// Key should now be marked as validated.
		$this->assertTrue(
			$license->is_licensed(
				array(
					'slug'    => 'crm',
					'license' => array( 'type' => 'key' ),
				)
			)
		);
	}

	public function test_validate_grants_offline_grace_for_previously_validated_key(): void {
		$this->store['bazaar_license_crm'] = json_encode(
			array(
				'key'       => 'GOOD-KEY',
				'validated' => true,
				'expires'   => null,
			)
		);

		Functions\when( 'esc_url_raw' )->justReturn( 'https://vendor.example.com/license' );
		Functions\when( 'wp_json_encode' )->alias( 'json_encode' );
		Functions\when( 'home_url' )->justReturn( 'http://example.com' );

		$wp_error = new \WP_Error( 'http_request_failed', 'cURL error' );
		Functions\when( 'wp_remote_post' )->justReturn( $wp_error );
		Functions\when( 'is_wp_error' )->alias( fn( $v ) => $v instanceof \WP_Error );

		$license = new WareLicense();
		$result  = $license->validate( 'crm', 'GOOD-KEY', array( 'url' => 'https://vendor.example.com/license' ) );

		$this->assertTrue( $result );
	}

	public function test_validate_returns_wp_error_on_failed_request_without_stored_key(): void {
		// No existing validated data in store.
		Functions\when( 'esc_url_raw' )->justReturn( 'https://vendor.example.com/license' );
		Functions\when( 'wp_json_encode' )->alias( 'json_encode' );
		Functions\when( 'home_url' )->justReturn( 'http://example.com' );

		$wp_error = new \WP_Error( 'http_request_failed', 'cURL error' );
		Functions\when( 'wp_remote_post' )->justReturn( $wp_error );
		Functions\when( 'is_wp_error' )->alias( fn( $v ) => $v instanceof \WP_Error );

		$license = new WareLicense();
		$result  = $license->validate( 'crm', 'BAD-KEY', array( 'url' => 'https://vendor.example.com/license' ) );

		$this->assertInstanceOf( \WP_Error::class, $result );
	}

	public function test_validate_marks_key_as_validated_on_success(): void {
		Functions\when( 'esc_url_raw' )->justReturn( 'https://vendor.example.com/license' );
		Functions\when( 'wp_json_encode' )->alias( 'json_encode' );
		Functions\when( 'home_url' )->justReturn( 'http://example.com' );

		$fake_response = array(
			'response' => array( 'code' => 200 ),
			'body'     => json_encode(
				array(
					'valid'   => true,
					'expires' => null,
				)
			),
		);
		Functions\when( 'wp_remote_post' )->justReturn( $fake_response );
		Functions\when( 'is_wp_error' )->justReturn( false );
		Functions\when( 'wp_remote_retrieve_response_code' )->justReturn( 200 );
		Functions\when( 'wp_remote_retrieve_body' )->justReturn(
			json_encode(
				array(
					'valid'   => true,
					'expires' => null,
				)
			)
		);

		$license = new WareLicense();
		$result  = $license->validate( 'crm', 'GOOD-KEY', array( 'url' => 'https://vendor.example.com/license' ) );

		$this->assertTrue( $result );
	}
}
