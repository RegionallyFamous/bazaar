<?php
/**
 * Webhook dispatcher service.
 *
 * Fires registered outbound webhooks when a bus event occurs.
 * Extracted from WebhooksController so the dispatch logic can be called
 * from the `bazaar_bus_event` action hook without importing a REST class.
 *
 * @package Bazaar
 */

declare( strict_types=1 );

namespace Bazaar;

defined( 'ABSPATH' ) || exit;

/**
 * Delivers outbound webhook POSTs for registered ware listeners.
 */
final class WebhookDispatcher {

	/**
	 * Fire all webhooks registered for the given event + ware.
	 * Called by the `bazaar_bus_event` WordPress action.
	 *
	 * @param string $event    Bus event name.
	 * @param mixed  $data     Event payload.
	 * @param string $from     Originating ware slug.
	 */
	public static function dispatch( string $event, mixed $data, string $from ): void {
		$all   = self::load_all();
		$hooks = array_filter( $all, static fn( array $w ) => $w['slug'] === $from && $w['event'] === $event );

		if ( empty( $hooks ) ) {
			return;
		}

		$payload_json = (string) wp_json_encode(
			array(
				'event'     => $event,
				'data'      => $data,
				'ware'      => $from,
				'timestamp' => time(),
			)
		);

		foreach ( $hooks as $hook ) {
			if ( ! is_array( $hook ) || empty( $hook['url'] ) || ! filter_var( $hook['url'], FILTER_VALIDATE_URL ) ) {
				continue;
			}
			$headers = array(
				'Content-Type'      => 'application/json',
				'X-Bazaar-Event'    => $event,
				'X-Bazaar-Delivery' => wp_generate_uuid4(),
			);
			if ( ! empty( $hook['secret'] ) ) {
				$headers['X-Bazaar-Signature-256'] = 'sha256=' . hash_hmac( 'sha256', $payload_json, $hook['secret'] );
			}
			wp_remote_post(
				$hook['url'],
				array(
					'body'     => $payload_json,
					'headers'  => $headers,
					'timeout'  => 5,
					'blocking' => false,
				)
			);
		}
	}

	/**
	 * Load all registered webhooks from the options table.
	 *
	 * @return array<int, array<string, mixed>>
	 */
	private static function load_all(): array {
		$raw = get_option( 'bazaar_webhooks', '[]' );
		$dec = json_decode( (string) $raw, true );
		if ( json_last_error() !== JSON_ERROR_NONE || ! is_array( $dec ) ) {
			return array();
		}
		return $dec;
	}
}
