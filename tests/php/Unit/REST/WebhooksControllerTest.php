<?php
/**
 * Unit tests for REST\WebhooksController.
 *
 * @package Bazaar\Tests\Unit\REST
 */

declare( strict_types=1 );

namespace Bazaar\Tests\Unit\REST;

use Bazaar\REST\WebhooksController;
use Brain\Monkey\Functions;
use Bazaar\Tests\WareTestCase;
use WP_REST_Request;
use WP_REST_Response;
use WP_Error;

/**
 * Tests for WebhooksController REST handlers.
 *
 * Tests call handler methods directly — no HTTP layer.
 */
final class WebhooksControllerTest extends WareTestCase {

	/** @var array<string, mixed> In-memory option store. */
	private array $store = array();

	protected function setUp(): void {
		parent::setUp();
		$this->store = array();
		$this->stub_wp_functions();
	}

	private function stub_wp_functions(): void {
		$store = &$this->store;

		Functions\when( '__' )->returnArg();
		Functions\when( 'esc_url_raw' )->returnArg();
		Functions\when( 'register_rest_route' )->justReturn( true );
		Functions\when( 'current_user_can' )->justReturn( true );
		Functions\when( 'is_user_logged_in' )->justReturn( true );
		Functions\when( 'wp_json_encode' )->alias( 'json_encode' );
		Functions\when( 'wp_generate_uuid4' )->justReturn( '00000000-0000-0000-0000-000000000001' );
		Functions\when( 'wp_generate_password' )->justReturn( str_repeat( 'x', 40 ) );
		// wp_parse_url is stubbed in the bootstrap as a real function — no Brain Monkey override needed.

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

	private function make_controller(): WebhooksController {
		return new WebhooksController();
	}

	private function make_request( array $params ): WP_REST_Request {
		$req = new WP_REST_Request();
		foreach ( $params as $k => $v ) {
			$req->set_param( $k, $v );
		}
		return $req;
	}

	// ─── list_webhooks — corrupt stored JSON returns WP_Error ────────────────

	/**
	 * When the stored bazaar_webhooks option contains invalid JSON, list_webhooks
	 * must return a WP_Error (not silently return an empty array as before the fix).
	 */
	public function test_list_webhooks_returns_error_when_option_json_is_corrupt(): void {
		$this->store['bazaar_webhooks'] = '{invalid';

		$ctrl = $this->make_controller();
		$req  = $this->make_request( array( 'slug' => 'flow' ) );
		$res  = $ctrl->list_webhooks( $req );

		$this->assertInstanceOf( WP_Error::class, $res );
		$this->assertSame( 'decode_error', $res->get_error_code() );
	}

	// ─── list_webhooks — happy path ───────────────────────────────────────────

	public function test_list_webhooks_returns_hooks_for_slug(): void {
		$this->store['bazaar_webhooks'] = (string) json_encode(
			array(
				array( 'id' => 'aaa', 'slug' => 'flow', 'event' => 'flow:task-added', 'url' => 'https://example.com/hook', 'secret' => 'shh' ),
				array( 'id' => 'bbb', 'slug' => 'board', 'event' => 'board:moved', 'url' => 'https://other.com/hook', 'secret' => 'shh' ),
			)
		);

		$ctrl = $this->make_controller();
		$req  = $this->make_request( array( 'slug' => 'flow' ) );
		$res  = $ctrl->list_webhooks( $req );

		$this->assertInstanceOf( WP_REST_Response::class, $res );
		$this->assertSame( 200, $res->get_status() );
		$data = $res->get_data();
		$this->assertCount( 1, $data );
		$this->assertSame( 'flow', $data[0]['slug'] );
		// Secret must never be returned.
		$this->assertArrayNotHasKey( 'secret', $data[0] );
	}

	public function test_list_webhooks_returns_empty_array_when_none_registered(): void {
		$ctrl = $this->make_controller();
		$req  = $this->make_request( array( 'slug' => 'flow' ) );
		$res  = $ctrl->list_webhooks( $req );

		$this->assertInstanceOf( WP_REST_Response::class, $res );
		$this->assertSame( array(), $res->get_data() );
	}

	// ─── create_webhook — happy path ─────────────────────────────────────────

	public function test_create_webhook_stores_new_entry(): void {
		$ctrl = $this->make_controller();
		$req  = $this->make_request(
			array(
				'slug'  => 'flow',
				'event' => 'flow:task-added',
				'url'   => 'https://receiver.example.com/hook',
			)
		);
		$res = $ctrl->create_webhook( $req );

		$this->assertInstanceOf( WP_REST_Response::class, $res );
		$this->assertSame( 201, $res->get_status() );

		// Verify it was stored.
		$stored = json_decode( (string) ( $this->store['bazaar_webhooks'] ?? '[]' ), true );
		$this->assertCount( 1, $stored );
		$this->assertSame( 'flow', $stored[0]['slug'] );
		$this->assertSame( 'flow:task-added', $stored[0]['event'] );
	}

	public function test_create_webhook_rejects_bad_url_scheme(): void {
		$ctrl = $this->make_controller();
		$req  = $this->make_request(
			array(
				'slug'  => 'flow',
				'event' => 'flow:task-added',
				'url'   => 'ftp://not-allowed.example.com',
			)
		);
		$res = $ctrl->create_webhook( $req );

		$this->assertInstanceOf( WP_Error::class, $res );
		$this->assertSame( 'bad_url', $res->get_error_code() );
	}

	public function test_create_webhook_rejects_secret_shorter_than_32_chars(): void {
		$ctrl = $this->make_controller();
		$req  = $this->make_request(
			array(
				'slug'   => 'flow',
				'event'  => 'flow:task-added',
				'url'    => 'https://example.com/hook',
				'secret' => 'short',
			)
		);
		$res = $ctrl->create_webhook( $req );

		$this->assertInstanceOf( WP_Error::class, $res );
		$this->assertSame( 'secret_too_short', $res->get_error_code() );
	}

	// ─── delete_webhook — happy path ─────────────────────────────────────────

	public function test_delete_webhook_removes_matching_entry(): void {
		$hook_id = '00000000-0000-0000-0000-000000000001';

		$this->store['bazaar_webhooks'] = (string) json_encode(
			array(
				array( 'id' => $hook_id, 'slug' => 'flow', 'event' => 'flow:task-added', 'url' => 'https://example.com/hook' ),
			)
		);

		$ctrl = $this->make_controller();
		$req  = $this->make_request( array( 'slug' => 'flow', 'id' => $hook_id ) );
		$res  = $ctrl->delete_webhook( $req );

		$this->assertInstanceOf( WP_REST_Response::class, $res );
		$this->assertTrue( $res->get_data()['deleted'] );

		$stored = json_decode( (string) ( $this->store['bazaar_webhooks'] ?? '[]' ), true );
		$this->assertCount( 0, $stored, 'Hook must be removed from storage.' );
	}

	public function test_delete_webhook_returns_not_found_for_unknown_id(): void {
		$this->store['bazaar_webhooks'] = (string) json_encode( array() );

		$ctrl = $this->make_controller();
		$req  = $this->make_request( array( 'slug' => 'flow', 'id' => 'does-not-exist' ) );
		$res  = $ctrl->delete_webhook( $req );

		$this->assertInstanceOf( WP_Error::class, $res );
		$this->assertSame( 'not_found', $res->get_error_code() );
	}
}
