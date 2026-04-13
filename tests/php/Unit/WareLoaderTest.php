<?php

declare( strict_types=1 );

namespace Bazaar\Tests\Unit;

use Bazaar\WareLoader;
use Bazaar\WareRegistry;
use Brain\Monkey;
use Brain\Monkey\Functions;
use PHPUnit\Framework\TestCase;
use ZipArchive;

/**
 * Unit tests for WareLoader validation pipeline.
 */
final class WareLoaderTest extends TestCase {

	private string $tmp_dir;

	protected function setUp(): void {
		parent::setUp();
		Monkey\setUp();
		$this->tmp_dir = sys_get_temp_dir() . '/bazaar-test-' . uniqid( '', true );
		mkdir( $this->tmp_dir, 0755, true );
	}

	protected function tearDown(): void {
		Monkey\tearDown();
		// Clean up temp files.
		if ( is_dir( $this->tmp_dir ) ) {
			array_map( 'unlink', glob( $this->tmp_dir . '/*' ) ?: array() );
			rmdir( $this->tmp_dir );
		}
		parent::tearDown();
	}

	// -------------------------------------------------------------------------
	// Helpers
	// -------------------------------------------------------------------------

	/**
	 * Build a valid .wp ZIP archive and return its path.
	 *
	 * @param array<string, mixed> $manifest
	 * @param string[]             $extra_files Extra filenames to add.
	 */
	private function make_wp_archive( array $manifest = array(), array $extra_files = array() ): string {
		$default  = array(
			'name'    => 'Test',
			'slug'    => 'test-ware',
			'version' => '1.0.0',
			'entry'   => 'index.html',
		);
		$manifest = array_merge( $default, $manifest );

		$path = $this->tmp_dir . '/test.wp';
		$zip  = new ZipArchive();
		$zip->open( $path, ZipArchive::CREATE | ZipArchive::OVERWRITE );
		$zip->addFromString( 'manifest.json', json_encode( $manifest ) );
		$zip->addFromString( 'index.html', '<!DOCTYPE html><html><body>Hello</body></html>' );
		foreach ( $extra_files as $file ) {
			$zip->addFromString( $file, '<?php echo "bad"; ?>' );
		}
		$zip->close();
		return $path;
	}

	/**
	 * Build a WareRegistry instance with get_option stubbed to an empty registry.
	 * Must be called before overriding the get_option stub for other purposes.
	 */
	private function make_registry(): WareRegistry {
		Functions\when( 'get_option' )->justReturn( '[]' );
		Functions\when( 'sanitize_key' )->returnArg();
		return new WareRegistry();
	}

	// -------------------------------------------------------------------------
	// Tests
	// -------------------------------------------------------------------------

	public function test_rejects_non_wp_extension(): void {
		$loader = new WareLoader( $this->make_registry() );

		Functions\when( 'esc_html__' )->returnArg();

		$result = $loader->validate( $this->tmp_dir . '/fake.zip', 'fake.zip' );

		$this->assertInstanceOf( \WP_Error::class, $result );
		$this->assertSame( 'invalid_extension', $result->get_error_code() );
	}

	public function test_rejects_php_file_inside_archive(): void {
		$loader = new WareLoader( $this->make_registry() );

		Functions\when( 'esc_html__' )->returnArg();
		Functions\when( 'esc_html' )->returnArg();
		Functions\when( 'get_option' )->justReturn( BAZAAR_MAX_UNCOMPRESSED_SIZE );
		Functions\when( 'absint' )->alias( 'intval' );
		Functions\when( 'number_format_i18n' )->alias( 'number_format' );

		$path   = $this->make_wp_archive( array(), array( 'shell.php' ) );
		$result = $loader->validate( $path, 'test.wp' );

		$this->assertInstanceOf( \WP_Error::class, $result );
		$this->assertSame( 'forbidden_file_type', $result->get_error_code() );
	}

	public function test_rejects_archive_without_manifest(): void {
		$loader = new WareLoader( $this->make_registry() );

		Functions\when( 'esc_html__' )->returnArg();
		Functions\when( 'get_option' )->justReturn( BAZAAR_MAX_UNCOMPRESSED_SIZE );
		Functions\when( 'absint' )->alias( 'intval' );
		Functions\when( 'number_format_i18n' )->alias( 'number_format' );

		$path = $this->tmp_dir . '/no-manifest.wp';
		$zip  = new ZipArchive();
		$zip->open( $path, ZipArchive::CREATE | ZipArchive::OVERWRITE );
		$zip->addFromString( 'index.html', 'hello' );
		$zip->close();

		$result = $loader->validate( $path, 'no-manifest.wp' );

		$this->assertInstanceOf( \WP_Error::class, $result );
		$this->assertSame( 'missing_manifest', $result->get_error_code() );
	}

	public function test_valid_archive_returns_manifest_array(): void {
		$loader = new WareLoader( $this->make_registry() );

		Functions\when( 'esc_html__' )->returnArg();
		Functions\when( 'esc_html' )->returnArg();
		Functions\when( 'get_option' )->justReturn( BAZAAR_MAX_UNCOMPRESSED_SIZE );
		Functions\when( 'absint' )->alias( 'intval' );
		Functions\when( 'number_format_i18n' )->alias( 'number_format' );
		Functions\when( 'sanitize_key' )->returnArg();

		$path   = $this->make_wp_archive();
		$result = $loader->validate( $path, 'test.wp' );

		$this->assertIsArray( $result );
		$this->assertSame( 'test-ware', $result['slug'] );
	}

	public function test_rejects_invalid_manifest_json(): void {
		$loader = new WareLoader( $this->make_registry() );

		Functions\when( 'esc_html__' )->returnArg();
		Functions\when( 'get_option' )->justReturn( BAZAAR_MAX_UNCOMPRESSED_SIZE );
		Functions\when( 'absint' )->alias( 'intval' );
		Functions\when( 'number_format_i18n' )->alias( 'number_format' );

		$path = $this->tmp_dir . '/bad-json.wp';
		$zip  = new ZipArchive();
		$zip->open( $path, ZipArchive::CREATE | ZipArchive::OVERWRITE );
		$zip->addFromString( 'manifest.json', '{not valid json' );
		$zip->addFromString( 'index.html', 'hello' );
		$zip->close();

		$result = $loader->validate( $path, 'bad-json.wp' );

		$this->assertInstanceOf( \WP_Error::class, $result );
		$this->assertSame( 'invalid_manifest', $result->get_error_code() );
	}

	public function test_rejects_manifest_missing_required_fields(): void {
		$loader = new WareLoader( $this->make_registry() );

		Functions\when( 'esc_html__' )->returnArg();
		Functions\when( 'esc_html' )->returnArg();
		Functions\when( 'get_option' )->justReturn( BAZAAR_MAX_UNCOMPRESSED_SIZE );
		Functions\when( 'absint' )->alias( 'intval' );
		Functions\when( 'number_format_i18n' )->alias( 'number_format' );
		Functions\when( 'sanitize_key' )->returnArg();

		// Missing 'version' field.
		$path   = $this->make_wp_archive( array( 'version' => '' ) );
		$result = $loader->validate( $path, 'test.wp' );

		$this->assertInstanceOf( \WP_Error::class, $result );
		$this->assertSame( 'missing_manifest_field', $result->get_error_code() );
	}

	public function test_rejects_slug_that_is_already_installed(): void {
		Functions\when( 'sanitize_key' )->returnArg();
		Functions\when( 'esc_html__' )->returnArg();
		Functions\when( 'esc_html' )->returnArg();
		Functions\when( 'absint' )->alias( 'intval' );
		Functions\when( 'number_format_i18n' )->alias( 'number_format' );

		// Seed the registry index so 'test-ware' already appears as installed.
		Functions\when( 'get_option' )->alias(
			static function ( string $opt, mixed $default = false ): mixed {
				if ( 'bazaar_max_ware_size' === $opt ) {
					return BAZAAR_MAX_UNCOMPRESSED_SIZE;
				}
				if ( 'bazaar_index' === $opt ) {
					return (string) json_encode( array( 'test-ware' => array( 'slug' => 'test-ware' ) ) );
				}
				return $default;
			}
		);

		$registry = new WareRegistry();
		$loader   = new WareLoader( $registry );
		$path     = $this->make_wp_archive();
		$result   = $loader->validate( $path, 'test.wp' );

		$this->assertInstanceOf( \WP_Error::class, $result );
		$this->assertSame( 'slug_exists', $result->get_error_code() );
	}

	// ─── install() ───────────────────────────────────────────────────────────

	public function test_install_returns_wp_error_when_lock_already_held(): void {
		Functions\when( 'sanitize_key' )->returnArg();
		Functions\when( 'esc_html__' )->returnArg();
		Functions\when( 'esc_html' )->returnArg();
		Functions\when( 'absint' )->alias( 'intval' );
		Functions\when( 'number_format_i18n' )->alias( 'number_format' );
		Functions\when( 'get_option' )->justReturn( BAZAAR_MAX_UNCOMPRESSED_SIZE );
		// Simulate lock already held by returning false from add_option.
		Functions\when( 'add_option' )->justReturn( false );

		$registry = new WareRegistry();
		$loader   = new WareLoader( $registry );
		$path     = $this->make_wp_archive();
		$result   = $loader->install( $path, 'test-ware.wp' );

		$this->assertInstanceOf( \WP_Error::class, $result );
		$this->assertSame( 'install_in_progress', $result->get_error_code() );
	}

	// ─── delete() ────────────────────────────────────────────────────────────

	public function test_delete_returns_true_when_directory_does_not_exist(): void {
		Functions\when( 'sanitize_key' )->returnArg();

		$loader = new WareLoader( $this->make_registry() );
		// 'nonexistent-ware' has no directory under BAZAAR_WARES_DIR in temp.
		$result = $loader->delete( 'nonexistent-ware' );

		$this->assertTrue( $result );
	}

	public function test_delete_returns_true_after_removing_ware_directory(): void {
		Functions\when( 'sanitize_key' )->returnArg();
		Functions\when( 'esc_html__' )->returnArg();
		Functions\when( 'esc_html' )->returnArg();
		Functions\when( 'request_filesystem_credentials' )->justReturn( true );
		Functions\when( 'WP_Filesystem' )->alias(
			static function (): bool {
				global $wp_filesystem;
				$wp_filesystem = new class() extends \WP_Filesystem_Base {
					/** @param bool $recursive */
					public function delete( string $path, bool $recursive = false ): bool {
						if ( ! is_dir( $path ) ) {
							return false;
						}
						foreach ( glob( "$path/*" ) ?: array() as $f ) {
							unlink( $f );
						}
						return rmdir( $path );
					}
				};
				return true;
			}
		);

		// Create a real ware directory to delete.
		$slug     = 'delete-test-ware';
		$ware_dir = BAZAAR_WARES_DIR . $slug;
		if ( ! is_dir( $ware_dir ) ) {
			mkdir( $ware_dir, 0755, true );
		}
		file_put_contents( $ware_dir . '/index.html', '<html></html>' );

		$loader = new WareLoader( $this->make_registry() );
		$result = $loader->delete( $slug );

		$this->assertTrue( $result );
		$this->assertDirectoryDoesNotExist( $ware_dir );
	}

	public function test_rejects_archive_with_path_traversal(): void {
		$loader = new WareLoader( $this->make_registry() );

		Functions\when( 'esc_html__' )->returnArg();
		Functions\when( 'esc_html' )->returnArg();
		Functions\when( 'get_option' )->justReturn( BAZAAR_MAX_UNCOMPRESSED_SIZE );
		Functions\when( 'absint' )->alias( 'intval' );
		Functions\when( 'number_format_i18n' )->alias( 'number_format' );

		$path = $this->tmp_dir . '/traversal.wp';
		$zip  = new ZipArchive();
		$zip->open( $path, ZipArchive::CREATE | ZipArchive::OVERWRITE );
		$zip->addFromString(
			'manifest.json',
			json_encode(
				array(
					'name'    => 'Traversal',
					'slug'    => 'traversal',
					'version' => '1.0.0',
					'entry'   => 'index.html',
				)
			)
		);
		$zip->addFromString( '../escape.html', 'pwned' );
		$zip->close();

		$result = $loader->validate( $path, 'traversal.wp' );

		$this->assertInstanceOf( \WP_Error::class, $result );
		$this->assertSame( 'path_traversal', $result->get_error_code() );
	}
}
