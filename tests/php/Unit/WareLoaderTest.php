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
		$default  = array( 'name' => 'Test', 'slug' => 'test-ware', 'version' => '1.0.0', 'entry' => 'index.html' );
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
}
