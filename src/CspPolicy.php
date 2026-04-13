<?php
/**
 * Content-Security-Policy service.
 *
 * Builds and resolves per-ware CSP header values from stored config.
 * Code that needs the CSP header at serve time (WareServer) imports
 * this class rather than CspController — keeping the REST layer out of
 * the file-serving hot path.
 *
 * The REST surface for managing directives lives in
 * REST/CspController.php.
 *
 * @package Bazaar
 */

declare( strict_types=1 );

namespace Bazaar;

defined( 'ABSPATH' ) || exit;

/**
 * Reads, compiles, and persists per-ware Content-Security-Policy config.
 */
final class CspPolicy {

	/** Directives that may never be removed (security invariants). */
	public const REQUIRED = array(
		'frame-ancestors' => "'self'",
	);

	/** Applied when no per-ware config exists. */
	public const BASELINE = array(
		'default-src'     => "'self'",
		'script-src'      => "'self' 'unsafe-inline'",
		'style-src'       => "'self' 'unsafe-inline'",
		'img-src'         => "'self' data: https:",
		'connect-src'     => "'self'",
		'frame-ancestors' => "'self'",
	);

	/**
	 * Return the compiled Content-Security-Policy header value for a ware.
	 * Merges stored config over the baseline and enforces required directives.
	 *
	 * @param string $slug Ware slug.
	 * @return string Ready-to-send header value.
	 */
	public static function header_for( string $slug ): string {
		return self::compile( self::load( $slug ) );
	}

	/**
	 * Load stored directives for a ware, falling back to the baseline.
	 *
	 * @param string $slug Ware slug.
	 * @return array<string, string>
	 */
	public static function load( string $slug ): array {
		$slug = sanitize_key( $slug );
		$raw  = get_option( "bazaar_csp_{$slug}", '' );
		if ( '' === $raw ) {
			return self::BASELINE;
		}
		$dec = json_decode( (string) $raw, true );
		if ( JSON_ERROR_NONE !== json_last_error() || ! is_array( $dec ) ) {
			return self::BASELINE;
		}
		$dirs = array_merge( self::BASELINE, $dec );

		// Enforce invariants regardless of stored value.
		foreach ( self::REQUIRED as $d => $v ) {
			$dirs[ $d ] = $v;
		}

		return $dirs;
	}

	/**
	 * Persist CSP directive overrides for a ware, merging in any required directives.
	 *
	 * @param string                $slug       Ware slug used as the option key suffix.
	 * @param array<string, string> $directives Map of CSP directive name to source list.
	 * @return bool True on success, false if encoding or persistence failed.
	 */
	public static function save( string $slug, array $directives ): bool {
		$slug  = sanitize_key( $slug );
		$clean = array();
		foreach ( self::REQUIRED as $d => $v ) {
			$directives[ $d ] = $v;
		}
		foreach ( $directives as $d => $v ) {
			$clean_d = str_replace( array( "\r", "\n", ';' ), '', (string) $d );
			$clean_v = str_replace( array( "\r", "\n", ';' ), '', (string) $v );
			if ( '' !== $clean_d ) {
				$clean[ $clean_d ] = $clean_v;
			}
		}
		$enc = wp_json_encode( $clean );
		if ( false === $enc ) {
			return false;
		}
		return (bool) update_option( "bazaar_csp_{$slug}", $enc, false );
	}

	/**
	 * Compile a map of CSP directives into a single header value string.
	 *
	 * Strips \r, \n, and ; from directive names and source values to prevent
	 * HTTP header injection if tainted values reach this point.
	 *
	 * @param array<string, string> $directives Map of directive name to source list.
	 * @return string Ready-to-send Content-Security-Policy header value.
	 */
	public static function compile( array $directives ): string {
		$parts = array();
		foreach ( $directives as $directive => $sources ) {
			$clean_directive = str_replace( array( "\r", "\n", ';' ), '', (string) $directive );
			$clean_sources   = str_replace( array( "\r", "\n", ';' ), '', (string) $sources );
			if ( '' !== $clean_directive ) {
				$parts[] = $clean_directive . ' ' . trim( $clean_sources );
			}
		}
		return implode( '; ', $parts );
	}
}
