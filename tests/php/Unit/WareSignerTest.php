<?php

declare( strict_types=1 );

namespace Bazaar\Tests\Unit;

use Bazaar\WareSigner;
use Brain\Monkey;
use Brain\Monkey\Functions;
use PHPUnit\Framework\TestCase;

/**
 * Unit tests for WareSigner.
 */
final class WareSignerTest extends TestCase {

	protected function setUp(): void {
		parent::setUp();
		Monkey\setUp();
	}

	protected function tearDown(): void {
		Monkey\tearDown();
		parent::tearDown();
	}

	public function test_unsigned_manifest_is_allowed_by_default(): void {
		$signer = new WareSigner();
		$result = $signer->verify(
			'/fake/path.wp',
			array(
				'slug'    => 'test',
				'version' => '1.0.0',
			)
		);

		$this->assertTrue( $result );
	}

	public function test_rejects_non_base64_signature(): void {
		Functions\when( 'esc_html__' )->returnArg();

		$signer = new WareSigner();
		$result = $signer->verify(
			'/fake/path.wp',
			array(
				'slug'      => 'test',
				'signature' => '!!!not-base64!!!',
			)
		);

		$this->assertInstanceOf( \WP_Error::class, $result );
		$this->assertSame( 'invalid_signature_encoding', $result->get_error_code() );
	}

	public function test_no_pubkey_and_no_enforcement_allows_signed_ware(): void {
		Functions\when( 'esc_html__' )->returnArg();
		Functions\when( 'sanitize_textarea_field' )->returnArg();
		Functions\when( 'get_option' )->justReturn( '' ); // No key stored, no enforcement.

		$signer = new WareSigner();
		$result = $signer->verify(
			'/fake/path.wp',
			array(
				'slug'      => 'test',
				// Valid base64 of something, but no public key → enforcement is off.
				'signature' => base64_encode( 'some-fake-sig-bytes' ),
			)
		);

		// Without enforcement, missing pubkey → skip verification → true.
		$this->assertTrue( $result );
	}

	public function test_no_pubkey_with_enforcement_returns_error(): void {
		Functions\when( 'esc_html__' )->returnArg();
		Functions\when( 'sanitize_textarea_field' )->returnArg();
		Functions\when( 'get_option' )->alias(
			function ( string $opt ): mixed {
				if ( 'bazaar_enforce_signatures' === $opt ) {
						return true;
				}
				return '';
			}
		);

		$signer = new WareSigner();
		$result = $signer->verify(
			'/fake/path.wp',
			array(
				'slug'      => 'test',
				'signature' => base64_encode( 'some-fake-sig-bytes' ),
			)
		);

		$this->assertInstanceOf( \WP_Error::class, $result );
		$this->assertSame( 'no_public_key', $result->get_error_code() );
	}
}
