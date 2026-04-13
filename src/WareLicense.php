<?php
/**
 * License key validation for paid wares.
 *
 * Paid wares declare `"license": {"type": "key", "url": "https://..."}` in
 * their manifest. At install time the user is prompted to enter a license key.
 * The key is validated against the vendor's URL and stored in a per-ware option.
 *
 * Validation request
 * ──────────────────
 * POST {manifest.license.url}
 * Body: { "slug": "crm", "key": "XXXX-XXXX", "site": "https://mysite.com" }
 *
 * Expected responses
 * ──────────────────
 * 200 { "valid": true,  "expires": null | "2027-01-01" }
 * 200 { "valid": false, "message": "Expired license." }
 * Any non-200 status → treat as validation failure.
 *
 * Offline mode
 * ────────────
 * If the validation URL is unreachable and a valid key was previously stored,
 * the ware is still considered licensed (offline grace period).
 *
 * @package Bazaar
 */

declare( strict_types=1 );

namespace Bazaar;

defined( 'ABSPATH' ) || exit;

use WP_Error;

/**
 * Stores and verifies license keys for paid wares.
 */
final class WareLicense {

	/** Option prefix for stored license data. */
	private const KEY_PREFIX = 'bazaar_license_';

	// -------------------------------------------------------------------------
	// Public API
	// -------------------------------------------------------------------------

	/**
	 * Store a license key for a ware.
	 * Does NOT validate — call validate() separately when online.
	 *
	 * @param string $slug Ware slug.
	 * @param string $key  Raw license key.
	 */
	public function set( string $slug, string $key ): void {
		$slug              = sanitize_key( $slug );
		$data              = $this->load( $slug );
		$data['key']       = sanitize_text_field( $key );
		$data['validated'] = false;
		$data['expires']   = null;
		$this->store( $slug, $data );
	}

	/**
	 * Retrieve the stored license key for a ware.
	 *
	 * @param string $slug Ware slug.
	 * @return string Empty string if none stored.
	 */
	public function get_key( string $slug ): string {
		return (string) ( $this->load( sanitize_key( $slug ) )['key'] ?? '' );
	}

	/**
	 * Delete the stored license data for a ware.
	 *
	 * @param string $slug Ware slug.
	 */
	public function delete( string $slug ): void {
		delete_option( self::KEY_PREFIX . sanitize_key( $slug ) );
	}

	/**
	 * Check whether a ware is licensed.
	 * Returns true if the ware is free, or if a valid key is stored.
	 *
	 * @param array<string, mixed> $ware Full ware manifest.
	 * @return bool
	 */
	public function is_licensed( array $ware ): bool {
		$license = $ware['license'] ?? array();
		$type    = $license['type'] ?? 'free';

		if ( 'free' === $type || 'open-source' === $type ) {
			return true;
		}

		$slug = sanitize_key( $ware['slug'] ?? '' );
		$data = $this->load( $slug );

		if ( empty( $data['key'] ) ) {
			return false;
		}

		// Check expiry. An invalid/unparseable date is treated as already-expired
		// so a corrupt expiry string cannot accidentally grant access.
		if ( ! empty( $data['expires'] ) ) {
			$expires = strtotime( $data['expires'] );
			if ( false === $expires || $expires < time() ) {
				return false;
			}
		}

		return (bool) ( $data['validated'] ?? false );
	}

	/**
	 * Validate a license key against the vendor's URL.
	 *
	 * @param string               $slug Ware slug.
	 * @param string               $key  License key to validate.
	 * @param array<string, mixed> $license License metadata from manifest.
	 * @return true|WP_Error
	 */
	public function validate( string $slug, string $key, array $license ): bool|WP_Error {
		$url = esc_url_raw( $license['url'] ?? '' );
		if ( '' === $url ) {
			// No validation URL — accept the key as-is.
			$this->mark_validated( $slug, $key, null );
			return true;
		}

		if ( ! UrlSafety::is_safe_url( $url ) ) {
			return new WP_Error( 'unsafe_url', esc_html__( 'License validation URL targets a disallowed host.', 'bazaar' ) );
		}

		$body = wp_json_encode(
			array(
				'slug' => $slug,
				'key'  => $key,
				'site' => home_url(),
			)
		);

		if ( false === $body ) {
			return new WP_Error( 'encode_error', esc_html__( 'Failed to encode license request.', 'bazaar' ) );
		}

		$response = wp_remote_post(
			$url,
			array(
				'timeout'     => 10,
				'redirection' => 0,
				'headers'     => array( 'Content-Type' => 'application/json' ),
				'body'        => $body,
			)
		);

		if ( is_wp_error( $response ) ) {
			// Network error — use grace period if we already had a validated key.
			$stored = $this->load( $slug );
			if ( ! empty( $stored['validated'] ) ) {
				return true; // Offline grace period: key was previously validated.
			}
			return $response;
		}

		$code = wp_remote_retrieve_response_code( $response );
		$body = json_decode( wp_remote_retrieve_body( $response ), true );

		// Require strict true — empty(), truthy strings ("false", "1"), and numbers
		// must not be treated as valid.
		if ( 200 !== (int) $code || ! is_array( $body ) || true !== ( $body['valid'] ?? null ) ) {
			$message = $body['message'] ?? __( 'License key is not valid.', 'bazaar' );
			return new WP_Error( 'license_invalid', esc_html( $message ) );
		}

		$this->mark_validated( $slug, $key, $body['expires'] ?? null );
		return true;
	}

	// -------------------------------------------------------------------------
	// Private helpers
	// -------------------------------------------------------------------------

	/**
	 * Load persisted license data for a ware.
	 *
	 * @param string $slug Ware slug.
	 * @return array<string, mixed>
	 */
	private function load( string $slug ): array {
		$raw = get_option( self::KEY_PREFIX . $slug );
		if ( false === $raw ) {
			return array();
		}
		$dec = json_decode( (string) $raw, true );
		return is_array( $dec ) ? $dec : array();
	}

	/**
	 * Persist license data for a ware.
	 *
	 * @param string               $slug Ware slug.
	 * @param array<string, mixed> $data License data to persist.
	 */
	private function store( string $slug, array $data ): void {
		$enc = wp_json_encode( $data );
		if ( false !== $enc ) {
			update_option( self::KEY_PREFIX . $slug, $enc, false );
		}
	}

	/**
	 * Persist a validation timestamp so offline grace-period checks can succeed.
	 *
	 * @param string      $slug    Ware slug.
	 * @param string      $key     License key that was validated.
	 * @param string|null $expires ISO-8601 expiry date returned by the license server, or null.
	 */
	private function mark_validated( string $slug, string $key, ?string $expires ): void {
		$this->store(
			sanitize_key( $slug ),
			array(
				'key'        => $key,
				'validated'  => true,
				'expires'    => $expires,
				'last_check' => gmdate( 'Y-m-d\TH:i:s\Z' ),
			)
		);
	}
}
