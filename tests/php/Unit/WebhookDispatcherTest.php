<?php

declare( strict_types=1 );

namespace Bazaar\Tests\Unit;

use Bazaar\WebhookDispatcher;
use Brain\Monkey\Functions;
use Bazaar\Tests\WareTestCase;

/**
 * Unit tests for WebhookDispatcher.
 */
final class WebhookDispatcherTest extends WareTestCase {

	protected function setUp(): void {
		parent::setUp();
		Functions\when( 'wp_json_encode' )->alias( 'json_encode' );
		Functions\when( 'wp_generate_uuid4' )->justReturn( '00000000-0000-0000-0000-000000000001' );
	}

	// ─── Helpers ─────────────────────────────────────────────────────────────

	/**
	 * Build a webhooks option payload and stub get_option to return it.
	 *
	 * @param array<int, array<string, mixed>> $hooks
	 */
	private function stub_webhooks( array $hooks ): void {
		Functions\when( 'get_option' )->justReturn( (string) json_encode( $hooks ) );
	}

	// ─── dispatch() — no matching hooks ──────────────────────────────────────

	public function test_dispatch_skips_when_no_hooks_registered(): void {
		$this->stub_webhooks( array() );
		$posted = false;
		Functions\when( 'wp_remote_post' )->alias( static function () use ( &$posted ): array {
			$posted = true;
			return array();
		} );

		WebhookDispatcher::dispatch( 'flow:task-added', array( 'text' => 'Buy milk' ), 'flow' );

		$this->assertFalse( $posted, 'No HTTP request should be made when the hooks list is empty.' );
	}

	public function test_dispatch_skips_when_no_hook_matches_event(): void {
		$this->stub_webhooks(
			array(
				array( 'slug' => 'flow', 'event' => 'flow:task-done', 'url' => 'https://example.com/hook' ),
			)
		);
		$posted = false;
		Functions\when( 'wp_remote_post' )->alias( static function () use ( &$posted ): array {
			$posted = true;
			return array();
		} );

		// Dispatch a *different* event — should not fire.
		WebhookDispatcher::dispatch( 'flow:task-added', array(), 'flow' );

		$this->assertFalse( $posted );
	}

	public function test_dispatch_skips_hook_with_invalid_url(): void {
		$this->stub_webhooks(
			array(
				array( 'slug' => 'flow', 'event' => 'flow:task-added', 'url' => 'not-a-url' ),
			)
		);
		$posted = false;
		Functions\when( 'wp_remote_post' )->alias( static function () use ( &$posted ): array {
			$posted = true;
			return array();
		} );

		WebhookDispatcher::dispatch( 'flow:task-added', array(), 'flow' );

		$this->assertFalse( $posted, 'Hook with invalid URL must be silently skipped.' );
	}

	// ─── dispatch() — matching hooks ─────────────────────────────────────────

	public function test_dispatch_fires_remote_post_for_matching_hook(): void {
		$this->stub_webhooks(
			array(
				array( 'slug' => 'flow', 'event' => 'flow:task-added', 'url' => 'https://example.com/hook' ),
			)
		);

		$captured_url  = null;
		$captured_args = null;
		Functions\when( 'wp_remote_post' )->alias(
			static function ( string $url, array $args ) use ( &$captured_url, &$captured_args ): array {
				$captured_url  = $url;
				$captured_args = $args;
				return array();
			}
		);

		WebhookDispatcher::dispatch( 'flow:task-added', array( 'text' => 'Buy milk' ), 'flow' );

		$this->assertSame( 'https://example.com/hook', $captured_url );
		$this->assertSame( 'application/json', $captured_args['headers']['Content-Type'] );
		$this->assertSame( 'flow:task-added', $captured_args['headers']['X-Bazaar-Event'] );
		$this->assertArrayNotHasKey( 'X-Bazaar-Signature-256', $captured_args['headers'] );
	}

	public function test_dispatch_adds_hmac_signature_when_secret_set(): void {
		$secret = 'super-secret';
		$this->stub_webhooks(
			array(
				array( 'slug' => 'flow', 'event' => 'flow:task-added', 'url' => 'https://example.com/hook', 'secret' => $secret ),
			)
		);

		$captured_args = null;
		Functions\when( 'wp_remote_post' )->alias(
			static function ( string $url, array $args ) use ( &$captured_args ): array {
				$captured_args = $args;
				return array();
			}
		);

		WebhookDispatcher::dispatch( 'flow:task-added', array( 'text' => 'Buy milk' ), 'flow' );

		$this->assertNotNull( $captured_args );
		$this->assertArrayHasKey( 'X-Bazaar-Signature-256', $captured_args['headers'] );
		$sig = $captured_args['headers']['X-Bazaar-Signature-256'];
		// The header must start with 'sha256=' followed by a hex digest.
		$this->assertStringStartsWith( 'sha256=', $sig );
		// Verify the HMAC is correct.
		$body     = $captured_args['body'];
		$expected = 'sha256=' . hash_hmac( 'sha256', $body, $secret );
		$this->assertSame( $expected, $sig );
	}

	public function test_dispatch_sends_correct_json_payload_shape(): void {
		$this->stub_webhooks(
			array(
				array( 'slug' => 'board', 'event' => 'board:card-moved', 'url' => 'https://hooks.example.com/' ),
			)
		);

		$captured_body = null;
		Functions\when( 'wp_remote_post' )->alias(
			static function ( string $url, array $args ) use ( &$captured_body ): array {
				$captured_body = json_decode( $args['body'], true );
				return array();
			}
		);

		WebhookDispatcher::dispatch( 'board:card-moved', array( 'card' => 'abc' ), 'board' );

		$this->assertIsArray( $captured_body );
		$this->assertSame( 'board:card-moved', $captured_body['event'] );
		$this->assertSame( array( 'card' => 'abc' ), $captured_body['data'] );
		$this->assertSame( 'board', $captured_body['ware'] );
		$this->assertArrayHasKey( 'timestamp', $captured_body );
	}

	// ─── payload encode failure ───────────────────────────────────────────────

	/**
	 * When wp_json_encode returns false (unencodeable payload), dispatch must
	 * silently skip all hooks — even matching ones — without firing any HTTP requests.
	 */
	public function test_dispatch_skips_when_payload_cannot_be_encoded(): void {
		$this->stub_webhooks(
			array(
				array( 'slug' => 'flow', 'event' => 'flow:task-added', 'url' => 'https://example.com/hook' ),
			)
		);

		// Force encode failure.
		Functions\when( 'wp_json_encode' )->justReturn( false );

		$posted = false;
		Functions\when( 'wp_remote_post' )->alias( static function () use ( &$posted ): array {
			$posted = true;
			return array();
		} );

		WebhookDispatcher::dispatch( 'flow:task-added', array( 'text' => 'Buy milk' ), 'flow' );

		$this->assertFalse( $posted, 'No HTTP request must be made when the payload cannot be encoded.' );
	}

	// ─── load_all() — malformed option ───────────────────────────────────────

	public function test_dispatch_handles_malformed_webhooks_option_gracefully(): void {
		Functions\when( 'get_option' )->justReturn( '{invalid json' );
		$posted = false;
		Functions\when( 'wp_remote_post' )->alias( static function () use ( &$posted ): array {
			$posted = true;
			return array();
		} );

		// Should not throw, should not fire any requests.
		WebhookDispatcher::dispatch( 'flow:task-added', array(), 'flow' );

		$this->assertFalse( $posted );
	}
}
