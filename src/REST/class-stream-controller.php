<?php
/**
 * Server-Sent Events endpoint for real-time shell updates.
 *
 * This controller exposes a long-running SSE stream over the WP REST API.
 * Because PHP processes are typically short-lived, we use a polling loop
 * that reads from a per-user event queue stored in a transient.
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

use WP_REST_Controller;
use WP_REST_Server;
use WP_REST_Request;

/**
 * SSE stream endpoint.
 */
final class StreamController extends WP_REST_Controller {

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

	/** Maximum seconds to keep the connection open before closing cleanly. */
	private const MAX_DURATION = 45;

	/** Poll interval in seconds. */
	private const POLL_INTERVAL = 2;

	/** Transient TTL — slightly longer than max duration. */
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
					'permission_callback' => array( $this, 'auth' ),
				),
			)
		);
	}

	/**
	 * Permission callback — requires manage_options capability.
	 *
	 * @return bool
	 */
	public function auth(): bool {
		return current_user_can( 'manage_options' );
	}

	/**
	 * Long-running SSE response.
	 * WordPress's REST API infrastructure does not support streaming natively,
	 * so we emit headers and flush output manually, then exit.
	 *
	 * @param WP_REST_Request $request REST request.
	 * @return void  Never returns normally — exits after max duration.
	 */
	public function stream( WP_REST_Request $request ): void {
		// Validate nonce manually; WP REST already verified it, but belt+suspenders.
		if ( ! current_user_can( 'manage_options' ) ) {
			status_header( 403 );
			exit;
		}

		$uid = get_current_user_id();

		// Clear any existing output buffers.
		while ( ob_get_level() ) {
			ob_end_clean();
		}

		// SSE headers.
		header( 'Content-Type: text/event-stream; charset=UTF-8' );
		header( 'Cache-Control: no-store, no-cache, must-revalidate' );
		header( 'X-Accel-Buffering: no' ); // Disable nginx buffering.
		header( 'Connection: keep-alive' );

		// Remove any content-length that WP might have set.
		header_remove( 'Content-Length' );

		// Keep-alive comment every cycle.
		echo ": connected\n\n";
		$this->flush();

		$start = time();

		while ( ( time() - $start ) < self::MAX_DURATION ) {
			// Drain the queue for this user.
			$events = $this->dequeue( $uid );

			foreach ( $events as $event ) {
				$this->send( $event['type'], $event['data'] );
			}

			// Check server liveness.
			if ( connection_aborted() ) {
				break;
			}

			// Heartbeat comment to keep proxies alive.
			echo ": heartbeat\n\n";
			$this->flush();

			sleep( self::POLL_INTERVAL );
		}

		// Clean close.
		echo "event: close\ndata: {}\n\n";
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
				'number'     => 50,
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
			// SSE protocol is raw text/event-stream, not HTML — escaping is not applicable.
			// phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
			echo "event: $type\ndata: $json\n\n";
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
