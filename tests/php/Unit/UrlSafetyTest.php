<?php

declare( strict_types=1 );

namespace Bazaar\Tests\Unit;

use Bazaar\UrlSafety;
use Bazaar\Tests\WareTestCase;

/**
 * Unit tests for UrlSafety::is_safe_url().
 *
 * All branches are exercised without a running WordPress instance —
 * wp_parse_url() is aliased to the native parse_url() function.
 */
final class UrlSafetyTest extends WareTestCase {

	// ── Public HTTP/HTTPS URLs are safe ───────────────────────────────────────

	public function test_https_public_url_is_safe(): void {
		$this->assertTrue( UrlSafety::is_safe_url( 'https://example.com/path' ) );
	}

	public function test_http_public_url_is_safe(): void {
		$this->assertTrue( UrlSafety::is_safe_url( 'http://example.com' ) );
	}

	public function test_url_with_port_is_safe(): void {
		$this->assertTrue( UrlSafety::is_safe_url( 'https://example.com:8443/api' ) );
	}

	// ── Non-HTTP schemes are rejected ─────────────────────────────────────────

	public function test_ftp_scheme_is_rejected(): void {
		$this->assertFalse( UrlSafety::is_safe_url( 'ftp://example.com/file' ) );
	}

	public function test_javascript_scheme_is_rejected(): void {
		$this->assertFalse( UrlSafety::is_safe_url( 'javascript:alert(1)' ) );
	}

	public function test_data_uri_is_rejected(): void {
		$this->assertFalse( UrlSafety::is_safe_url( 'data:text/html,<h1>test</h1>' ) );
	}

	public function test_no_scheme_is_rejected(): void {
		$this->assertFalse( UrlSafety::is_safe_url( '//example.com' ) );
	}

	// ── Empty / malformed input is rejected ───────────────────────────────────

	public function test_empty_string_is_rejected(): void {
		$this->assertFalse( UrlSafety::is_safe_url( '' ) );
	}

	public function test_relative_path_is_rejected(): void {
		$this->assertFalse( UrlSafety::is_safe_url( '/path/to/resource' ) );
	}

	// ── Localhost and loopback addresses are rejected ────────────────────────

	public function test_localhost_is_rejected(): void {
		$this->assertFalse( UrlSafety::is_safe_url( 'http://localhost/admin' ) );
	}

	public function test_loopback_ipv4_is_rejected(): void {
		$this->assertFalse( UrlSafety::is_safe_url( 'http://127.0.0.1/admin' ) );
	}

	public function test_loopback_ipv6_is_rejected(): void {
		$this->assertFalse( UrlSafety::is_safe_url( 'http://[::1]/admin' ) );
	}

	public function test_any_address_is_rejected(): void {
		$this->assertFalse( UrlSafety::is_safe_url( 'http://0.0.0.0/admin' ) );
	}

	public function test_metadata_endpoint_is_rejected(): void {
		// AWS/GCP instance metadata endpoint — classic SSRF target.
		$this->assertFalse( UrlSafety::is_safe_url( 'http://169.254.169.254/latest/meta-data/' ) );
	}

	// ── RFC-1918 private ranges are rejected ──────────────────────────────────

	public function test_rfc1918_10_range_is_rejected(): void {
		$this->assertFalse( UrlSafety::is_safe_url( 'http://10.0.0.1/' ) );
	}

	public function test_rfc1918_172_range_is_rejected(): void {
		$this->assertFalse( UrlSafety::is_safe_url( 'http://172.16.0.1/' ) );
	}

	public function test_rfc1918_192_range_is_rejected(): void {
		$this->assertFalse( UrlSafety::is_safe_url( 'http://192.168.1.1/' ) );
	}

	// ── Public IP addresses are safe ──────────────────────────────────────────

	public function test_public_ipv4_is_safe(): void {
		$this->assertTrue( UrlSafety::is_safe_url( 'https://8.8.8.8/dns-query' ) );
	}
}
