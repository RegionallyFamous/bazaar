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

use WP_REST_Controller;
use WP_REST_Server;
use WP_REST_Request;
use WP_REST_Response;
use WP_Error;

/**
 * Per-user, per-ware key-value storage.
 */
final class StorageController extends WP_REST_Controller {

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
					'permission_callback' => array( $this, 'auth' ),
				),
				array(
					'methods'             => WP_REST_Server::DELETABLE,
					'callback'            => array( $this, 'clear_all' ),
					'permission_callback' => array( $this, 'auth' ),
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
					'permission_callback' => array( $this, 'auth' ),
				),
				array(
					'methods'             => 'PUT',
					'callback'            => array( $this, 'set_value' ),
					'permission_callback' => array( $this, 'auth' ),
					'args'                => array(
						'value' => array( 'required' => true ),
					),
				),
				array(
					'methods'             => WP_REST_Server::DELETABLE,
					'callback'            => array( $this, 'delete_value' ),
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
		return is_user_logged_in(); }

	// ─── Handlers ─────────────────────────────────────────────────────────

	/**
	 * List keys.
	 *
	 * @param WP_REST_Request $request Description.
	 * @return WP_REST_Response
	 */
	public function list_keys( WP_REST_Request $request ): WP_REST_Response {
		$slug   = sanitize_key( $request->get_param( 'slug' ) );
		$uid    = get_current_user_id();
		$prefix = $this->meta_prefix( $slug );

		$all_meta = get_user_meta( $uid );
		$keys     = array();
		foreach ( $all_meta as $meta_key => $_ ) {
			if ( str_starts_with( $meta_key, $prefix ) ) {
				$keys[] = substr( $meta_key, strlen( $prefix ) );
			}
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
		$key  = sanitize_text_field( $request->get_param( 'key' ) );
		$uid  = get_current_user_id();
		$raw  = get_user_meta( $uid, $this->meta_key( $slug, $key ), true );

		if ( '' === $raw || false === $raw ) {
			return new WP_Error( 'not_found', __( 'Key not found.', 'bazaar' ), array( 'status' => 404 ) );
		}

		$value = json_decode( (string) $raw, true );
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
		$slug  = sanitize_key( $request->get_param( 'slug' ) );
		$key   = sanitize_text_field( $request->get_param( 'key' ) );
		$value = $request->get_param( 'value' );
		$uid   = get_current_user_id();

		// Enforce key limit.
		$prefix = $this->meta_prefix( $slug );
		$count  = count( array_filter( array_keys( get_user_meta( $uid ) ), fn( $k ) => str_starts_with( (string) $k, $prefix ) ) );
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

		update_user_meta( $uid, $meta, $encoded );
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
	 * @return WP_REST_Response
	 */
	public function delete_value( WP_REST_Request $request ): WP_REST_Response {
		$slug = sanitize_key( $request->get_param( 'slug' ) );
		$key  = sanitize_text_field( $request->get_param( 'key' ) );
		delete_user_meta( get_current_user_id(), $this->meta_key( $slug, $key ) );
		return new WP_REST_Response( array( 'deleted' => true ), 200 );
	}

	/**
	 * Clear all.
	 *
	 * @param WP_REST_Request $request Description.
	 * @return WP_REST_Response
	 */
	public function clear_all( WP_REST_Request $request ): WP_REST_Response {
		$slug   = sanitize_key( $request->get_param( 'slug' ) );
		$uid    = get_current_user_id();
		$prefix = $this->meta_prefix( $slug );
		foreach ( array_keys( get_user_meta( $uid ) ) as $meta_key ) {
			$meta_key = (string) $meta_key;
			if ( str_starts_with( $meta_key, $prefix ) ) {
				delete_user_meta( $uid, $meta_key );
			}
		}
		return new WP_REST_Response( array( 'cleared' => true ), 200 );
	}

	// ─── Helpers ──────────────────────────────────────────────────────────

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
