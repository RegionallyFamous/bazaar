<?php

declare( strict_types=1 );

namespace Bazaar\Tests\Unit\Blocks;

use Bazaar\Blocks\WareBlock;
use Bazaar\WareRegistry;
use Brain\Monkey\Functions;
use Bazaar\Tests\WareTestCase;

/**
 * Unit tests for WareBlock token generation and verification.
 */
final class WareBlockTest extends WareTestCase {

	/** @var array<string, mixed> In-memory option store. */
	private array $store = array();

	protected function setUp(): void {
		parent::setUp();
		$this->store = array( 'bazaar_index' => '{}' );
		$this->stub_wp_functions();
	}

	private function stub_wp_functions(): void {
		$store = &$this->store;

		Functions\when( 'esc_url_raw' )->returnArg();
		Functions\when( '__' )->returnArg();
		Functions\when( 'absint' )->alias( 'intval' );
		Functions\when( 'wp_json_encode' )->alias( 'json_encode' );
		Functions\when( 'gmdate' )->alias( 'gmdate' );
		Functions\when( 'sprintf' )->alias( 'sprintf' );
		Functions\when( 'home_url' )->justReturn( 'https://example.com' );

		Functions\when( 'get_option' )->alias(
			function ( string $opt, mixed $default = false ) use ( &$store ): mixed {
				return $store[ $opt ] ?? $default;
			}
		);

		Functions\when( 'update_option' )->alias(
			function ( string $opt, mixed $val ) use ( &$store ): bool {
				$store[ $opt ] = $val;
				return true;
			}
		);
	}

	/** Seed a ware so registry->get() returns it. */
	private function seed_ware( string $slug ): void {
		$ware = array(
			'slug'        => $slug,
			'name'        => ucfirst( $slug ),
			'version'     => '1.0.0',
			'enabled'     => true,
			'icon'        => '',
			'entry'       => 'index.html',
			'author'      => '',
			'description' => '',
			'menu'        => array(
				'title'      => ucfirst( $slug ),
				'position'   => null,
				'capability' => 'manage_options',
				'parent'     => null,
				'group'      => null,
			),
			'permissions' => array(),
			'license'     => array( 'type' => 'free', 'url' => '', 'required' => 'false' ),
			'registry'    => array(),
			'installed'   => '2025-01-01T00:00:00Z',
		);

		$index                                 = json_decode( (string) ( $this->store['bazaar_index'] ?? '{}' ), true ) ?? array();
		$index[ $slug ]                        = array(
			'slug'        => $slug,
			'name'        => ucfirst( $slug ),
			'enabled'     => true,
			'version'     => '1.0.0',
			'icon'        => '',
			'entry'       => 'index.html',
			'menu_title'  => ucfirst( $slug ),
			'capability'  => 'manage_options',
			'group'       => null,
			'dev_url'     => null,
			'permissions' => array(),
		);
		$this->store['bazaar_index']           = (string) json_encode( $index );
		$this->store[ 'bazaar_ware_' . $slug ] = (string) json_encode( $ware );
	}

	/**
	 * Generate a token via render and extract it from the URL.
	 * We drive it through render() so the private generate_token() is exercised.
	 */
	private function generate_token_via_render( string $slug ): string {
		$this->seed_ware( $slug );

		Functions\when( 'wp_unique_id' )->justReturn( 'test-uid' );
		Functions\when( 'rest_url' )->alias(
			fn( string $path ) => "https://example.com/wp-json/{$path}"
		);
		Functions\when( 'add_query_arg' )->alias(
			function ( string $key, string $val, string $url ): string {
				return $url . '?' . $key . '=' . rawurlencode( $val );
			}
		);
		Functions\when( 'esc_url' )->returnArg();

		$block = new WareBlock( new WareRegistry() );
		$html  = $block->render( array( 'slug' => $slug, 'height' => 600 ), '' );

		// Pull the token value out of the rendered src URL.
		preg_match( '/_bazaar_block_token=([^"&\s]+)/', $html, $m );
		return rawurldecode( $m[1] ?? '' );
	}

	// ─── verify_token — valid round-trip ─────────────────────────────────────

	public function test_verify_token_returns_slug_for_valid_token(): void {
		$token = $this->generate_token_via_render( 'board' );
		$this->assertNotEmpty( $token );

		$result = WareBlock::verify_token( $token );
		$this->assertSame( 'board', $result );
	}

	// ─── verify_token — expired token ────────────────────────────────────────

	public function test_verify_token_returns_false_for_expired_token(): void {
		$slug    = 'board';
		$site    = 'https://example.com';
		$exp     = time() - 10; // already expired
		$payload = $slug . '|' . $site . '|' . $exp;
		$sig     = hash_hmac( 'sha256', $payload, BAZAAR_SECRET );

		$token_json = (string) json_encode(
			array(
				'slug' => $slug,
				'site' => $site,
				'exp'  => $exp,
				'sig'  => $sig,
			)
		);
		$token = rtrim( strtr( base64_encode( $token_json ), '+/', '-_' ), '=' );

		$this->assertFalse( WareBlock::verify_token( $token ) );
	}

	// ─── verify_token — tampered / invalid base64 ────────────────────────────

	public function test_verify_token_returns_false_for_garbage_input(): void {
		$this->assertFalse( WareBlock::verify_token( '!!not-base64!!' ) );
	}

	// ─── verify_token — json_decode failure (valid base64, invalid JSON) ─────

	public function test_verify_token_returns_false_for_invalid_json_payload(): void {
		$bad_payload = rtrim( strtr( base64_encode( '{not valid json' ), '+/', '-_' ), '=' );
		$this->assertFalse( WareBlock::verify_token( $bad_payload ) );
	}

	// ─── verify_token — signature mismatch ───────────────────────────────────

	public function test_verify_token_returns_false_for_wrong_signature(): void {
		$slug = 'board';
		$site = 'https://example.com';
		$exp  = time() + 3600;

		$token_json = (string) json_encode(
			array(
				'slug' => $slug,
				'site' => $site,
				'exp'  => $exp,
				'sig'  => 'completely-wrong-signature',
			)
		);
		$token = rtrim( strtr( base64_encode( $token_json ), '+/', '-_' ), '=' );

		$this->assertFalse( WareBlock::verify_token( $token ) );
	}

	// ─── render uses entry field from ware manifest ───────────────────────────

	/**
	 * The iframe src must use the ware's declared entry filename, not a hardcoded
	 * 'index.html'. This was broken before the fix.
	 */
	public function test_render_uses_ware_entry_field_in_iframe_src(): void {
		// Override seed to set a custom entry field.
		$slug = 'board';
		$ware = array(
			'slug'        => $slug,
			'name'        => 'Board',
			'version'     => '1.0.0',
			'enabled'     => true,
			'icon'        => '',
			'entry'       => 'app.html',
			'author'      => '',
			'description' => '',
			'menu'        => array(
				'title'      => 'Board',
				'position'   => null,
				'capability' => 'manage_options',
				'parent'     => null,
				'group'      => null,
			),
			'permissions' => array(),
			'license'     => array( 'type' => 'free', 'url' => '', 'required' => 'false' ),
			'registry'    => array(),
			'installed'   => '2025-01-01T00:00:00Z',
		);

		$index                                 = json_decode( (string) ( $this->store['bazaar_index'] ?? '{}' ), true ) ?? array();
		$index[ $slug ]                        = array(
			'slug'        => $slug,
			'name'        => 'Board',
			'enabled'     => true,
			'version'     => '1.0.0',
			'icon'        => '',
			'entry'       => 'app.html',
			'menu_title'  => 'Board',
			'capability'  => 'manage_options',
			'group'       => null,
			'dev_url'     => null,
			'permissions' => array(),
		);
		$this->store['bazaar_index']           = (string) json_encode( $index );
		$this->store[ 'bazaar_ware_' . $slug ] = (string) json_encode( $ware );

		Functions\when( 'wp_unique_id' )->justReturn( 'uid-entry' );
		Functions\when( 'rest_url' )->alias(
			fn( string $path ) => "https://example.com/wp-json/{$path}"
		);
		Functions\when( 'add_query_arg' )->alias(
			function ( string $key, string $val, string $url ): string {
				return $url . '?' . $key . '=' . rawurlencode( $val );
			}
		);
		Functions\when( 'esc_url' )->returnArg();

		$block = new \Bazaar\Blocks\WareBlock( new \Bazaar\WareRegistry() );
		$html  = $block->render( array( 'slug' => $slug, 'height' => 600 ), '' );

		$this->assertStringContainsString(
			'app.html',
			$html,
			"iframe src must contain the ware's declared entry 'app.html', not 'index.html'."
		);
		$this->assertStringNotContainsString(
			'index.html',
			$html,
			"Hardcoded 'index.html' must not appear when entry is 'app.html'."
		);
	}

	// ─── verify_token — all base64 padding lengths ────────────────────────────

	/**
	 * Tokens whose unpadded base64url length is 0, 1, 2, or 3 mod 4 must all
	 * round-trip correctly through verify_token. The padding formula
	 * (4 - len%4)%4 handles all four cases.
	 */
	public function test_verify_token_handles_all_base64_padding_lengths(): void {
		$site = 'https://example.com';
		$exp  = time() + 3600;

		// Generate tokens whose base64url payloads land in each padding bucket.
		// We achieve this by varying the slug length until we get payloads whose
		// base64url length hits each of the 4 remainder classes mod 4.
		$covered = array();

		for ( $extra = 0; $extra <= 20; $extra++ ) {
			// Vary slug length to rotate the base64url length through all 4 classes.
			$slug = 'a' . str_repeat( 'x', $extra );

			$payload = $slug . '|' . $site . '|' . $exp;
			$sig     = hash_hmac( 'sha256', $payload, BAZAAR_SECRET );

			$token_json = (string) json_encode(
				array(
					'slug' => $slug,
					'site' => $site,
					'exp'  => $exp,
					'sig'  => $sig,
				)
			);
			$b64url  = rtrim( strtr( base64_encode( $token_json ), '+/', '-_' ), '=' );
			$mod     = strlen( $b64url ) % 4;
			$covered[ $mod ] = true;

			$result = \Bazaar\Blocks\WareBlock::verify_token( $b64url );
			$this->assertSame(
				sanitize_key( $slug ),
				$result,
				"verify_token must succeed for base64url length mod 4 = {$mod} (slug={$slug})."
			);

			if ( count( $covered ) === 4 ) {
				break;
			}
		}

		// Confirm we covered at least the common cases (mod 0, 1, 2, or 3).
		$this->assertGreaterThanOrEqual(
			3,
			count( $covered ),
			'Test must cover at least 3 of the 4 base64 padding remainder classes.'
		);
	}

	// ─── generate_token failure: wp_json_encode returns false ────────────────

	public function test_render_returns_empty_string_when_token_encoding_fails(): void {
		$this->seed_ware( 'board' );
		Functions\when( 'wp_json_encode' )->justReturn( false );

		$block  = new WareBlock( new WareRegistry() );
		$output = $block->render( array( 'slug' => 'board', 'height' => 400 ), '' );

		$this->assertSame( '', $output );
	}
}
