<?php

declare( strict_types=1 );

namespace Bazaar\Tests\Unit\REST;

use Bazaar\REST\UploadController;
use Bazaar\WareLoaderInterface;
use Bazaar\WareRegistryInterface;
use Brain\Monkey\Functions;
use Bazaar\Tests\WareTestCase;
use WP_REST_Request;
use WP_REST_Response;
use WP_Error;
use ZipArchive;

/**
 * Unit tests for UploadController.
 *
 * Focuses on the error and cleanup paths:
 *   - install fails → 422, no orphan
 *   - install succeeds, register fails → 500 and loader->delete() called
 *   - happy path → 201
 */
final class UploadControllerTest extends WareTestCase {

	/** Temp directory for test .wp archives. */
	private string $tmp_dir;

	/** @var array<string, mixed> In-memory option store for the stub registry. */
	private array $store = array();

	protected function setUp(): void {
		parent::setUp();
		$this->tmp_dir = sys_get_temp_dir() . '/bupload-test-' . uniqid( '', true );
		mkdir( $this->tmp_dir, 0755, true );
		$this->store = array( 'bazaar_index' => '{}' );
	}

	protected function tearDown(): void {
		if ( is_dir( $this->tmp_dir ) ) {
			array_map( 'unlink', glob( $this->tmp_dir . '/**/*' ) ?: array() );
			array_map( 'unlink', glob( $this->tmp_dir . '/*' ) ?: array() );
			@rmdir( $this->tmp_dir );
		}
		parent::tearDown();
	}

	// ─── Helpers ─────────────────────────────────────────────────────────────

	private function stub_common_wp_functions(): void {
		Functions\when( 'sanitize_file_name' )->returnArg();
		Functions\when( '__' )->returnArg();
		Functions\when( 'esc_url_raw' )->returnArg();
		Functions\when( 'absint' )->alias( 'intval' );
		Functions\when( 'wp_json_encode' )->alias( 'json_encode' );
		Functions\when( 'gmdate' )->alias( 'gmdate' );
		Functions\when( 'sprintf' )->alias( 'sprintf' );
		Functions\when( 'register_rest_route' )->justReturn( true );
	}

	/** Create a minimal valid .wp archive and return its path. */
	private function make_valid_wp_archive( string $slug = 'test-ware' ): string {
		$path = $this->tmp_dir . '/test.wp';
		$zip  = new ZipArchive();
		$zip->open( $path, ZipArchive::CREATE | ZipArchive::OVERWRITE );
		$zip->addFromString( 'manifest.json', (string) json_encode( array(
			'name'    => 'Test Ware',
			'slug'    => $slug,
			'version' => '1.0.0',
			'entry'   => 'index.html',
		) ) );
		$zip->addFromString( 'index.html', '<!DOCTYPE html><html><body>ok</body></html>' );
		$zip->close();
		return $path;
	}

	/** Build a spy WareRegistryInterface that records calls and lets register() be controlled. */
	private function make_spy_registry( bool $register_returns = true ): object {
		return new class( $register_returns ) implements WareRegistryInterface {
			public bool $register_called = false;
			public bool $get_called      = false;
			private bool $register_result;

			public function __construct( bool $register_result ) {
				$this->register_result = $register_result;
			}

			/** @param array<string, mixed> $manifest */
			public function register( array $manifest ): bool {
				$this->register_called = true;
				return $this->register_result;
			}

			/** @return array<string, mixed>|null */
			public function get( string $slug ): array|null {
				$this->get_called = true;
				return array( 'slug' => $slug, 'name' => 'Test Ware' );
			}

			/** @return array<string, array<string, mixed>> */
			public function get_index(): array { return array(); }

			public function unregister( string $slug ): bool { return true; }
			public function set_dev_url( string $slug, string $url ): bool { return true; }
			public function clear_dev_url( string $slug ): bool { return true; }
			public function enable( string $slug ): bool { return true; }
			public function disable( string $slug ): bool { return true; }

			/** @return array<string, array<string, mixed>> */
			public function get_all(): array { return array(); }
			public function exists( string $slug ): bool { return true; }
			public function update_field( string $slug, string $field, mixed $value ): bool { return true; }
		};
	}

	/** Build a spy WareLoaderInterface that records which slugs were deleted. */
	private function make_spy_loader(): object {
		return new class implements WareLoaderInterface {
			/** @var string[] */
			public array $deleted_slugs = array();
			/** @var array<string, mixed>|WP_Error */
			public array|WP_Error $install_result;

			public function __construct() {
				$this->install_result = array(
					'name'    => 'Test Ware',
					'slug'    => 'test-ware',
					'version' => '1.0.0',
					'entry'   => 'index.html',
				);
			}

			/**
			 * @param string $path Description.
			 * @param string $original_name Description.
			 * @return array<string, mixed>|WP_Error
			 */
			public function install( string $path, string $original_name ): array|WP_Error {
				return $this->install_result;
			}

			public function delete( string $slug ): bool|WP_Error {
				$this->deleted_slugs[] = $slug;
				return true;
			}
		};
	}

	private function make_upload_request( string $tmp_path, int $error = UPLOAD_ERR_OK ): WP_REST_Request {
		$req = new WP_REST_Request();
		$req->set_file_params( array(
			'file' => array(
				'tmp_name' => $tmp_path,
				'name'     => 'test.wp',
				'error'    => $error,
			),
		) );
		return $req;
	}

	// ─── no_file ─────────────────────────────────────────────────────────────

	public function test_returns_no_file_when_no_upload_provided(): void {
		$this->stub_common_wp_functions();
		$registry   = $this->make_spy_registry();
		$ctrl       = new UploadController( $registry );
		$req        = new WP_REST_Request();
		$res        = $ctrl->handle_upload( $req );

		$this->assertInstanceOf( WP_Error::class, $res );
		$this->assertSame( 'no_file', $res->get_error_code() );
	}

	// ─── upload_error ────────────────────────────────────────────────────────

	public function test_returns_upload_error_when_php_reports_upload_failure(): void {
		$this->stub_common_wp_functions();
		$registry = $this->make_spy_registry();
		$ctrl     = new UploadController( $registry );
		$req      = $this->make_upload_request( '/tmp/nonexistent.wp', UPLOAD_ERR_INI_SIZE );
		$res      = $ctrl->handle_upload( $req );

		$this->assertInstanceOf( WP_Error::class, $res );
		$this->assertSame( 'upload_error', $res->get_error_code() );
	}

	// ─── install fails → 422, no orphan ─────────────────────────────────────

	public function test_returns_422_when_install_fails_and_no_delete_called(): void {
		$this->stub_common_wp_functions();
		Functions\when( 'realpath' )->justReturn( $this->tmp_dir . '/fake.wp' );
		Functions\when( 'is_uploaded_file' )->justReturn( true );

		$registry              = $this->make_spy_registry();
		$spy_loader            = $this->make_spy_loader();
		$spy_loader->install_result = new WP_Error( 'invalid_manifest', 'Bad manifest' );

		$ctrl = new UploadController( $registry, $spy_loader );
		$req  = $this->make_upload_request( $this->tmp_dir . '/fake.wp' );
		$res  = $ctrl->handle_upload( $req );

		$this->assertInstanceOf( WP_Error::class, $res );
		$this->assertSame( 'invalid_manifest', $res->get_error_code() );
		$this->assertEmpty( $spy_loader->deleted_slugs, 'delete() must not be called when install fails' );
		$this->assertFalse( $registry->register_called, 'register() must not be called when install fails' );
	}

	// ─── install succeeds, register fails → 500, orphan cleaned up ──────────

	public function test_returns_registry_failed_and_calls_delete_when_register_fails(): void {
		$this->stub_common_wp_functions();
		Functions\when( 'realpath' )->justReturn( $this->tmp_dir . '/ok.wp' );
		Functions\when( 'is_uploaded_file' )->justReturn( true );

		$registry   = $this->make_spy_registry( false );
		$spy_loader = $this->make_spy_loader();

		$ctrl = new UploadController( $registry, $spy_loader );
		$req  = $this->make_upload_request( $this->tmp_dir . '/ok.wp' );
		$res  = $ctrl->handle_upload( $req );

		$this->assertInstanceOf( WP_Error::class, $res );
		$this->assertSame( 'registry_failed', $res->get_error_code() );
		$this->assertContains( 'test-ware', $spy_loader->deleted_slugs, 'delete() must be called to clean up orphan files' );
	}

	// ─── happy path → 201 ────────────────────────────────────────────────────

	public function test_returns_201_on_successful_upload(): void {
		$this->stub_common_wp_functions();
		Functions\when( 'realpath' )->justReturn( $this->tmp_dir . '/ok.wp' );
		Functions\when( 'is_uploaded_file' )->justReturn( true );
		Functions\when( 'do_action' )->justReturn( null );
		Functions\when( 'wp_next_scheduled' )->justReturn( false );
		Functions\when( 'wp_schedule_event' )->justReturn( true );
		Functions\when( 'add_action' )->justReturn( true );

		$registry   = $this->make_spy_registry( true );
		$spy_loader = $this->make_spy_loader();

		$ctrl = new UploadController( $registry, $spy_loader );
		$req  = $this->make_upload_request( $this->tmp_dir . '/ok.wp' );
		$res  = $ctrl->handle_upload( $req );

		$this->assertInstanceOf( WP_REST_Response::class, $res );
		$this->assertSame( 201, $res->get_status() );
		$this->assertEmpty( $spy_loader->deleted_slugs, 'delete() must not be called on success' );
	}
}
