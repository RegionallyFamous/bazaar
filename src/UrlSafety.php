<?php
/**
 * Shared URL safety helper.
 *
 * Prevents server-side request forgery by validating that a URL targets
 * a public HTTP/HTTPS endpoint and not an internal network address.
 *
 * Used by any code that issues outbound HTTP requests to URLs derived from
 * user-supplied or registry-supplied data.
 *
 * @package Bazaar
 */

declare( strict_types=1 );

namespace Bazaar;

defined( 'ABSPATH' ) || exit;

/**
 * URL safety checks for outbound HTTP calls.
 */
final class UrlSafety {

	/** Not instantiable — static helpers only. */
	private function __construct() {}

	/**
	 * Return true only for public http/https URLs.
	 *
	 * Rejects localhost, loopback (127.x, ::1), link-local (169.254.x.x),
	 * and RFC-1918 private ranges to prevent SSRF via URLs that arrive from
	 * ware manifests, registry entries, or user configuration.
	 *
	 * @param string $url URL to validate.
	 * @return bool
	 */
	public static function is_safe_url( string $url ): bool {
		$parsed = wp_parse_url( $url );
		if ( ! is_array( $parsed ) ) {
			return false;
		}

		$scheme = $parsed['scheme'] ?? '';
		if ( ! in_array( $scheme, array( 'http', 'https' ), true ) ) {
			return false;
		}

		$host = $parsed['host'] ?? '';
		if ( '' === $host ) {
			return false;
		}

		// PHP's parse_url (and wp_parse_url) returns IPv6 addresses with their
		// surrounding brackets, e.g. "[::1]". Strip them before comparison so
		// the blocklist and filter_var() checks work correctly.
		$bare_host = trim( $host, '[]' );

		if ( in_array( strtolower( $bare_host ), array( 'localhost', '127.0.0.1', '::1', '0.0.0.0', '169.254.169.254' ), true ) ) {
			return false;
		}

		if (
			filter_var( $bare_host, FILTER_VALIDATE_IP ) !== false
			&& filter_var( $bare_host, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE ) === false
		) {
			return false;
		}

		return true;
	}
}
