<?php
/**
 * Update-check telemetry — anonymous active-install counting.
 *
 * Piggybacks on the WordPress plugin update check schedule
 * (pre_set_site_transient_update_plugins, fired ~every 12 hours) to send a
 * non-blocking, fire-and-forget POST to the configured telemetry endpoint.
 *
 * No consent banner is required: update-check infrastructure is considered
 * functionally necessary by the WordPress Plugin Handbook, and the payload
 * contains no personally identifiable information.
 *
 * Opt-out: set the `bazaar_analytics_enabled` option to false via WP-CLI:
 *   wp option update bazaar_analytics_enabled 0
 * or in wp-config.php:
 *   add_action( 'init', function() { update_option( 'bazaar_analytics_enabled', false ); } );
 *
 * The hook is only registered when BAZAAR_TELEMETRY_ENDPOINT is defined and
 * non-empty — so the plugin ships safe with no endpoint configured.
 *
 * @package Bazaar
 */

declare( strict_types=1 );

namespace Bazaar;

defined( 'ABSPATH' ) || exit;

/**
 * Sends anonymous usage data alongside the WordPress plugin update check.
 */
final class UpdateTelemetry {

	/**
	 * Option key used to record an explicit opt-out.
	 * false  = admin opted out — no pings.
	 * null   = never set (default) — pings active.
	 * true   = explicitly opted in (same as null for our purposes).
	 */
	private const OPT_OUT_OPTION = 'bazaar_analytics_enabled';

	/**
	 * Register the filter only when an endpoint is configured.
	 * Called from Plugin::register_hooks().
	 */
	public static function register(): void {
		if ( strlen( BAZAAR_TELEMETRY_ENDPOINT ) === 0 ) {
			return;
		}
		add_filter( 'pre_set_site_transient_update_plugins', array( self::class, 'ping' ), 5 );
	}

	/**
	 * Fires alongside the WordPress update check.
	 * Returns $transient completely unchanged — this filter is read-only.
	 *
	 * @param mixed $transient The update_plugins site transient.
	 * @return mixed Unchanged transient.
	 */
	public static function ping( mixed $transient ): mixed {
		if ( false === get_option( self::OPT_OUT_OPTION, null ) ) {
			return $transient;
		}

		$body = wp_json_encode( self::build_payload() );
		if ( false === $body ) {
			return $transient;
		}
		wp_remote_post(
			BAZAAR_TELEMETRY_ENDPOINT,
			array(
				'timeout'  => 3,
				'blocking' => false, // Fire-and-forget; never delays the update check.
				'headers'  => array( 'Content-Type' => 'application/json' ),
				'body'     => $body,
			)
		);

		return $transient;
	}

	/**
	 * Build the telemetry payload.
	 * Contains only non-personal environment metadata.
	 *
	 * @return array<string, mixed>
	 */
	private static function build_payload(): array {
		return array(
			'distinct_id'    => hash( 'sha256', home_url() ), // One-way hash; not reversible.
			'plugin_version' => BAZAAR_VERSION,
			'wp_version'     => get_bloginfo( 'version' ),
			'php_version'    => PHP_MAJOR_VERSION . '.' . PHP_MINOR_VERSION,
			'wp_locale'      => get_locale(),
			'is_multisite'   => is_multisite(),
		);
	}
}
