<?php
/**
 * Ware configuration panel — manifest-declared settings API.
 *
 * Wares declare a settings schema in manifest.json:
 *
 *   "settings": [
 *     { "key": "api_key",    "type": "text",     "label": "API Key",        "required": true },
 *     { "key": "theme",      "type": "select",   "label": "Theme",          "options": ["light","dark"] },
 *     { "key": "max_items",  "type": "number",   "label": "Max Items",      "default": 25 },
 *     { "key": "enabled",    "type": "checkbox", "label": "Enable feature" },
 *     { "key": "notes",      "type": "textarea", "label": "Notes" }
 *   ]
 *
 * The shell renders a standard settings drawer from this schema — ware authors
 * get a fully functional settings UI with zero PHP code.
 *
 * Values are stored per-site (not per-user) in WP options:
 *   bazaar_config_{slug} → JSON object { key: value, … }
 *
 * Routes
 * ──────
 *   GET   /bazaar/v1/config/{slug}          Get all config values + schema.
 *   PATCH /bazaar/v1/config/{slug}          Update one or more config values.
 *   DELETE /bazaar/v1/config/{slug}/{key}   Reset a key to its default.
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
 * Serves and persists manifest-declared ware configuration.
 */
final class ConfigController extends BazaarController {

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
	protected $rest_base = 'config';

	/**
	 * Registry used to validate ware slugs.
	 *
	 * @var WareRegistry
	 */
	private WareRegistry $registry;

	/**
	 * Constructor.
	 *
	 * @param WareRegistry $registry Registry instance.
	 */
	public function __construct( WareRegistry $registry ) {
		$this->registry = $registry;
	}

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
					'callback'            => array( $this, 'get_config' ),
					'permission_callback' => $this->require_admin(),
				),
				array(
					'methods'             => 'PATCH',
					'callback'            => array( $this, 'update_config' ),
					'permission_callback' => $this->require_admin(),
					'args'                => array(
						'values' => array(
							'required' => true,
							'type'     => 'object',
						),
					),
				),
			)
		);

		register_rest_route(
			$this->namespace,
			"/{$this->rest_base}/(?P<slug>[a-z0-9-]+)/(?P<key>[a-zA-Z0-9_-]+)",
			array(
				array(
					'methods'             => WP_REST_Server::DELETABLE,
					'callback'            => array( $this, 'reset_key' ),
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
	 * GET /bazaar/v1/config/{slug}
	 * Returns the schema plus current values (with defaults filled in).
	 *
	 * @param WP_REST_Request $request REST request.
	 * @return WP_REST_Response|WP_Error
	 */
	public function get_config( WP_REST_Request $request ): WP_REST_Response|WP_Error {
		$slug = sanitize_key( $request->get_param( 'slug' ) );
		$ware = $this->registry->get( $slug );

		if ( null === $ware ) {
			return new WP_Error( 'not_found', __( 'Ware not found.', 'bazaar' ), array( 'status' => 404 ) );
		}

		$schema = is_array( $ware['settings'] ?? null ) ? $ware['settings'] : array();
		$stored = $this->load( $slug );
		$values = array();

		foreach ( $schema as $field ) {
			if ( ! is_array( $field ) ) {
				continue;
			}
			$key = $field['key'] ?? '';
			if ( '' === $key ) {
				continue;
			}
			$default        = $field['default'] ?? null;
			$values[ $key ] = array_key_exists( $key, $stored ) ? $stored[ $key ] : $default;
		}

		return new WP_REST_Response(
			array(
				'slug'   => $slug,
				'schema' => $schema,
				'values' => $values,
			),
			200
		);
	}

	/**
	 * PATCH /bazaar/v1/config/{slug}
	 * Merge-update config values; validates against schema types.
	 *
	 * @param WP_REST_Request $request REST request.
	 * @return WP_REST_Response|WP_Error
	 */
	public function update_config( WP_REST_Request $request ): WP_REST_Response|WP_Error {
		$slug = sanitize_key( $request->get_param( 'slug' ) );
		$ware = $this->registry->get( $slug );
		if ( null === $ware ) {
			return new WP_Error( 'not_found', __( 'Ware not found.', 'bazaar' ), array( 'status' => 404 ) );
		}

		$schema  = array_column( $ware['settings'] ?? array(), null, 'key' );
		$updates = (array) $request->get_param( 'values' );
		$stored  = $this->load( $slug );

		foreach ( $updates as $key => $val ) {
			$key = sanitize_text_field( (string) $key );
			if ( ! isset( $schema[ $key ] ) ) {
				/* translators: %s: config key name */
				return new WP_Error( 'unknown_key', sprintf( __( 'Unknown config key: %s', 'bazaar' ), $key ), array( 'status' => 422 ) );
			}
			$field = $schema[ $key ];
			$val   = $this->coerce( $val, $field['type'] ?? 'text' );

			// Validate options enum.
			if ( ! empty( $field['options'] ) && ! in_array( $val, (array) $field['options'], true ) ) {
				/* translators: %s: config key name */
				return new WP_Error( 'invalid_option', sprintf( __( 'Invalid value for "%s".', 'bazaar' ), $key ), array( 'status' => 422 ) );
			}
			$stored[ $key ] = $val;
		}

		$this->save( $slug, $stored );
		return new WP_REST_Response( array( 'values' => $stored ), 200 );
	}

	/**
	 * DELETE /bazaar/v1/config/{slug}/{key}
	 * Reset a key to its manifest default.
	 *
	 * @param WP_REST_Request $request REST request.
	 * @return WP_REST_Response
	 */
	public function reset_key( WP_REST_Request $request ): WP_REST_Response|WP_Error {
		$slug = sanitize_key( $request->get_param( 'slug' ) );
		$ware = $this->registry->get( $slug );
		if ( null === $ware ) {
			return new WP_Error(
				'not_found',
				esc_html__( 'Ware not found.', 'bazaar' ),
				array( 'status' => 404 )
			);
		}
		$key    = sanitize_text_field( $request->get_param( 'key' ) );
		$stored = $this->load( $slug );
		unset( $stored[ $key ] );
		$this->save( $slug, $stored );
		return new WP_REST_Response(
			array(
				'reset' => true,
				'key'   => $key,
			),
			200
		);
	}

	// ─── Helpers ──────────────────────────────────────────────────────────

	/**
	 * Load the persisted config for a ware.
	 *
	 * @param string $slug Ware slug.
	 * @return array<string, mixed>
	 */
	private function load( string $slug ): array {
		$raw = get_option( "bazaar_config_{$slug}", '{}' );
		$dec = json_decode( (string) $raw, true );
		return is_array( $dec ) ? $dec : array();
	}

	/**
	 * Persist the config for a ware.
	 *
	 * @param string               $slug Ware slug.
	 * @param array<string, mixed> $data Config data to store.
	 */
	private function save( string $slug, array $data ): void {
		$enc = wp_json_encode( $data );
		if ( false !== $enc ) {
			update_option( "bazaar_config_{$slug}", $enc, false );
		}
	}

	/**
	 * Cast a raw value to the expected schema type.
	 *
	 * @param mixed  $val  The raw input value.
	 * @param string $type Target type: 'number', 'checkbox', or 'text' (default).
	 * @return mixed
	 */
	private function coerce( mixed $val, string $type ): mixed {
		return match ( $type ) {
			'number'   => is_numeric( $val ) ? (float) $val : 0,
			'checkbox' => (bool) $val,
			'textarea' => sanitize_textarea_field( (string) $val ),
			default    => sanitize_text_field( (string) $val ),
		};
	}
}
