<?php
/**
 * Base test case for all Bazaar unit tests.
 *
 * Sets up Brain Monkey with sane defaults for the WordPress functions that
 * appear in nearly every test. Extend this instead of PHPUnit\Framework\TestCase
 * directly.
 *
 * Why the defaults?
 *
 * apply_filters($hook, $value, ...) is a passthrough filter — callers expect
 * to get $value back when no hook is registered. Brain Monkey's returnArg()
 * returns the FIRST argument (the hook name), not the second (the value).
 * Using returnArg(2) here gives every test the correct behaviour without
 * each file having to know this subtlety.
 *
 * Tests that need a specific filter value can call
 * Functions\when('apply_filters')->...  again in their own setUp() to
 * override this default.
 */

declare( strict_types=1 );

namespace Bazaar\Tests;

use Brain\Monkey;
use Brain\Monkey\Functions;
use PHPUnit\Framework\TestCase;

/**
 * Base class for all Bazaar unit tests.
 */
abstract class WareTestCase extends TestCase {

	protected function setUp(): void {
		parent::setUp();
		Monkey\setUp();

		// apply_filters($tag, $value) — return $value, not $tag.
		Functions\when( 'apply_filters' )->returnArg( 2 );

		// is_wp_error() — delegate to instanceof so \WP_Error objects are detected.
		Functions\when( 'is_wp_error' )->alias( fn( $v ) => $v instanceof \WP_Error );

		// String sanitizers and escapers that should be transparent in unit tests.
		foreach ( array( 'esc_html', 'esc_attr', 'esc_url', 'sanitize_key', 'sanitize_text_field', 'sanitize_textarea_field' ) as $fn ) {
			Functions\when( $fn )->returnArg();
		}
		Functions\when( 'esc_html__' )->returnArg();
		Functions\when( 'esc_attr__' )->returnArg();
	}

	protected function tearDown(): void {
		Monkey\tearDown();
		parent::tearDown();
	}
}
