<?php

declare( strict_types=1 );

namespace Bazaar\Tests\Unit\REST;

use Bazaar\REST\JobsController;
use Bazaar\WareRegistry;
use Brain\Monkey;
use Brain\Monkey\Functions;
use PHPUnit\Framework\TestCase;

/**
 * Unit tests for JobsController static helpers.
 */
final class JobsControllerTest extends TestCase {

	protected function setUp(): void {
		parent::setUp();
		Monkey\setUp();
	}

	protected function tearDown(): void {
		Monkey\tearDown();
		parent::tearDown();
	}

	// -------------------------------------------------------------------------
	// Regression: malformed job entries must be skipped, not fatalled
	// -------------------------------------------------------------------------

	/**
	 * register_ware_jobs() must silently skip array entries that have no 'id'
	 * rather than calling wp_schedule_event / add_action with undefined offsets.
	 */
	public function test_register_ware_jobs_skips_entries_without_id(): void {
		$scheduled = array();
		$hooked    = array();

		Functions\when( 'sanitize_text_field' )->returnArg();
		Functions\when( 'wp_next_scheduled' )->justReturn( false );
		Functions\when( 'wp_schedule_event' )->alias(
			function ( int $ts, string $recurrence, string $hook ) use ( &$scheduled ): void {
				$scheduled[] = $hook;
			}
		);
		Functions\when( 'add_action' )->alias(
			function ( string $hook ) use ( &$hooked ): void {
				$hooked[] = $hook;
			}
		);

		JobsController::register_ware_jobs(
			array(
				'slug' => 'myware',
				'jobs' => array(
					array( 'interval' => 'hourly' ),         // Missing 'id' — must be skipped.
					42,                                       // Not an array — must be skipped.
					array( 'id' => '', 'interval' => 'daily' ), // Empty 'id' — must be skipped.
					array( 'id' => 'sync', 'interval' => 'twicedaily', 'endpoint' => '/sync' ),
				),
			)
		);

		// Only the valid 'sync' job should have been scheduled.
		$this->assertCount( 1, $scheduled, 'Only one valid job should be scheduled.' );
		$this->assertStringContainsString( 'sync', $scheduled[0] );
	}

	/**
	 * deregister_ware_jobs() must skip malformed entries without throwing.
	 */
	public function test_deregister_ware_jobs_skips_malformed_entries(): void {
		$unscheduled = array();

		Functions\when( 'wp_unschedule_hook' )->alias(
			function ( string $hook ) use ( &$unscheduled ): void {
				$unscheduled[] = $hook;
			}
		);

		// Should not throw for non-array or missing-id entries.
		JobsController::deregister_ware_jobs(
			'myware',
			array(
				array( 'interval' => 'hourly' ),  // No 'id'.
				'not-an-array',                   // Not an array.
				array( 'id' => 'sync' ),          // Valid.
			)
		);

		$this->assertCount( 1, $unscheduled, 'Only the valid job should be unscheduled.' );
	}
}
