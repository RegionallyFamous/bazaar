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
 * Handles .wp ware uploads via the REST API.
 *
 * POST /wp-json/bazaar/v1/wares
 *
 * Expects a multipart/form-data request with a `file` field containing the .wp archive.
 */
final class UploadController {

	private const NAMESPACE = 'bazaar/v1';

	private WareRegistry $registry;
	private WareLoader   $loader;

	public function __construct( WareRegistry $registry ) {
		$this->registry = $registry;
		$this->loader   = new WareLoader( $registry );
	}

	public function register_routes(): void {
		register_rest_route(
			self::NAMESPACE,
			'/wares',
			[
				'methods'             => WP_REST_Server::CREATABLE,
				'callback'            => [ $this, 'handle_upload' ],
				'permission_callback' => static fn() => current_user_can( 'manage_options' ),
			]
		);
	}

	/**
	 * Process an uploaded .wp file.
	 */
	public function handle_upload( WP_REST_Request $request ): WP_REST_Response|WP_Error {
		$files = $request->get_file_params();

		if ( empty( $files['file'] ) || ! is_array( $files['file'] ) ) {
			return new WP_Error(
				'no_file',
				esc_html__( 'No file was uploaded. Send the .wp file as a multipart field named "file".', 'bazaar' ),
				[ 'status' => 400 ]
			);
		}

		$file = $files['file'];

		if ( UPLOAD_ERR_OK !== $file['error'] ) {
			return new WP_Error(
				'upload_error',
				/* translators: %d: PHP upload error code */
				sprintf(
					esc_html__( 'Upload failed with error code %d.', 'bazaar' ),
					absint( $file['error'] )
				),
				[ 'status' => 400 ]
			);
		}

		$manifest = $this->loader->install(
			sanitize_text_field( $file['tmp_name'] ),
			sanitize_file_name( $file['name'] )
		);

		if ( is_wp_error( $manifest ) ) {
			$manifest->add_data( [ 'status' => 422 ] );
			return $manifest;
		}

		$registered = $this->registry->register( $manifest );
		if ( ! $registered ) {
			return new WP_Error(
				'registry_failed',
				esc_html__( 'Ware was installed but could not be added to the registry.', 'bazaar' ),
				[ 'status' => 500 ]
			);
		}

		$ware = $this->registry->get( $manifest['slug'] );

		return new WP_REST_Response(
			[
				'success' => true,
				'message' => sprintf(
					/* translators: %s: ware display name */
					esc_html__( '"%s" installed successfully.', 'bazaar' ),
					esc_html( $manifest['name'] )
				),
				'ware'    => $ware,
			],
			201
		);
	}
}
