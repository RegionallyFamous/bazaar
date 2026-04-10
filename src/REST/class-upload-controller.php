<?php
/**
 * Upload controller — handles .wp ware file uploads via REST.
 *
 * @package Bazaar
 */

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

	/** REST API namespace for all Bazaar routes. */
	private const NAMESPACE = 'bazaar/v1';

	/**
	 * Registry used to store the installed ware.
	 *
	 * @var WareRegistry
	 */
	private WareRegistry $registry;

	/**
	 * Loader used to validate and extract the archive.
	 *
	 * @var WareLoader
	 */
	private WareLoader $loader;

	/**
	 * Constructor.
	 *
	 * @param WareRegistry $registry Registry instance.
	 */
	public function __construct( WareRegistry $registry ) {
		$this->registry = $registry;
		$this->loader   = new WareLoader( $registry );
	}

	/**
	 * Register the upload REST route.
	 *
	 * No `args` are declared because this endpoint receives multipart/form-data
	 * (a file upload), not a JSON body. The file is validated manually inside
	 * handle_upload() via PHP's $_FILES / get_file_params() API.
	 */
	public function register_routes(): void {
		register_rest_route(
			self::NAMESPACE,
			'/wares',
			array(
				'methods'             => WP_REST_Server::CREATABLE,
				'callback'            => array( $this, 'handle_upload' ),
				'permission_callback' => $this->require_admin(),
			)
		);
	}

	/**
	 * Process an uploaded .wp file.
	 *
	 * @param WP_REST_Request $request The incoming REST request.
	 */
	public function handle_upload( WP_REST_Request $request ): WP_REST_Response|WP_Error {
		$files = $request->get_file_params();

		if ( empty( $files['file'] ) || ! is_array( $files['file'] ) ) {
			return new WP_Error(
				'no_file',
				esc_html__( 'No file was uploaded. Send the .wp file as a multipart field named "file".', 'bazaar' ),
				array( 'status' => 400 )
			);
		}

		$file = $files['file'];

		if ( UPLOAD_ERR_OK !== $file['error'] ) {
			return new WP_Error(
				'upload_error',
				sprintf(
					/* translators: %d: PHP upload error code */
					esc_html__( 'Upload failed with error code %d.', 'bazaar' ),
					absint( $file['error'] )
				),
				array( 'status' => 400 )
			);
		}

		// tmp_name is set by PHP's upload handling — it is a server-side temp
		// path, not user input. sanitize_text_field() strips characters that
		// are valid in filesystem paths, so we validate the path instead.
		$tmp_name = realpath( (string) $file['tmp_name'] );
		if ( false === $tmp_name || ! is_uploaded_file( $tmp_name ) ) {
			return new WP_Error(
				'invalid_upload',
				esc_html__( 'Invalid uploaded file.', 'bazaar' ),
				array( 'status' => 400 )
			);
		}

		$manifest = $this->loader->install(
			$tmp_name,
			sanitize_file_name( $file['name'] )
		);

		if ( is_wp_error( $manifest ) ) {
			$manifest->add_data( array( 'status' => 422 ) );
			return $manifest;
		}

		$registered = $this->registry->register( $manifest );
		if ( ! $registered ) {
			return new WP_Error(
				'registry_failed',
				esc_html__( 'Ware was installed but could not be added to the registry.', 'bazaar' ),
				array( 'status' => 500 )
			);
		}

		$ware = $this->registry->get( $manifest['slug'] );

		return new WP_REST_Response(
			array(
				'success' => true,
				'message' => sprintf(
					/* translators: %s: ware display name */
					esc_html__( '"%s" installed successfully.', 'bazaar' ),
					esc_html( $manifest['name'] )
				),
				'ware'    => $ware,
			),
			201
		);
	}
}
