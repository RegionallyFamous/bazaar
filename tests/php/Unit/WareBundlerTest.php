<?php
/**
 * Unit tests for WareBundler.
 *
 * @package Bazaar\Tests\Unit
 */

declare( strict_types=1 );

namespace Bazaar\Tests\Unit;

use Bazaar\WareBundler;
use Bazaar\WareLoaderInterface;
use Brain\Monkey\Functions;
use Bazaar\Tests\WareTestCase;

/**
 * Tests for the WareBundler install path.
 */
final class WareBundlerTest extends WareTestCase {

	/** @var array<string, mixed> In-memory option store. */
	private array $store = array();

	/** @var string[] update_option calls recorded, keyed by option name. */
	private array $updated = array();

	/** @var string Temp directory cleaned up after each test. */
	private string $tmp_dir = '';

	protected function setUp(): void {
		parent::setUp();
		$this->store   = array();
		$this->updated = array();

		$this->tmp_dir = sys_get_temp_dir() . '/bazaar-bundler-test-' . uniqid( '', true );
		mkdir( $this->tmp_dir, 0755, true );

		// WareBundler::install() does `require_once ABSPATH . 'wp-admin/includes/file.php'`
		// unconditionally. ABSPATH is set to sys_get_temp_dir().'/' in the test bootstrap.
		// We create a no-op stub file so the require_once succeeds without loading
		// any real WordPress code.
		$wp_admin_dir = sys_get_temp_dir() . '/wp-admin/includes';
		if ( ! is_dir( $wp_admin_dir ) ) {
			mkdir( $wp_admin_dir, 0755, true );
		}
		$stub_file = $wp_admin_dir . '/file.php';
		if ( ! file_exists( $stub_file ) ) {
			file_put_contents( $stub_file, '<?php // wp-admin/includes/file.php stub for tests' );
		}

		$this->stub_wp_functions();
	}

	protected function tearDown(): void {
		if ( is_dir( $this->tmp_dir ) ) {
			$this->rm_rf( $this->tmp_dir );
		}
		// Unset the filesystem global to avoid leaking a non-WP_Filesystem_Base
		// anonymous class into subsequent test classes.
		global $wp_filesystem;
		$wp_filesystem = null;
		parent::tearDown();
	}

	private function stub_wp_functions(): void {
		$store   = &$this->store;
		$updated = &$this->updated;
		$tmp_dir = $this->tmp_dir;

		Functions\when( 'wp_generate_password' )->justReturn( 'testpwd1' );
		Functions\when( 'get_temp_dir' )->justReturn( sys_get_temp_dir() . '/' );
		Functions\when( 'wp_delete_file' )->justReturn( true );
		Functions\when( 'get_current_user_id' )->justReturn( 1 );
		Functions\when( 'current_time' )->justReturn( '2025-01-01 00:00:00' );

		// Fake WP_Filesystem() — marks global as ready.
		Functions\when( 'WP_Filesystem' )->alias(
			static function (): bool {
				global $wp_filesystem;
				$wp_filesystem = new class() extends \WP_Filesystem_Base {
					/**
					 * @param string $path Description.
					 * @return string|false
					 */
					public function get_contents( string $path ): string|false {
						return file_get_contents( $path );
					}

					/**
					 * @param string $path      Description.
					 * @param bool   $recursive Description.
					 * @return bool
					 */
					public function delete( string $path, bool $recursive = false ): bool {
						if ( is_dir( $path ) ) {
							array_map( 'unlink', glob( $path . '/*' ) ?: array() );
							rmdir( $path );
						}
						return true;
					}

					/**
					 * @param string $path Description.
					 * @param bool   $recursive Description.
					 * @return bool
					 */
					public function rmdir( string $path, bool $recursive = false ): bool {
						return $this->delete( $path, $recursive );
					}
				};
				return true;
			}
		);

		// unzip_file — extract the bundle zip for real so file_exists checks work.
		Functions\when( 'unzip_file' )->alias(
			function ( string $zip_path, string $dest ): true {
				if ( ! is_dir( $dest ) ) {
					mkdir( $dest, 0755, true );
				}
				$zip = new \ZipArchive();
				$zip->open( $zip_path );
				$zip->extractTo( $dest );
				$zip->close();
				return true;
			}
		);

		Functions\when( 'get_option' )->alias(
			function ( string $opt, mixed $default = false ) use ( &$store ): mixed {
				return $store[ $opt ] ?? $default;
			}
		);

		Functions\when( 'update_option' )->alias(
			function ( string $opt, mixed $val ) use ( &$store, &$updated ): bool {
				$store[ $opt ]   = $val;
				$updated[ $opt ] = $val;
				return true;
			}
		);

		Functions\when( 'add_option' )->justReturn( true );
		Functions\when( 'delete_option' )->justReturn( true );
		Functions\when( 'wp_json_encode' )->alias( 'json_encode' );
		Functions\when( 'absint' )->alias( 'intval' );
		Functions\when( 'gmdate' )->alias( 'gmdate' );
		Functions\when( 'number_format_i18n' )->alias( 'number_format' );
		Functions\when( '__' )->returnArg();
	}

	// ─── Helpers ──────────────────────────────────────────────────────────────

	/**
	 * Build a fake WareLoaderInterface that returns a success manifest for any path.
	 *
	 * @param array<string, mixed> $manifest Manifest to return from install_from_path.
	 */
	private function make_loader( array $manifest ): WareLoaderInterface {
		return new class( $manifest ) implements WareLoaderInterface {
			/** @var array<string, mixed> */
			private array $manifest;

			/** @param array<string, mixed> $manifest Description. */
			public function __construct( array $manifest ) {
				$this->manifest = $manifest;
			}

			/** @return array<string, mixed>|\WP_Error */
			public function install( string $tmp_path, string $original_name ): array|\WP_Error {
				return $this->manifest;
			}

			/** @return array<string, mixed>|\WP_Error */
			public function install_from_path( string $path ): array|\WP_Error {
				return $this->manifest;
			}

			/** @return bool|\WP_Error */
			public function delete( string $slug ): bool|\WP_Error {
				return true;
			}
		};
	}

	/**
	 * Create a minimal .wpbundle file (a zip) in the temp dir.
	 *
	 * @param array<string, mixed>[] $ware_entries Bundle manifest wares array.
	 * @param string[]               $ware_slugs   Fake .wp filenames to include.
	 * @return string Path to the .wpbundle file.
	 */
	private function make_bundle( array $ware_entries, array $ware_slugs = array() ): string {
		$bundle_path = $this->tmp_dir . '/test.wpbundle';
		$zip         = new \ZipArchive();
		$zip->open( $bundle_path, \ZipArchive::CREATE | \ZipArchive::OVERWRITE );
		$zip->addFromString(
			'bundle.json',
			(string) json_encode(
				array(
					'name'    => 'Test Bundle',
					'version' => '1.0.0',
					'wares'   => $ware_entries,
				)
			)
		);
		foreach ( $ware_slugs as $slug ) {
			// Add a fake .wp file so file_exists passes.
			$zip->addFromString( $slug . '.wp', 'placeholder' );
		}
		$zip->close();
		return $bundle_path;
	}

	// ─── encode-failure guard ──────────────────────────────────────────────────

	/**
	 * When wp_json_encode returns false for the merged config, update_option must
	 * not be called for that ware's config key.
	 */
	public function test_install_skips_config_update_when_encode_fails(): void {
		$slug        = 'test-ware';
		$bundle_path = $this->make_bundle(
			array(
				array( 'file' => "{$slug}.wp", 'config' => array( 'theme' => 'dark' ) ),
			),
			array( $slug )
		);

		// wp_json_encode must return false to trigger the guard.
		Functions\when( 'wp_json_encode' )->justReturn( false );

		$loader   = $this->make_loader( array( 'slug' => $slug, 'name' => 'Test Ware', 'version' => '1.0.0' ) );
		$bundler  = new WareBundler( $loader );
		$result   = $bundler->install( $bundle_path );

		$this->assertArrayHasKey( 'installed', $result );
		$config_key = "bazaar_config_{$slug}";
		$this->assertArrayNotHasKey(
			$config_key,
			$this->updated,
			'update_option must NOT be called for the config key when wp_json_encode fails.'
		);
	}

	// ─── happy path ──────────────────────────────────────────────────────────

	public function test_install_stores_config_when_encode_succeeds(): void {
		$slug        = 'flow';
		$bundle_path = $this->make_bundle(
			array(
				array( 'file' => "{$slug}.wp", 'config' => array( 'mode' => 'focus' ) ),
			),
			array( $slug )
		);

		$loader  = $this->make_loader( array( 'slug' => $slug, 'name' => 'Flow', 'version' => '1.0.0' ) );
		$bundler = new WareBundler( $loader );
		$result  = $bundler->install( $bundle_path );

		$this->assertContains( $slug, $result['installed'] );
		$this->assertArrayHasKey( "bazaar_config_{$slug}", $this->updated );
		$stored = json_decode( (string) $this->updated[ "bazaar_config_{$slug}" ], true );
		$this->assertSame( 'focus', $stored['mode'] );
	}

	// ─── helpers ─────────────────────────────────────────────────────────────

	private function rm_rf( string $dir ): void {
		foreach ( glob( $dir . '/*' ) ?: array() as $item ) {
			is_dir( $item ) ? $this->rm_rf( $item ) : unlink( $item );
		}
		rmdir( $dir );
	}
}
