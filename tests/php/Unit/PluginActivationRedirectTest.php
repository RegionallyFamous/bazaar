<?php

declare( strict_types=1 );

namespace Bazaar\Tests\Unit;

use Bazaar\Plugin;
use Brain\Monkey\Functions;
use Bazaar\Tests\WareTestCase;

/**
 * Unit tests for Plugin::maybe_redirect_after_activation().
 *
 * Exercises every early-exit guard so we know:
 *   1. Nothing happens when the transient is absent.
 *   2. Nothing happens during a network-admin bulk activation.
 *   3. A redirect fires (and the transient is consumed) on a normal activation.
 *
 * The third case calls PHP's exit(), which terminates the process. To handle
 * this safely we override wp_safe_redirect() to throw a known exception
 * immediately before exit() would be reached.
 */
final class PluginActivationRedirectTest extends WareTestCase {

	/**
	 * Signals that a redirect was triggered instead of a silent return.
	 * Must NOT extend \Exception so it can be distinguished from unexpected errors.
	 */
	// @phpstan-ignore-next-line
	private static string $redirectedUrl = '';

	protected function setUp(): void {
		parent::setUp();
		self::$redirectedUrl = '';
		Functions\when( 'delete_transient' )->justReturn( true );
		Functions\when( 'is_network_admin' )->justReturn( false );
		Functions\when( 'admin_url' )->alias(
			fn( $path ) => 'https://example.com/wp-admin/' . ltrim( (string) $path, '/' )
		);
		// Capture the redirect URL so we can assert on it, then throw to stop
		// execution before exit() is reached in the caller.
		Functions\when( 'wp_safe_redirect' )->alias(
			function ( string $url ) {
				self::$redirectedUrl = $url;
				throw new \RuntimeException( 'redirect:' . $url );
			}
		);
	}

	public function test_does_nothing_when_transient_absent(): void {
		Functions\when( 'get_transient' )->justReturn( false );

		// Should return normally without throwing.
		Plugin::maybe_redirect_after_activation();

		$this->assertSame( '', self::$redirectedUrl );
	}

	public function test_does_nothing_on_network_admin_activation(): void {
		Functions\when( 'get_transient' )->justReturn( true );
		Functions\when( 'is_network_admin' )->justReturn( true );

		// The transient is consumed (deleted) but no redirect fires.
		Plugin::maybe_redirect_after_activation();

		$this->assertSame( '', self::$redirectedUrl );
	}

	public function test_does_nothing_on_bulk_activate_multi(): void {
		Functions\when( 'get_transient' )->justReturn( true );
		$_GET['activate-multi'] = '1';

		Plugin::maybe_redirect_after_activation();

		unset( $_GET['activate-multi'] );
		$this->assertSame( '', self::$redirectedUrl );
	}

	public function test_redirects_to_bazaar_page_on_normal_activation(): void {
		Functions\when( 'get_transient' )->justReturn( true );

		try {
			Plugin::maybe_redirect_after_activation();
			// Reaching here means wp_safe_redirect was never called, which is wrong.
			$this->fail( 'Expected a redirect to fire.' );
		} catch ( \RuntimeException $e ) {
			$this->assertStringContainsString( 'page=bazaar', $e->getMessage() );
		}
	}
}
