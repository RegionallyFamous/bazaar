<?php
/**
 * Registers and renders the bazaar/ware Gutenberg block.
 *
 * The block embeds a ware inside a sandboxed iframe on the frontend.
 * Rather than reusing the admin nonce (which would expose admin credentials),
 * a short-lived signed public token is generated for each render.
 *
 * Token format (JSON, base64url-encoded):
 *   { slug, site, exp, sig }
 *   sig = HMAC-SHA256( slug + '|' + site + '|' + exp, BAZAAR_SECRET )
 *
 * The WareServer verifies this token when serving block-rendered iframes.
 *
 * @package Bazaar
 */

declare( strict_types=1 );

namespace Bazaar\Blocks;

defined( 'ABSPATH' ) || exit;

/**
 * Handles block registration and render callback.
 */
final class WareBlock {

	/** Token TTL in seconds (1 hour). */
	private const TOKEN_TTL = HOUR_IN_SECONDS;

	/**
	 * Register hooks.
	 */
	public function register_hooks(): void {
		add_action( 'init', array( $this, 'register_block' ) );
	}

	/**
	 * Register the block type with WordPress.
	 */
	public function register_block(): void {
		$block_json = BAZAAR_PLUGIN_DIR . 'blocks/ware/block.json';

		if ( ! file_exists( $block_json ) ) {
			return;
		}

		register_block_type(
			$block_json,
			array(
				'render_callback' => array( $this, 'render' ),
			)
		);
	}

	/**
	 * Server-side render callback.
	 *
	 * @param array<string, mixed> $attrs Block attributes.
	 * @return string HTML output.
	 */
	public function render( array $attrs ): string {
		$slug   = sanitize_key( $attrs['slug'] ?? '' );
		$height = absint( $attrs['height'] ?? 600 );
		$height = max( 200, min( $height, 2000 ) );

		if ( '' === $slug ) {
			return '<p>' . esc_html__( 'No ware selected.', 'bazaar' ) . '</p>';
		}

		// Verify the ware is installed and enabled.
		if ( ! file_exists( BAZAAR_WARES_DIR . $slug ) ) {
			if ( current_user_can( 'manage_options' ) ) {
				return '<p>' . esc_html(
					sprintf(
					/* translators: %s: ware slug */
						__( 'Ware "%s" is not installed.', 'bazaar' ),
						$slug
					)
				) . '</p>';
			}
			return '';
		}

		$token = $this->generate_token( $slug );
		$src   = rest_url( "bazaar/v1/serve/{$slug}/index.html" );
		$src   = add_query_arg( '_bazaar_block_token', rawurlencode( $token ), $src );

		$unique_id = 'bwb-' . wp_unique_id();

		return sprintf(
			'<div class="wp-block-bazaar-ware" data-slug="%1$s" style="height:%2$dpx">
				<iframe
					id="%3$s"
					src="%4$s"
					height="%2$d"
					width="100%%"
					frameborder="0"
					sandbox="allow-scripts allow-forms allow-same-origin allow-popups"
					referrerpolicy="same-origin"
					loading="lazy"
					title="%5$s"
					style="width:100%%;height:%2$dpx;border:none;display:block;"
				></iframe>
			</div>',
			esc_attr( $slug ),
			$height,
			esc_attr( $unique_id ),
			esc_url( $src ),
			/* translators: %s: ware slug */
			esc_attr( sprintf( __( '%s — Bazaar ware', 'bazaar' ), $slug ) )
		);
	}

	// -------------------------------------------------------------------------
	// Token helpers
	// -------------------------------------------------------------------------

	/**
	 * Generate a short-lived HMAC-signed token for block iframe auth.
	 *
	 * @param string $slug Ware slug.
	 * @return string Base64url-encoded token JSON.
	 */
	private function generate_token( string $slug ): string {
		$exp     = time() + self::TOKEN_TTL;
		$site    = home_url();
		$payload = $slug . '|' . $site . '|' . $exp;
		$sig     = hash_hmac( 'sha256', $payload, BAZAAR_SECRET );

		$token = (string) wp_json_encode(
			array(
				'slug' => $slug,
				'site' => $site,
				'exp'  => $exp,
				'sig'  => $sig,
			)
		);

		return rtrim( strtr( base64_encode( $token ), '+/', '-_' ), '=' );
	}

	/**
	 * Verify a block token. Used by WareServer when serving block iframes.
	 *
	 * @param string $raw_token Raw token string from the query param.
	 * @return string|false Verified ware slug on success, false on failure.
	 */
	public static function verify_token( string $raw_token ): string|false {
		$json = base64_decode( strtr( $raw_token, '-_', '+/' ) . str_repeat( '=', 4 ) );
		if ( false === $json ) {
			return false;
		}

		$data = json_decode( $json, true );
		if ( ! is_array( $data ) || empty( $data['slug'] ) || empty( $data['exp'] ) || empty( $data['sig'] ) ) {
			return false;
		}

		// Check expiry.
		if ( (int) $data['exp'] < time() ) {
			return false;
		}

		// Verify signature.
		$payload  = $data['slug'] . '|' . $data['site'] . '|' . $data['exp'];
		$expected = hash_hmac( 'sha256', $payload, BAZAAR_SECRET );

		if ( ! hash_equals( $expected, $data['sig'] ) ) {
			return false;
		}

		return sanitize_key( $data['slug'] );
	}
}
