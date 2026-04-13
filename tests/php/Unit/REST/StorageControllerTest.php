<?php

declare( strict_types=1 );

namespace Bazaar\Tests\Unit\REST;

use Bazaar\REST\StorageController;
use Bazaar\WareRegistry;
use Brain\Monkey\Functions;
use Bazaar\Tests\WareTestCase;
use WP_REST_Request;
use WP_REST_Response;
use WP_Error;

/**
 * Unit tests for StorageController REST handlers.
 *
 * Tests call handler methods directly — no HTTP layer involved.
 * Uses a real WareRegistry backed by an in-memory option store and
 * per-test overrides for usermeta to simulate all error branches.
 */
final class StorageControllerTest extends WareTestCase {

	/** @var array<string, mixed> In-memory option store. */
	private array $store = array();

	/** @var array<int, array<string, string>> In-memory usermeta rows. */
	private array $usermeta = array();

	protected function setUp(): void {
		parent::setUp();
		$this->store    = array( 'bazaar_index' => '{}' );
		$this->usermeta = array();
		$this->stub_wp_functions();
	}

	// ─── Helpers ─────────────────────────────────────────────────────────────

	private function stub_wp_functions(): void {
		$store    = &$this->store;
		$usermeta = &$this->usermeta;

		Functions\when( '__' )->returnArg();
		Functions\when( 'sprintf' )->alias( 'sprintf' );
		Functions\when( 'absint' )->alias( 'intval' );
		Functions\when( 'wp_json_encode' )->alias( 'json_encode' );
		Functions\when( 'gmdate' )->alias( 'gmdate' );
		Functions\when( 'register_rest_route' )->justReturn( true );

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

		Functions\when( 'get_current_user_id' )->justReturn( 1 );

		Functions\when( 'get_user_meta' )->alias(
			function ( int $uid, string $key, bool $single = false ) use ( &$usermeta ): mixed {
				foreach ( $usermeta as $row ) {
					if ( $row['key'] === $key ) {
						return $row['value'];
					}
				}
				return '';
			}
		);

		Functions\when( 'update_user_meta' )->alias(
			function ( int $uid, string $key, mixed $value ) use ( &$usermeta ): bool {
				foreach ( $usermeta as &$row ) {
					if ( $row['key'] === $key ) {
						$row['value'] = (string) $value;
						return true;
					}
				}
				unset( $row );
				$usermeta[] = array( 'key' => $key, 'value' => (string) $value );
				return true;
			}
		);

		Functions\when( 'delete_user_meta' )->alias(
			function ( int $uid, string $key ) use ( &$usermeta ): bool {
				foreach ( $usermeta as $i => $row ) {
					if ( $row['key'] === $key ) {
						array_splice( $usermeta, $i, 1 );
						return true;
					}
				}
				return false;
			}
		);

		// Stub global $wpdb with an object that simulates prefix_meta_keys queries.
		global $wpdb;
		$wpdb_mock         = new class( $usermeta ) {
			/** @var string */
			public string $usermeta = 'wp_usermeta';
			/** @var array<int, array<string, string>> */
			private array $usermeta_data;

			/** @param array<int, array<string, string>> $data */
			public function __construct( array &$data ) {
				$this->usermeta_data = &$data;
			}

			/** @param string $string */
			public function esc_like( string $string ): string { return $string; }

			/**
			 * @param string $query Description.
			 * @param mixed  ...$args Description.
			 * @return string
			 */
			public function prepare( string $query, mixed ...$args ): string { return $query; }

			/**
			 * @param string $query Description.
			 * @return string[]
			 */
			public function get_col( string $query ): array {
				return array_column( $this->usermeta_data, 'key' );
			}
		};
		$wpdb = $wpdb_mock;
	}

	/** Seed a ware into the in-memory registry. */
	private function seed_ware( string $slug ): void {
		$ware = array(
			'slug'        => $slug,
			'name'        => ucfirst( $slug ),
			'version'     => '1.0.0',
			'enabled'     => true,
			'icon'        => '',
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

		$index                                 = json_decode( (string) ( $this->store['bazaar_index'] ?? '{}' ), true ) ?? array();
		$index[ $slug ]                        = array(
			'slug'        => $slug,
			'name'        => ucfirst( $slug ),
			'enabled'     => true,
			'version'     => '1.0.0',
			'icon'        => '',
			'entry'       => 'index.html',
			'menu_title'  => ucfirst( $slug ),
			'capability'  => 'manage_options',
			'group'       => null,
			'dev_url'     => null,
			'permissions' => array(),
		);
		$this->store['bazaar_index']           = (string) json_encode( $index );
		$this->store[ 'bazaar_ware_' . $slug ] = (string) json_encode( $ware );
	}

	private function make_request( array $params ): WP_REST_Request {
		$req = new WP_REST_Request();
		foreach ( $params as $k => $v ) {
			$req->set_param( $k, $v );
		}
		return $req;
	}

	private function make_controller(): StorageController {
		return new StorageController( new WareRegistry() );
	}

	// ─── Happy path ──────────────────────────────────────────────────────────

	public function test_set_and_get_value_round_trip(): void {
		$this->seed_ware( 'board' );
		$ctrl = $this->make_controller();

		$set_req = $this->make_request( array( 'slug' => 'board', 'key' => 'state', 'value' => array( 'cols' => 3 ) ) );
		$set_res = $ctrl->set_value( $set_req );
		$this->assertInstanceOf( WP_REST_Response::class, $set_res );
		$this->assertSame( 200, $set_res->get_status() );

		$get_req = $this->make_request( array( 'slug' => 'board', 'key' => 'state' ) );
		$get_res = $ctrl->get_value( $get_req );
		$this->assertInstanceOf( WP_REST_Response::class, $get_res );
		$data = $get_res->get_data();
		$this->assertSame( array( 'cols' => 3 ), $data['value'] );
	}

	public function test_delete_value_removes_key(): void {
		$this->seed_ware( 'board' );
		$meta_key           = 'bazaar_store_board_state';
		$this->usermeta[]   = array( 'key' => $meta_key, 'value' => '"saved"' );
		$ctrl               = $this->make_controller();
		$req                = $this->make_request( array( 'slug' => 'board', 'key' => 'state' ) );
		$res                = $ctrl->delete_value( $req );

		$this->assertInstanceOf( WP_REST_Response::class, $res );
		$this->assertTrue( $res->get_data()['deleted'] );
		$found = false;
		foreach ( $this->usermeta as $row ) {
			if ( $row['key'] === $meta_key ) {
				$found = true;
			}
		}
		$this->assertFalse( $found );
	}

	// ─── not_found ───────────────────────────────────────────────────────────

	public function test_get_value_returns_not_found_for_unknown_ware(): void {
		$ctrl = $this->make_controller();
		$req  = $this->make_request( array( 'slug' => 'ghost', 'key' => 'x' ) );
		$res  = $ctrl->get_value( $req );

		$this->assertInstanceOf( WP_Error::class, $res );
		$this->assertSame( 'not_found', $res->get_error_code() );
	}

	public function test_set_value_returns_not_found_for_unknown_ware(): void {
		$ctrl = $this->make_controller();
		$req  = $this->make_request( array( 'slug' => 'ghost', 'key' => 'x', 'value' => 1 ) );
		$res  = $ctrl->set_value( $req );

		$this->assertInstanceOf( WP_Error::class, $res );
		$this->assertSame( 'not_found', $res->get_error_code() );
	}

	// ─── decode_error ────────────────────────────────────────────────────────

	public function test_get_value_returns_decode_error_for_corrupt_stored_json(): void {
		$this->seed_ware( 'board' );
		// Store deliberately broken JSON in usermeta.
		$this->usermeta[] = array( 'key' => 'bazaar_store_board_corrupt', 'value' => '{not valid json' );

		$ctrl = $this->make_controller();
		$req  = $this->make_request( array( 'slug' => 'board', 'key' => 'corrupt' ) );
		$res  = $ctrl->get_value( $req );

		$this->assertInstanceOf( WP_Error::class, $res );
		$this->assertSame( 'decode_error', $res->get_error_code() );
	}

	// ─── encode_error ────────────────────────────────────────────────────────

	public function test_set_value_returns_encode_error_when_value_cannot_be_encoded(): void {
		$this->seed_ware( 'board' );
		// Override wp_json_encode to fail.
		Functions\when( 'wp_json_encode' )->justReturn( false );

		$ctrl = $this->make_controller();
		$req  = $this->make_request( array( 'slug' => 'board', 'key' => 'x', 'value' => "\xB1\x31" ) );
		$res  = $ctrl->set_value( $req );

		$this->assertInstanceOf( WP_Error::class, $res );
		$this->assertSame( 'encode_error', $res->get_error_code() );
	}

	// ─── too_large ───────────────────────────────────────────────────────────

	public function test_set_value_returns_too_large_when_encoded_value_exceeds_limit(): void {
		$this->seed_ware( 'board' );
		// 2 MB of 'a' characters encoded will exceed the 1 MB limit.
		$big_value = str_repeat( 'a', 2 * 1024 * 1024 );

		// Let wp_json_encode succeed (returns a quoted string, same length + 2).
		Functions\when( 'wp_json_encode' )->alias( 'json_encode' );

		$ctrl = $this->make_controller();
		$req  = $this->make_request( array( 'slug' => 'board', 'key' => 'big', 'value' => $big_value ) );
		$res  = $ctrl->set_value( $req );

		$this->assertInstanceOf( WP_Error::class, $res );
		$this->assertSame( 'too_large', $res->get_error_code() );
	}

	// ─── write_error ─────────────────────────────────────────────────────────

	public function test_set_value_returns_write_error_when_update_user_meta_fails(): void {
		$this->seed_ware( 'board' );
		// Override update_user_meta to return false (DB failure).
		Functions\when( 'update_user_meta' )->justReturn( false );

		$ctrl = $this->make_controller();
		$req  = $this->make_request( array( 'slug' => 'board', 'key' => 'state', 'value' => array( 'x' => 1 ) ) );
		$res  = $ctrl->set_value( $req );

		$this->assertInstanceOf( WP_Error::class, $res );
		$this->assertSame( 'write_error', $res->get_error_code() );
	}

	// ─── storage_full ────────────────────────────────────────────────────────

	public function test_set_value_returns_storage_full_when_key_limit_reached(): void {
		$this->seed_ware( 'board' );

		// Pre-populate usermeta with 256 keys to saturate the limit.
		// The brand-new key must NOT already exist in usermeta so the guard triggers.
		for ( $i = 0; $i < 256; $i++ ) {
			$this->usermeta[] = array( 'key' => "bazaar_store_board_key$i", 'value' => '"x"' );
		}

		$ctrl = $this->make_controller();
		$req  = $this->make_request( array( 'slug' => 'board', 'key' => 'brand-new-key', 'value' => 1 ) );
		$res  = $ctrl->set_value( $req );

		$this->assertInstanceOf( WP_Error::class, $res );
		$this->assertSame( 'storage_full', $res->get_error_code() );
	}

	// ─── update_user_meta false-on-no-change = success ───────────────────────

	/**
	 * WordPress's update_user_meta() returns false both on genuine DB failure AND
	 * when the stored value is identical to what is being saved.  set_value must
	 * treat the latter case as success (200), not as a write_error (500).
	 */
	public function test_set_value_succeeds_when_update_user_meta_returns_false_but_value_unchanged(): void {
		$this->seed_ware( 'board' );

		$key      = 'state';
		$value    = array( 'cols' => 3 );
		$encoded  = (string) json_encode( $value );
		$meta_key = 'bazaar_store_board_state';

		// Pre-populate usermeta with the same encoded value.
		$this->usermeta[] = array( 'key' => $meta_key, 'value' => $encoded );

		// Override update_user_meta to always return false (simulates "no change").
		Functions\when( 'update_user_meta' )->justReturn( false );

		// get_user_meta must return the already-stored value (so the guard passes).
		$usermeta = &$this->usermeta;
		Functions\when( 'get_user_meta' )->alias(
			function ( int $uid, string $key_arg, bool $single = false ) use ( &$usermeta, $meta_key, $encoded ): mixed {
				if ( $key_arg === $meta_key ) {
					return $encoded;
				}
				foreach ( $usermeta as $row ) {
					if ( $row['key'] === $key_arg ) {
						return $row['value'];
					}
				}
				return '';
			}
		);

		$ctrl = $this->make_controller();
		$req  = $this->make_request( array( 'slug' => 'board', 'key' => $key, 'value' => $value ) );
		$res  = $ctrl->set_value( $req );

		$this->assertInstanceOf( WP_REST_Response::class, $res );
		$this->assertSame(
			200,
			$res->get_status(),
			'set_value must return 200 when update_user_meta returns false due to unchanged value.'
		);
	}

	// ─── absent key returns null, not 404 ────────────────────────────────────

	public function test_get_value_returns_null_for_absent_key(): void {
		$this->seed_ware( 'board' );
		$ctrl = $this->make_controller();
		$req  = $this->make_request( array( 'slug' => 'board', 'key' => 'absent' ) );
		$res  = $ctrl->get_value( $req );

		$this->assertInstanceOf( WP_REST_Response::class, $res );
		$this->assertSame( 200, $res->get_status() );
		$this->assertNull( $res->get_data()['value'] );
	}
}
