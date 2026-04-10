<?php

declare( strict_types=1 );

namespace Bazaar\Tests\Unit;

use Bazaar\WareRegistry;
use Brain\Monkey;
use Brain\Monkey\Functions;
use PHPUnit\Framework\TestCase;

/**
 * Unit tests for WareRegistry.
 *
 * Uses Brain Monkey to mock WordPress functions so no WP install is required.
 */
final class WareRegistryTest extends TestCase {

	protected function setUp(): void {
		parent::setUp();
		Monkey\setUp();
	}

	protected function tearDown(): void {
		Monkey\tearDown();
		parent::tearDown();
	}

	public function test_register_stores_ware(): void {
		Functions\when( 'get_option' )->justReturn( '[]' );
		Functions\when( 'sanitize_key' )->returnArg();
		Functions\when( 'sanitize_text_field' )->returnArg();
		Functions\when( 'sanitize_textarea_field' )->returnArg();
		Functions\when( 'esc_url_raw' )->returnArg();
		Functions\when( 'absint' )->alias( 'intval' );
		Functions\when( 'wp_json_encode' )->alias( 'json_encode' );
		Functions\when( 'update_option' )->justReturn( true );

		$registry = new WareRegistry();
		$result   = $registry->register( [
			'name'    => 'Test Ware',
			'slug'    => 'test-ware',
			'version' => '1.0.0',
		] );

		$this->assertTrue( $result );
	}

	public function test_register_rejects_empty_slug(): void {
		Functions\when( 'get_option' )->justReturn( '[]' );
		Functions\when( 'sanitize_key' )->justReturn( '' );

		$registry = new WareRegistry();
		$result   = $registry->register( [
			'name'    => 'Bad Ware',
			'slug'    => '',
			'version' => '1.0.0',
		] );

		$this->assertFalse( $result );
	}

	public function test_get_returns_null_for_missing_slug(): void {
		Functions\when( 'get_option' )->justReturn( '[]' );
		Functions\when( 'sanitize_key' )->returnArg();

		$registry = new WareRegistry();
		$this->assertNull( $registry->get( 'nonexistent' ) );
	}

	public function test_exists_returns_false_for_unknown_slug(): void {
		Functions\when( 'get_option' )->justReturn( '[]' );
		Functions\when( 'sanitize_key' )->returnArg();

		$registry = new WareRegistry();
		$this->assertFalse( $registry->exists( 'ghost' ) );
	}
}
