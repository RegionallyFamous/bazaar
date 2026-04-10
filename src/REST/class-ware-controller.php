<?php

declare( strict_types=1 );

namespace Bazaar\REST;

defined( 'ABSPATH' ) || exit;

use Bazaar\WareLoader;
use Bazaar\WareRegistry;
use WP_Error;
use WP_REST_Request;
use WP_REST_Response;
use WP_REST_Server;

/**
 * Manages installed wares (enable/disable/delete) via the REST API.
 *
 * PATCH  /wp-json/bazaar/v1/wares/{slug}  — toggle enabled state
 * DELETE /wp-json/bazaar/v1/wares/{slug}  — unregister + delete files
 */
final class WareController {

	private const NAMESPACE = 'bazaar/v1';

	private WareRegistry $registry;
	private WareLoader $loader;

	public function __construct( WareRegistry $registry ) {
		$this->registry = $registry;
		$this->loader   = new WareLoader( $registry );
	}

	public function register_routes(): void {
		register_rest_route(
			self::NAMESPACE,
			'/wares/(?P<slug>[a-z0-9-]+)',
			[
				[
					'methods'             => 'PATCH',
					'callback'            => [ $this, 'toggle' ],
					'permission_callback' => static fn() => current_user_can( 'manage_options' ),
					'args'                => [
						'slug'    => [
							'type'              => 'string',
							'required'          => true,
							'sanitize_callback' => 'sanitize_key',
						],
						'enabled' => [
							'type'     => 'boolean',
							'required' => true,
						],
					],
				],
				[
					'methods'             => WP_REST_Server::DELETABLE,
					'callback'            => [ $this, 'delete' ],
					'permission_callback' => static fn() => current_user_can( 'manage_options' ),
					'args'                => [
						'slug' => [
							'type'              => 'string',
							'required'          => true,
							'sanitize_callback' => 'sanitize_key',
						],
					],
				],
			]
		);
	}

	/**
	 * Enable or disable a ware.
	 */
	public function toggle( WP_REST_Request $request ): WP_REST_Response|WP_Error {
		$slug    = sanitize_key( $request->get_param( 'slug' ) );
		$enabled = (bool) $request->get_param( 'enabled' );

		if ( null === $this->registry->get( $slug ) ) {
			return new WP_Error(
				'ware_not_found',
				esc_html__( 'Ware not found.', 'bazaar' ),
				[ 'status' => 404 ]
			);
		}

		$result = $enabled
			? $this->registry->enable( $slug )
			: $this->registry->disable( $slug );

		if ( ! $result ) {
			return new WP_Error(
				'toggle_failed',
				esc_html__( 'Could not update ware status.', 'bazaar' ),
				[ 'status' => 500 ]
			);
		}

		return new WP_REST_Response(
			[
				'success' => true,
				'slug'    => $slug,
				'enabled' => $enabled,
				'message' => $enabled
					/* translators: %s: ware slug */
					? sprintf( esc_html__( '"%s" enabled.', 'bazaar' ), esc_html( $slug ) )
					/* translators: %s: ware slug */
					: sprintf( esc_html__( '"%s" disabled.', 'bazaar' ), esc_html( $slug ) ),
			],
			200
		);
	}

	/**
	 * Delete a ware — removes files from disk and unregisters it.
	 */
	public function delete( WP_REST_Request $request ): WP_REST_Response|WP_Error {
		$slug = sanitize_key( $request->get_param( 'slug' ) );

		if ( null === $this->registry->get( $slug ) ) {
			return new WP_Error(
				'ware_not_found',
				esc_html__( 'Ware not found.', 'bazaar' ),
				[ 'status' => 404 ]
			);
		}

		$deleted = $this->loader->delete( $slug );
		if ( is_wp_error( $deleted ) ) {
			$deleted->add_data( [ 'status' => 500 ] );
			return $deleted;
		}

		$this->registry->unregister( $slug );

		return new WP_REST_Response(
			[
				'success' => true,
				'slug'    => $slug,
				/* translators: %s: ware slug */
				'message' => sprintf( esc_html__( '"%s" deleted successfully.', 'bazaar' ), esc_html( $slug ) ),
			],
			200
		);
	}
}
