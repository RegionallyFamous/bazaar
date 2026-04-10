<?php
/**
 * Database table name constants.
 *
 * Use as `$wpdb->prefix . Tables::ANALYTICS` rather than repeating
 * the string literal. Adding the prefix in call sites (not here) keeps
 * these constants network-aware — each site on a multisite install has
 * its own prefix.
 *
 * @package Bazaar
 */

declare( strict_types=1 );

namespace Bazaar\Db;

defined( 'ABSPATH' ) || exit;

/**
 * Unprefixed table name fragments for all Bazaar custom tables.
 */
final class Tables {

	/** View analytics events. */
	public const ANALYTICS = 'bazaar_analytics';

	/** JS error reports from ware iframes. */
	public const ERRORS = 'bazaar_errors';

	/** Append-only lifecycle audit trail. */
	public const AUDIT_LOG = 'bazaar_audit_log';

	/** Not instantiable — constants only. */
	private function __construct() {}
}
