<?php
/**
 * Unit tests for AuditLog.
 *
 * @package Bazaar\Tests\Unit
 */

declare( strict_types=1 );

namespace Bazaar\Tests\Unit;

use Bazaar\AuditLog;
use Brain\Monkey\Functions;
use Bazaar\Tests\WareTestCase;

/**
 * Tests for the AuditLog write path.
 */
final class AuditLogTest extends WareTestCase {

	/** @var array<string, mixed>|null Last row passed to $wpdb->insert(). */
	private ?array $inserted_row = null;

	protected function setUp(): void {
		parent::setUp();
		$this->inserted_row = null;
		$this->stub_wp_functions();
	}

	private function stub_wp_functions(): void {
		$inserted_row = &$this->inserted_row;

		Functions\when( 'get_current_user_id' )->justReturn( 1 );
		Functions\when( 'current_time' )->justReturn( '2025-01-01 00:00:00' );
		Functions\when( 'wp_json_encode' )->alias( 'json_encode' );

		// Set up a $wpdb mock that captures the inserted row.
		global $wpdb;
		$wpdb         = new class( $inserted_row ) {
			/** @var string */
			public string $prefix = 'wp_';

			/** @var array<string, mixed>|null */
			private mixed $capture;

			/** @param array<string, mixed>|null $capture Captured row reference. */
			public function __construct( mixed &$capture ) {
				$this->capture = &$capture;
			}

			/**
			 * @param string               $table Table name.
			 * @param array<string, mixed> $data  Row data.
			 * @return int|false
			 */
			public function insert( string $table, array $data ): int|false {
				$this->capture = $data;
				return 1;
			}
		};
	}

	// ─── encode-failure fallback ───────────────────────────────────────────

	/**
	 * When wp_json_encode fails for the meta payload, the row must use '{}' —
	 * not an empty string — so the DB column keeps its valid-JSON invariant.
	 */
	public function test_record_stores_empty_json_object_when_encode_fails(): void {
		// Override wp_json_encode to always fail.
		Functions\when( 'wp_json_encode' )->justReturn( false );

		AuditLog::record( 'flow', 'install', array( 'via' => 'test' ) );

		$this->assertNotNull( $this->inserted_row );
		$this->assertSame( '{}', $this->inserted_row['meta'] );
	}

	// ─── happy path ───────────────────────────────────────────────────────

	public function test_record_stores_encoded_meta_on_success(): void {
		AuditLog::record( 'flow', 'install', array( 'source' => 'test' ) );

		$this->assertNotNull( $this->inserted_row );
		$decoded = json_decode( $this->inserted_row['meta'], true );
		$this->assertSame( array( 'source' => 'test' ), $decoded );
	}

	public function test_record_truncates_slug_to_100_chars(): void {
		$long_slug = str_repeat( 'a', 150 );
		AuditLog::record( $long_slug, 'install' );

		$this->assertNotNull( $this->inserted_row );
		$this->assertSame( 100, strlen( $this->inserted_row['slug'] ) );
	}

	public function test_record_truncates_event_to_50_chars(): void {
		$long_event = str_repeat( 'b', 80 );
		AuditLog::record( 'flow', $long_event );

		$this->assertNotNull( $this->inserted_row );
		$this->assertSame( 50, strlen( $this->inserted_row['event'] ) );
	}

	public function test_record_is_silent_when_wpdb_insert_fails(): void {
		// Override insert to simulate DB failure.
		global $wpdb;
		$wpdb = new class {
			/** @var string */
			public string $prefix = 'wp_';

			/**
			 * @param string               $table Table name.
			 * @param array<string, mixed> $data  Row data.
			 * @return false
			 */
			public function insert( string $table, array $data ): false {
				return false;
			}
		};

		// Should not throw; error_log is fired but we don't assert it here.
		Functions\when( 'error_log' )->justReturn( null );
		AuditLog::record( 'flow', 'install' );

		// Assertion: test completes without exception.
		$this->addToAssertionCount( 1 );
	}
}
