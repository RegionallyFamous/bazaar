<?php
/**
 * Server-Sent Events endpoint for real-time shell updates.
 *
 * Design: each connection drains the per-user event queue and exits
 * immediately, telling the browser to reconnect after RETRY_MS.  This is
 * short-polling via the EventSource API — each PHP process lives for < 100 ms
 * instead of holding a PHP-FPM worker open for tens of seconds.
 *
 * Producer side: any PHP code can push an event via bazaar_push_sse_event().
 * Consumer side: the Bazaar Shell connects with EventSource and receives events.
 *
 * Supported event types
 * ─────────────────────
 *   badge          { slug, count }
 *   toast          { message, level }
 *   ware-installed { slug, name, … }
 *   ware-deleted   { slug }
 *   ware-toggled   { slug, enabled }
 *
 * @package Bazaar
 */

declare( strict_types=1 );

namespace Bazaar\REST;

defined( 'ABSPATH' ) || exit;

use WP_REST_Server;
use WP_REST_Request;

/**
 * SSE stream endpoint.
 */
final class StreamController extends BazaarController {

	/**
	 * REST API namespace.
	 *
	 * @var string
	 */
	protected $namespace = 'bazaar/v1';

	/**
	 * Route base (the part after the namespace).
	 *
	 * @var string
	 */
	protected $rest_base = 'stream';

	/**
	 * Client reconnect interval (ms).
	 * Each connection drains the queue and exits immediately; the browser
	 * EventSource reconnects after this delay, turning long-polling into
	 * lightweight short-polling without holding a PHP-FPM worker open.
	 */
	private const RETRY_MS = 5000;

	/** Transient TTL — long enough to survive several reconnect cycles. */
	private const QUEUE_TTL = 60;

	/** Transient key prefix for per-user queues. */
	private const QUEUE_PREFIX = 'bazaar_sse_';

	/**
	 * Register the SSE stream REST route.
	 */
	public function register_routes(): void {
		register_rest_route(
			$this->namespace,
			"/{$this->rest_base}",
			array(
				array(
					'methods'             => WP_REST_Server::READABLE,
					'callback'            => array( $this, 'stream' ),
					'permission_callback' => $this->require_admin(),
				),
			)
		);
	}

	/**
	 * Permission callback — requires manage_options capability.
	 *
	 * @return bool
	 */

	/**
	 * Drain the event queue and exit immediately.
	 * The browser EventSource reconnects after RETRY_MS, giving us
	 * short-polling without holding a PHP-FPM worker open.
	 *
	 * @param WP_REST_Request $request REST request.
	 * @return void  Exits after flushing events.
	 */
	public function stream( WP_REST_Request $request ): void {
		// Validate nonce manually; WP REST already verified it, but belt+suspenders.
		if ( ! current_user_can( 'manage_options' ) ) {
			status_header( 403 );
			exit;
		}

		$uid = get_current_user_id();

		// Release the PHP session lock so concurrent requests (badge polls,
		// REST calls) are never blocked waiting for this response.
		if ( session_status() === PHP_SESSION_ACTIVE ) {
			session_write_close();
		}

		// Clear any existing output buffers.
		while ( ob_get_level() ) {
			ob_end_clean();
		}

		// SSE headers.
		header( 'Content-Type: text/event-stream; charset=UTF-8' );
		header( 'Cache-Control: no-store, no-cache, must-revalidate' );
		header( 'X-Accel-Buffering: no' ); // Disable nginx buffering.
		header( 'Connection: close' );     // Release the TCP connection immediately.

		// Remove any content-length that WP might have set.
		header_remove( 'Content-Length' );

		// Tell the client how long to wait before reconnecting.
		// Each connection drains the queue and exits — the browser reconnects
		// after RETRY_MS, giving us short-polling without holding a worker.
		printf( "retry: %d\n\n", self::RETRY_MS );

		// Drain any pending events for this user.
		$events = $this->dequeue( $uid );
		foreach ( $events as $event ) {
			if ( ! is_array( $event ) || ! isset( $event['type'], $event['data'] ) ) {
				continue;
			}
			$this->send( $event['type'], $event['data'] );
		}

		// Heartbeat comment to confirm the connection was live.
		echo ": ok\n\n";

		$this->flush();
		exit;
	}

	// -------------------------------------------------------------------------
	// Static producer API
	// -------------------------------------------------------------------------

	/**
	 * Push an SSE event to all logged-in admin users' queues.
	 * This is the method called by bazaar_push_sse_event().
	 *
	 * @param string               $type Event type string.
	 * @param array<string, mixed> $data Event payload.
	 */
	public static function push_to_all( string $type, array $data ): void {
		// Find all admin users — keep the list short; only users who can
		// manage_options will ever connect to the stream.
		$users = get_users(
			array(
				'capability' => 'manage_options',
				'fields'     => 'ID',
				'number'     => 200, // Cap to avoid loading all users on large sites.
			)
		);

		foreach ( $users as $uid ) {
			self::push_to_user( (int) $uid, $type, $data );
		}
	}

	/**
	 * Push an SSE event to a specific user's queue.
	 *
	 * @param int                  $uid  WordPress user ID.
	 * @param string               $type Event type.
	 * @param array<string, mixed> $data Event data.
	 */
	public static function push_to_user( int $uid, string $type, array $data ): void {
		$key     = self::QUEUE_PREFIX . $uid;
		$queue   = get_transient( $key );
		$queue   = is_array( $queue ) ? $queue : array();
		$queue[] = array(
			'type' => $type,
			'data' => $data,
		);
		set_transient( $key, $queue, self::QUEUE_TTL );
	}

	// -------------------------------------------------------------------------
	// Private helpers
	// -------------------------------------------------------------------------

	/**
	 * Atomically read and clear a user's event queue.
	 *
	 * @param int $uid User ID.
	 * @return array<int, array{type: string, data: array<string, mixed>}>
	 */
	private function dequeue( int $uid ): array {
		$key    = self::QUEUE_PREFIX . $uid;
		$events = get_transient( $key );
		if ( is_array( $events ) && ! empty( $events ) ) {
			delete_transient( $key );
			return $events;
		}
		return array();
	}

	/**
	 * Emit one SSE event.
	 *
	 * @param string               $type Event type.
	 * @param array<string, mixed> $data Event data.
	 */
	private function send( string $type, array $data ): void {
		$json = wp_json_encode( $data );
		if ( false !== $json ) {
			// Strip CR/LF from the event type to prevent SSE frame splitting.
			$safe_type = (string) preg_replace( '/[\r\n]/', '', $type );
			echo "event: $safe_type\ndata: $json\n\n"; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
		}
	}

	/**
	 * Flush output buffers to push events to the client immediately.
	 */
	private function flush(): void {
		// fastcgi_finish_request() would close the client connection — use flush() instead.
		if ( ob_get_level() ) {
			ob_flush();
		}
		flush();
	}
}
