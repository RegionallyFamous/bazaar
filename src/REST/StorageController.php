<?php
/**
 * Ware Storage API — server-backed key-value store per ware per user.
 *
 * Unlike localStorage, this store survives browser cache clears, is shared
 * across devices, and is tied to the WordPress user account.
 *
 * Storage backend: wp_usermeta — key pattern: bazaar_store_{slug}_{key}
 * (Meta values are JSON-encoded so any scalar / array can be stored.)
 *
 * Authorization model: any logged-in user may read and write their own storage.
 * Each operation is scoped to get_current_user_id() so one user can never
 * access another user's data.  Routes use require_login() (not manage_options)
 * because wares legitimately need storage for non-admin users.
 *
 * Routes
 * ──────
 *   GET    /bazaar/v1/store/{slug}         List all keys for this ware.
 *   GET    /bazaar/v1/store/{slug}/{key}   Read a value.
 *   PUT    /bazaar/v1/store/{slug}/{key}   Write a value.
 *   DELETE /bazaar/v1/store/{slug}/{key}   Delete a value.
 *   DELETE /bazaar/v1/store/{slug}         Delete all values for a ware.
 *
 * @package Bazaar
 */

declare( strict_types=1 );

namespace Bazaar\REST;

defined( 'ABSPATH' ) || exit;

use Bazaar\WareRegistry;
use WP_REST_Server;
use WP_REST_Request;
use WP_REST_Response;
use WP_Error;

/**
 * Per-user, per-ware key-value storage.
 */
final class StorageController extends BazaarController {

	/**
	 * WareRegistry instance for slug validation.
	 *
	 * @var WareRegistry
	 */
	private WareRegistry $registry;

	/**
	 * Constructor.
	 *
	 * @param WareRegistry $registry Registry used to confirm a ware slug exists before operating on its storage.
	 */
	public function __construct( WareRegistry $registry ) {
		$this->registry = $registry;
	}

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
	protected $rest_base = 'store';

	/** Maximum value size in bytes (1 MB). */
	private const MAX_VALUE_BYTES = 1024 * 1024;

	/** Maximum number of keys per ware per user. */
	private const MAX_KEYS = 256;

	/**
	 * Register all REST routes for this controller.
	 */
	public function register_routes(): void {
		$slug_arg = array(
			'required'          => true,
			'type'              => 'string',
			'sanitize_callback' => 'sanitize_key',
		);
		$key_arg  = array(
			'required'          => true,
			'type'              => 'string',
			'sanitize_callback' => 'sanitize_text_field',
		);

		register_rest_route(
			$this->namespace,
			"/{$this->rest_base}/(?P<slug>[a-z0-9-]+)",
			array(
				array(
					'methods'             => WP_REST_Server::READABLE,
					'callback'            => array( $this, 'list_keys' ),
					'permission_callback' => $this->require_login(),
				),
				array(
					'methods'             => WP_REST_Server::DELETABLE,
					'callback'            => array( $this, 'clear_all' ),
					'permission_callback' => $this->require_login(),
				),
			)
		);

		register_rest_route(
			$this->namespace,
			"/{$this->rest_base}/(?P<slug>[a-z0-9-]+)/(?P<key>[a-zA-Z0-9_.-]+)",
			array(
				array(
					'methods'             => WP_REST_Server::READABLE,
					'callback'            => array( $this, 'get_value' ),
					'permission_callback' => $this->require_login(),
				),
				array(
					'methods'             => 'PUT',
					'callback'            => array( $this, 'set_value' ),
					'permission_callback' => $this->require_login(),
					'args'                => array(
						'value' => array( 'required' => true ),
					),
				),
				array(
					'methods'             => WP_REST_Server::DELETABLE,
					'callback'            => array( $this, 'delete_value' ),
					'permission_callback' => $this->require_login(),
				),
			)
		);
	}

	// ─── Handlers ─────────────────────────────────────────────────────────

	/**
	 * List keys.
	 *
	 * @param WP_REST_Request $request Description.
	 * @return WP_REST_Response|WP_Error
	 */
	public function list_keys( WP_REST_Request $request ): WP_REST_Response|WP_Error {
		$slug = sanitize_key( $request->get_param( 'slug' ) );
		if ( null === $this->registry->get( $slug ) ) {
			return new WP_Error( 'not_found', __( 'Ware not found.', 'bazaar' ), array( 'status' => 404 ) );
		}
		$uid    = get_current_user_id();
		$prefix = $this->meta_prefix( $slug );
		$keys   = array();
		foreach ( $this->prefix_meta_keys( $uid, $prefix ) as $meta_key ) {
			$keys[] = substr( $meta_key, strlen( $prefix ) );
		}

		return new WP_REST_Response( $keys, 200 );
	}

	/**
	 * Get value.
	 *
	 * @param WP_REST_Request $request Description.
	 * @return WP_REST_Response|WP_Error
	 */
	public function get_value( WP_REST_Request $request ): WP_REST_Response|WP_Error {
		$slug = sanitize_key( $request->get_param( 'slug' ) );
		if ( null === $this->registry->get( $slug ) ) {
			return new WP_Error( 'not_found', __( 'Ware not found.', 'bazaar' ), array( 'status' => 404 ) );
		}
		$key = sanitize_text_field( $request->get_param( 'key' ) );
		$uid = get_current_user_id();
		$raw = get_user_meta( $uid, $this->meta_key( $slug, $key ), true );

		// An absent key is not an error — return null so callers can apply
		// their own defaults without catching a 404 on every first-time load.
		if ( '' === $raw || false === $raw ) {
			return new WP_REST_Response(
				array(
					'key'   => $key,
					'value' => null,
				),
				200
			);
		}

		$value = json_decode( (string) $raw, true );
		if ( json_last_error() !== JSON_ERROR_NONE ) {
			return new WP_Error(
				'decode_error',
				__( 'Stored value is corrupt and could not be decoded.', 'bazaar' ),
				array( 'status' => 500 )
			);
		}

		return new WP_REST_Response(
			array(
				'key'   => $key,
				'value' => $value,
			),
			200
		);
	}

	/**
	 * Set value.
	 *
	 * @param WP_REST_Request $request Description.
	 * @return WP_REST_Response|WP_Error
	 */
	public function set_value( WP_REST_Request $request ): WP_REST_Response|WP_Error {
		$slug = sanitize_key( $request->get_param( 'slug' ) );
		if ( null === $this->registry->get( $slug ) ) {
			return new WP_Error( 'not_found', __( 'Ware not found.', 'bazaar' ), array( 'status' => 404 ) );
		}
		$key   = sanitize_text_field( $request->get_param( 'key' ) );
		$value = $request->get_param( 'value' );
		$uid   = get_current_user_id();

		// Enforce key limit.
		$prefix = $this->meta_prefix( $slug );
		$count  = count( $this->prefix_meta_keys( $uid, $prefix ) );
		$meta   = $this->meta_key( $slug, $key );
		if ( $count >= self::MAX_KEYS && '' === get_user_meta( $uid, $meta, true ) ) {
			/* translators: %d: maximum number of storage keys allowed per ware */
			return new WP_Error( 'storage_full', sprintf( __( 'Maximum %d keys reached for this ware.', 'bazaar' ), self::MAX_KEYS ), array( 'status' => 422 ) );
		}

		$encoded = wp_json_encode( $value );
		if ( false === $encoded ) {
			return new WP_Error( 'encode_error', __( 'Value could not be JSON-encoded.', 'bazaar' ), array( 'status' => 422 ) );
		}
		if ( strlen( $encoded ) > self::MAX_VALUE_BYTES ) {
			return new WP_Error( 'too_large', __( 'Value exceeds 1 MB storage limit.', 'bazaar' ), array( 'status' => 413 ) );
		}

		$result = update_user_meta( $uid, $meta, $encoded );
		if ( false === $result ) {
			return new WP_Error( 'write_error', __( 'Could not save value to database.', 'bazaar' ), array( 'status' => 500 ) );
		}
		return new WP_REST_Response(
			array(
				'key'   => $key,
				'value' => $value,
			),
			200
		);
	}

	/**
	 * Delete value.
	 *
	 * @param WP_REST_Request $request Description.
	 * @return WP_REST_Response|WP_Error
	 */
	public function delete_value( WP_REST_Request $request ): WP_REST_Response|WP_Error {
		$slug = sanitize_key( $request->get_param( 'slug' ) );
		if ( null === $this->registry->get( $slug ) ) {
			return new WP_Error( 'not_found', __( 'Ware not found.', 'bazaar' ), array( 'status' => 404 ) );
		}
		$key = sanitize_text_field( $request->get_param( 'key' ) );
		delete_user_meta( get_current_user_id(), $this->meta_key( $slug, $key ) );
		return new WP_REST_Response( array( 'deleted' => true ), 200 );
	}

	/**
	 * Clear all.
	 *
	 * @param WP_REST_Request $request Description.
	 * @return WP_REST_Response|WP_Error
	 */
	public function clear_all( WP_REST_Request $request ): WP_REST_Response|WP_Error {
		$slug = sanitize_key( $request->get_param( 'slug' ) );
		if ( null === $this->registry->get( $slug ) ) {
			return new WP_Error( 'not_found', __( 'Ware not found.', 'bazaar' ), array( 'status' => 404 ) );
		}
		$uid    = get_current_user_id();
		$prefix = $this->meta_prefix( $slug );
		foreach ( $this->prefix_meta_keys( $uid, $prefix ) as $meta_key ) {
			delete_user_meta( $uid, $meta_key );
		}
		return new WP_REST_Response( array( 'cleared' => true ), 200 );
	}

	// ─── Helpers ──────────────────────────────────────────────────────────

	/**
	 * Fetch all usermeta keys for a user that share a given prefix.
	 *
	 * Uses a targeted SQL query against the usermeta index instead of loading
	 * the entire usermeta set into PHP and filtering there.
	 *
	 * @param int    $user_id     WordPress user ID.
	 * @param string $prefix      Meta-key prefix to filter on.
	 * @return string[]           Matching meta_key values (full, un-stripped).
	 */
	private function prefix_meta_keys( int $user_id, string $prefix ): array {
		global $wpdb;
		$like = $wpdb->esc_like( $prefix ) . '%';
		$rows = $wpdb->get_col(
			$wpdb->prepare(
				"SELECT meta_key FROM {$wpdb->usermeta} WHERE user_id = %d AND meta_key LIKE %s",
				$user_id,
				$like
			)
		);
		return is_array( $rows ) ? $rows : array();
	}

	/**
	 * Meta prefix.
	 *
	 * @param string $slug Description.
	 * @return string
	 */
	private function meta_prefix( string $slug ): string {
		return "bazaar_store_{$slug}_"; }
	/**
	 * Meta key.
	 *
	 * @param string $slug Description.
	 * @param string $key Description.
	 * @return string
	 */
	private function meta_key( string $slug, string $key ): string {
		return "bazaar_store_{$slug}_{$key}"; }
}
