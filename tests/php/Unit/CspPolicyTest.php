<?php

declare( strict_types=1 );

namespace Bazaar\Tests\Unit;

use Bazaar\CspPolicy;
use Brain\Monkey;
use Brain\Monkey\Functions;
use PHPUnit\Framework\TestCase;

/**
 * Unit tests for CspPolicy.
 */
final class CspPolicyTest extends TestCase {

	protected function setUp(): void {
		parent::setUp();
		Monkey\setUp();
	}

	protected function tearDown(): void {
		Monkey\tearDown();
		parent::tearDown();
	}

	// ─── compile ────────────────────────────────────────────────────────────

	public function test_compile_produces_semicolon_separated_string(): void {
		$result = CspPolicy::compile(
			array(
				'default-src'     => "'self'",
				'script-src'      => "'self' 'unsafe-inline'",
				'frame-ancestors' => "'self'",
			)
		);

		$this->assertStringContainsString( "default-src 'self'", $result );
		$this->assertStringContainsString( "script-src 'self' 'unsafe-inline'", $result );
		$this->assertStringContainsString( "frame-ancestors 'self'", $result );

		$parts = explode( '; ', $result );
		$this->assertCount( 3, $parts );
	}

	public function test_compile_returns_empty_string_for_empty_directives(): void {
		$this->assertSame( '', CspPolicy::compile( array() ) );
	}

	public function test_compile_trims_directive_whitespace(): void {
		$result = CspPolicy::compile( array( 'script-src' => "  'self'  " ) );
		$this->assertSame( "script-src 'self'", $result );
	}

	// ─── load ────────────────────────────────────────────────────────────────

	public function test_load_returns_baseline_when_no_option_stored(): void {
		Functions\when( 'get_option' )->justReturn( '' );

		$directives = CspPolicy::load( 'my-ware' );

		$this->assertSame( CspPolicy::BASELINE, $directives );
	}

	public function test_load_merges_stored_directives_over_baseline(): void {
		$stored = json_encode( array( 'connect-src' => "'self' https://api.example.com" ) );
		Functions\when( 'get_option' )->justReturn( $stored );

		$directives = CspPolicy::load( 'my-ware' );

		// Stored value overrides baseline.
		$this->assertSame( "'self' https://api.example.com", $directives['connect-src'] );
		// Baseline keys still present.
		$this->assertArrayHasKey( 'default-src', $directives );
	}

	public function test_load_falls_back_to_baseline_on_invalid_json(): void {
		Functions\when( 'get_option' )->justReturn( '{not-json' );

		$directives = CspPolicy::load( 'my-ware' );

		$this->assertSame( CspPolicy::BASELINE, $directives );
	}

	public function test_load_enforces_required_directives(): void {
		// Stored config tries to override frame-ancestors.
		$stored = json_encode( array( 'frame-ancestors' => "'none'" ) );
		Functions\when( 'get_option' )->justReturn( $stored );

		$directives = CspPolicy::load( 'my-ware' );

		// Required directives always win.
		$this->assertSame( "'self'", $directives['frame-ancestors'] );
	}

	// ─── save ───────────────────────────────────────────────────────────────

	public function test_save_persists_directives_with_required_overrides(): void {
		$saved_value = null;
		Functions\when( 'wp_json_encode' )->alias( 'json_encode' );
		Functions\when( 'update_option' )->alias(
			function ( string $opt, mixed $val ) use ( &$saved_value ): bool {
				$saved_value = $val;
				return true;
			}
		);

		CspPolicy::save(
			'my-ware',
			array(
				'connect-src' => "'self' https://api.example.com",
			)
		);

		$this->assertNotNull( $saved_value );
		$decoded = json_decode( (string) $saved_value, true );

		// Required directive must be injected.
		$this->assertArrayHasKey( 'frame-ancestors', $decoded );
		$this->assertSame( "'self'", $decoded['frame-ancestors'] );
		// Custom directive preserved.
		$this->assertSame( "'self' https://api.example.com", $decoded['connect-src'] );
	}

	// ─── header_for ─────────────────────────────────────────────────────────

	public function test_header_for_returns_non_empty_string(): void {
		Functions\when( 'get_option' )->justReturn( '' );

		$header = CspPolicy::header_for( 'my-ware' );

		$this->assertNotEmpty( $header );
		$this->assertStringContainsString( 'default-src', $header );
	}
}
