<?php
/**
 * Ware Webhooks — outbound POST on bus events.
 *
 * Wares can register webhook destinations:
 *   "on event X, POST the payload to https://example.com/hook"
 *
 * The shell-side `bzr.webhook(event, url)` JS helper registers a webhook
 * (via this REST API). When the event bus broadcasts the named event, the
 * WP-Cron–dispatched hook fires an outbound HTTP POST.
 *
 * Routes
 * ──────
 *   GET    /bazaar/v1/webhooks/{slug}       List webhooks for a ware.
 *   POST   /bazaar/v1/webhooks/{slug}       Register a new webhook.
 *   DELETE /bazaar/v1/webhooks/{slug}/{id}  Remove a webhook.
 *
 * Storage: site option `bazaar_webhooks` — JSON array of webhook objects.
 *
 * @package Bazaar
 */

declare( strict_types=1 );

namespace Bazaar\REST;

defined( 'ABSPATH' ) || exit;

use WP_REST_Controller;
use WP_REST_Server;
use WP_REST_Request;
use WP_REST_Response;
use WP_Error;

/**
 * Webhook registration and management.
 */
final class WebhooksController extends WP_REST_Controller {

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
	protected $rest_base = 'webhooks';

	/** Maximum webhooks per ware. */
	private const MAX_PER_WARE = 20;

	/**
	 * Register all REST routes for this controller.
	 */
	public function register_routes(): void {
		register_rest_route(
			$this->namespace,
			"/{$this->rest_base}/(?P<slug>[a-z0-9-]+)",
			array(
				array(
					'methods'             => WP_REST_Server::READABLE,
					'callback'            => array( $this, 'list_webhooks' ),
					'permission_callback' => array( $this, 'auth' ),
				),
				array(
					'methods'             => WP_REST_Server::CREATABLE,
					'callback'            => array( $this, 'create_webhook' ),
					'permission_callback' => array( $this, 'auth' ),
					'args'                => array(
						'event'  => array(
							'required'          => true,
							'type'              => 'string',
							'sanitize_callback' => 'sanitize_text_field',
						),
						'url'    => array(
							'required'          => true,
							'type'              => 'string',
							'sanitize_callback' => 'esc_url_raw',
							'format'            => 'uri',
						),
						'secret' => array(
							'required'          => false,
							'type'              => 'string',
							'sanitize_callback' => 'sanitize_text_field',
						),
					),
				),
			)
		);

		register_rest_route(
			$this->namespace,
			"/{$this->rest_base}/(?P<slug>[a-z0-9-]+)/(?P<id>[a-f0-9-]+)",
			array(
				array(
					'methods'             => WP_REST_Server::DELETABLE,
					'callback'            => array( $this, 'delete_webhook' ),
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
		return current_user_can( 'manage_options' ); }

	// ─── Handlers ─────────────────────────────────────────────────────────

	/**
	 * List webhooks.
	 *
	 * @param WP_REST_Request $request Description.
	 * @return WP_REST_Response
	 */
	public function list_webhooks( WP_REST_Request $request ): WP_REST_Response {
		$slug = sanitize_key( $request->get_param( 'slug' ) );
		$all  = $this->load_all();
		return new WP_REST_Response( array_values( array_filter( $all, fn( $w ) => $w['slug'] === $slug ) ), 200 );
	}

	/**
	 * Create webhook.
	 *
	 * @param WP_REST_Request $request Description.
	 * @return WP_REST_Response|WP_Error
	 */
	public function create_webhook( WP_REST_Request $request ): WP_REST_Response|WP_Error {
		$slug  = sanitize_key( $request->get_param( 'slug' ) );
		$event = sanitize_text_field( $request->get_param( 'event' ) );
		$url   = esc_url_raw( $request->get_param( 'url' ) );
		$sec   = sanitize_text_field( $request->get_param( 'secret' ) ?? '' );

		// Validate URL scheme.
		if ( ! in_array( wp_parse_url( $url, PHP_URL_SCHEME ), array( 'http', 'https' ), true ) ) {
			return new WP_Error( 'bad_url', __( 'Webhook URL must use http or https.', 'bazaar' ), array( 'status' => 422 ) );
		}

		$all   = $this->load_all();
		$count = count( array_filter( $all, fn( $w ) => $w['slug'] === $slug ) );
		if ( $count >= self::MAX_PER_WARE ) {
			/* translators: %d: maximum number of webhooks allowed per ware */
			return new WP_Error( 'limit', sprintf( __( 'Maximum %d webhooks per ware.', 'bazaar' ), self::MAX_PER_WARE ), array( 'status' => 422 ) );
		}

		$entry = array(
			'id'         => wp_generate_uuid4(),
			'slug'       => $slug,
			'event'      => $event,
			'url'        => $url,
			'secret'     => $sec,
			'created_at' => time(),
		);

		$all[] = $entry;
		$this->save_all( $all );
		return new WP_REST_Response( $entry, 201 );
	}

	/**
	 * Delete webhook.
	 *
	 * @param WP_REST_Request $request Description.
	 * @return WP_REST_Response|WP_Error
	 */
	public function delete_webhook( WP_REST_Request $request ): WP_REST_Response|WP_Error {
		$slug = sanitize_key( $request->get_param( 'slug' ) );
		$id   = sanitize_text_field( $request->get_param( 'id' ) );
		$all  = $this->load_all();

		$new = array_values( array_filter( $all, fn( $w ) => ! ( $w['slug'] === $slug && $w['id'] === $id ) ) );
		if ( count( $new ) === count( $all ) ) {
			return new WP_Error( 'not_found', __( 'Webhook not found.', 'bazaar' ), array( 'status' => 404 ) );
		}
		$this->save_all( $new );
		return new WP_REST_Response( array( 'deleted' => true ), 200 );
	}

	// ─── Helpers ──────────────────────────────────────────────────────────

	/**
	 * Load all persisted webhooks from options.
	 *
	 * @return array<int, array<string, mixed>>
	 */
	private function load_all(): array {
		$raw = get_option( 'bazaar_webhooks', '[]' );
		$dec = json_decode( (string) $raw, true );
		return is_array( $dec ) ? $dec : array();
	}

	/**
	 * Persist the full webhook list to options.
	 *
	 * @param array<int, array<string, mixed>> $data Webhook list to save.
	 */
	private function save_all( array $data ): void {
		$enc = wp_json_encode( $data );
		if ( false !== $enc ) {
			update_option( 'bazaar_webhooks', $enc, false );
		}
	}

	// ─── Outbound dispatch (called from WP-Cron) ──────────────────────────

	/**
	 * Fire registered webhooks matching the event + ware slug.
	 *
	 * @param string $event Event name (e.g. 'ware.installed').
	 * @param mixed  $data  Arbitrary event payload (JSON-serialised).
	 * @param string $from  Slug of the ware that emitted the event.
	 */
	public static function dispatch( string $event, mixed $data, string $from ): void {
		$all   = json_decode( (string) get_option( 'bazaar_webhooks', '[]' ), true );
		$hooks = array_filter( (array) $all, fn( $w ) => $w['slug'] === $from && $w['event'] === $event );

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
}
