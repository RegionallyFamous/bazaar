<?php
/**
 * Ware signing and signature verification.
 *
 * Wares can be optionally signed by their author using RSA-SHA256.
 * The signature covers the full ZIP archive bytes.
 *
 * Workflow
 * ────────
 * 1. Author runs: wp bazaar sign my-ware.wp --key=private.pem
 *    → Computes SHA-256 of the .wp file → Signs with private key → Base64-encodes
 *    → Writes signature to manifest.json as { "signature": "..." }
 *    → Re-packages the .wp
 *
 * 2. At install time, WareLoader calls WareSigner::verify() if the manifest
 *    contains a `signature` field. If verification fails, install is aborted
 *    unless the admin has disabled signature enforcement.
 *
 * 3. The public key used for verification is stored in the `bazaar_public_key`
 *    option. Admins can set a custom key per-ware or site-wide.
 *
 * @package Bazaar
 */

declare( strict_types=1 );

namespace Bazaar;

defined( 'ABSPATH' ) || exit;

use WP_Error;

/**
 * RSA-SHA256 signing helpers for .wp archives.
 */
final class WareSigner {

	/** Option key for the site-wide verification public key (PEM). */
	private const PUBKEY_OPTION = 'bazaar_signing_pubkey';

	// -------------------------------------------------------------------------
	// Verification (install-time)
	// -------------------------------------------------------------------------

	/**
	 * Verify a .wp archive's RSA-SHA256 signature.
	 *
	 * The signature is stored in manifest.json → `signature` (base64-encoded).
	 * Verification uses the site-wide public key set in plugin settings, or a
	 * per-ware public key embedded in the manifest as `signingKey`.
	 *
	 * @param string               $archive_path Absolute path to the .wp file.
	 * @param array<string, mixed> $manifest     Parsed manifest.json contents.
	 * @return true|WP_Error  True on success; WP_Error on verification failure.
	 */
	public function verify( string $archive_path, array $manifest ): bool|WP_Error {
		if ( ! isset( $manifest['signature'] ) ) {
			// No signature present → allow (unsigned wares are permitted by default).
			return true;
		}

		$sig_b64 = (string) $manifest['signature'];
		$sig     = base64_decode( $sig_b64, true );
		if ( false === $sig ) {
			return new WP_Error( 'invalid_signature_encoding', esc_html__( 'Signature is not valid base64.', 'bazaar' ) );
		}

		// Resolve public key. In production the site-wide key is always used.
		// A per-ware embedded signingKey is only honoured when WP_DEBUG is active
		// to prevent a malicious author from self-signing with their own key.
		$pubkey_pem = (string) get_option( self::PUBKEY_OPTION, '' );
		if ( defined( 'WP_DEBUG' ) && WP_DEBUG && ! empty( $manifest['signingKey'] ) ) {
			$pubkey_pem = sanitize_textarea_field( $manifest['signingKey'] );
		}

		if ( '' === $pubkey_pem ) {
			// No public key configured → cannot verify; honour the signed-only policy.
			$enforce = (bool) get_option( 'bazaar_enforce_signatures', false );
			if ( $enforce ) {
				return new WP_Error( 'no_public_key', esc_html__( 'Signature present but no public key is configured for verification.', 'bazaar' ) );
			}
			return true;
		}

		$pubkey = openssl_get_publickey( $pubkey_pem );
		if ( false === $pubkey ) {
			return new WP_Error( 'invalid_public_key', esc_html__( 'Configured public key is not valid PEM.', 'bazaar' ) );
		}

		// Read archive bytes (without the signature — the signature itself is
		// excluded from the signed content in the manifest, so we sign the
		// original archive bytes directly).
		if ( ! function_exists( 'WP_Filesystem' ) ) {
			require_once ABSPATH . 'wp-admin/includes/file.php';
		}
		WP_Filesystem();
		global $wp_filesystem;
		if ( empty( $wp_filesystem ) ) {
			return new WP_Error( 'fs_unavailable', esc_html__( 'WordPress filesystem could not be initialised.', 'bazaar' ) );
		}
		$data = $wp_filesystem->get_contents( $archive_path );
		if ( false === $data ) {
			return new WP_Error( 'read_error', esc_html__( 'Could not read archive for signature verification.', 'bazaar' ) );
		}

		$ok = openssl_verify( $data, $sig, $pubkey, OPENSSL_ALGO_SHA256 );

		if ( 1 !== $ok ) {
			return new WP_Error(
				'signature_mismatch',
				esc_html__( 'Ware signature verification failed. The archive may have been tampered with.', 'bazaar' )
			);
		}

		return true;
	}

	// -------------------------------------------------------------------------
	// Signing (CLI helper)
	// -------------------------------------------------------------------------

	/**
	 * Sign a .wp archive with a private key and return the base64 signature.
	 *
	 * @param string $archive_path   Absolute path to the .wp archive.
	 * @param string $privkey_path   Absolute path to the PEM private key.
	 * @param string $privkey_passphrase Optional passphrase for the private key.
	 * @return string|WP_Error Base64-encoded signature on success.
	 */
	public function sign( string $archive_path, string $privkey_path, string $privkey_passphrase = '' ): string|WP_Error {
		if ( ! file_exists( $archive_path ) ) {
			return new WP_Error( 'archive_not_found', esc_html__( 'Archive file not found.', 'bazaar' ) );
		}

		if ( ! file_exists( $privkey_path ) ) {
			return new WP_Error( 'key_not_found', esc_html__( 'Private key file not found.', 'bazaar' ) );
		}

		if ( ! function_exists( 'WP_Filesystem' ) ) {
			require_once ABSPATH . 'wp-admin/includes/file.php';
		}
		WP_Filesystem();
		global $wp_filesystem;
		if ( empty( $wp_filesystem ) ) {
			return new WP_Error( 'fs_unavailable', esc_html__( 'WordPress filesystem could not be initialised.', 'bazaar' ) );
		}
		$pem = $wp_filesystem->get_contents( $privkey_path );
		if ( false === $pem ) {
			return new WP_Error( 'key_read_error', esc_html__( 'Could not read private key file.', 'bazaar' ) );
		}

		$privkey = openssl_get_privatekey( $pem, $privkey_passphrase );

		if ( false === $privkey ) {
			return new WP_Error( 'invalid_private_key', esc_html__( 'Private key is not valid PEM or passphrase is wrong.', 'bazaar' ) );
		}

		$data = $wp_filesystem->get_contents( $archive_path );
		if ( false === $data ) {
			return new WP_Error( 'read_error', esc_html__( 'Could not read archive for signing.', 'bazaar' ) );
		}

		$sig = '';
		$ok  = openssl_sign( $data, $sig, $privkey, OPENSSL_ALGO_SHA256 );

		if ( ! $ok ) {
			return new WP_Error( 'sign_failed', esc_html__( 'openssl_sign() failed.', 'bazaar' ) );
		}

		return base64_encode( $sig );
	}

	/**
	 * Generate a fresh RSA-2048 keypair and return [ 'private' => ..., 'public' => ... ].
	 *
	 * @return array{private: string, public: string}|WP_Error
	 */
	public function generate_keypair(): array|WP_Error {
		$res = openssl_pkey_new(
			array(
				'private_key_bits' => 2048,
				'private_key_type' => OPENSSL_KEYTYPE_RSA,
			)
		);

		if ( false === $res ) {
			return new WP_Error( 'keygen_failed', esc_html__( 'OpenSSL key generation failed.', 'bazaar' ) );
		}

		$private = '';
		openssl_pkey_export( $res, $private );

		$details = openssl_pkey_get_details( $res );
		$public  = $details['key'] ?? '';

		return array(
			'private' => $private,
			'public'  => $public,
		);
	}
}
