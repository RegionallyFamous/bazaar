<?php
/**
 * Ware server — serves ware static files through an authenticated REST endpoint.
 *
 * @package Bazaar
 */

declare( strict_types=1 );

namespace Bazaar\REST;

defined( 'ABSPATH' ) || exit;

use Bazaar\WareRegistry;
use WP_Error;
use WP_REST_Request;
use WP_REST_Response;
use WP_REST_Server;

/**
 * Serves ware static files through an authenticated REST endpoint.
 *
 * GET /wp-json/bazaar/v1/serve/{slug}/{file}
 *
 * Requires the user to be logged in and to have the capability declared in the
 * ware's manifest. Uses realpath() confinement to prevent path traversal.
 */
final class WareServer {

	/** REST API namespace for all Bazaar routes. */
	private const NAMESPACE = 'bazaar/v1';

	/** MIME types served for common static asset extensions. */
	private const MIME_MAP = array(
		'html'  => 'text/html; charset=UTF-8',
		'htm'   => 'text/html; charset=UTF-8',
		'css'   => 'text/css',
		'js'    => 'application/javascript',
		'mjs'   => 'application/javascript',
		'json'  => 'application/json',
		'svg'   => 'image/svg+xml',
		'png'   => 'image/png',
		'jpg'   => 'image/jpeg',
		'jpeg'  => 'image/jpeg',
		'gif'   => 'image/gif',
		'webp'  => 'image/webp',
		'ico'   => 'image/x-icon',
		'woff'  => 'font/woff',
		'woff2' => 'font/woff2',
		'ttf'   => 'font/ttf',
		'otf'   => 'font/otf',
		'mp4'   => 'video/mp4',
		'webm'  => 'video/webm',
		'txt'   => 'text/plain; charset=UTF-8',
		'xml'   => 'application/xml',
		'pdf'   => 'application/pdf',
		'zip'   => 'application/zip',
	);

	/**
	 * Registry used to verify ware existence and permissions.
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
	 * Register the file-serve REST route.
	 */
	public function register_routes(): void {
		register_rest_route(
			self::NAMESPACE,
			'/serve/(?P<slug>[a-z0-9-]+)/(?P<file>.+)',
			array(
				'methods'             => WP_REST_Server::READABLE,
				'callback'            => array( $this, 'serve_file' ),
				'permission_callback' => array( $this, 'check_permission' ),
				'args'                => array(
					'slug' => array(
						'type'              => 'string',
						'required'          => true,
						'sanitize_callback' => 'sanitize_key',
					),
					'file' => array(
						'type'              => 'string',
						'required'          => true,
						'sanitize_callback' => static fn( string $v ) => ltrim( $v, '/' ),
						'validate_callback' => static fn( string $v ) => ! str_contains( $v, '..' ),
					),
				),
			)
		);
	}

	/**
	 * Permission callback: user must be logged in and have the ware's required capability.
	 *
	 * @param WP_REST_Request $request The incoming REST request.
	 */
	public function check_permission( WP_REST_Request $request ): bool|WP_Error {
		if ( ! is_user_logged_in() ) {
			return new WP_Error(
				'rest_forbidden',
				esc_html__( 'You must be logged in to access ware files.', 'bazaar' ),
				array( 'status' => 401 )
			);
		}

		$slug = sanitize_key( $request->get_param( 'slug' ) );
		$ware = $this->registry->get( $slug );

		if ( null === $ware ) {
			return new WP_Error(
				'ware_not_found',
				esc_html__( 'Ware not found.', 'bazaar' ),
				array( 'status' => 404 )
			);
		}

		if ( ! ( $ware['enabled'] ?? false ) ) {
			return new WP_Error(
				'ware_disabled',
				esc_html__( 'This ware is currently disabled.', 'bazaar' ),
				array( 'status' => 403 )
			);
		}

		$capability = $ware['menu']['capability'] ?? 'manage_options';
		if ( ! current_user_can( sanitize_key( $capability ) ) ) {
			return new WP_Error(
				'rest_forbidden',
				esc_html__( 'You do not have permission to access this ware.', 'bazaar' ),
				array( 'status' => 403 )
			);
		}

		return true;
	}

	/**
	 * Serve the requested file directly — bypasses the REST JSON response system.
	 *
	 * @param WP_REST_Request $request The incoming REST request.
	 */
	public function serve_file( WP_REST_Request $request ): WP_REST_Response|WP_Error {
		$slug      = sanitize_key( $request->get_param( 'slug' ) );
		$file_path = $request->get_param( 'file' );

		// Reject any remaining path traversal attempts.
		if ( str_contains( $file_path, '..' ) ) {
			return new WP_Error(
				'path_traversal',
				esc_html__( 'Invalid file path.', 'bazaar' ),
				array( 'status' => 400 )
			);
		}

		$ware_dir  = realpath( BAZAAR_WARES_DIR . $slug );
		$full_path = realpath( BAZAAR_WARES_DIR . $slug . '/' . $file_path );

		// Confine to the ware's own directory.
		if ( false === $ware_dir || false === $full_path ) {
			return new WP_Error(
				'file_not_found',
				esc_html__( 'File not found.', 'bazaar' ),
				array( 'status' => 404 )
			);
		}

		if ( ! str_starts_with( $full_path, $ware_dir . DIRECTORY_SEPARATOR ) ) {
			return new WP_Error(
				'path_traversal',
				esc_html__( 'Invalid file path.', 'bazaar' ),
				array( 'status' => 400 )
			);
		}

		if ( ! is_file( $full_path ) ) {
			return new WP_Error(
				'file_not_found',
				esc_html__( 'File not found.', 'bazaar' ),
				array( 'status' => 404 )
			);
		}

		$ext       = strtolower( pathinfo( $full_path, PATHINFO_EXTENSION ) );
		$mime_type = self::MIME_MAP[ $ext ] ?? 'application/octet-stream';
		$content   = file_get_contents( $full_path ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents

		if ( false === $content ) {
			return new WP_Error(
				'file_read_error',
				esc_html__( 'Could not read file.', 'bazaar' ),
				array( 'status' => 500 )
			);
		}

		// Output the file directly and exit — the REST framework would re-encode it.
		header( 'Content-Type: ' . $mime_type );
		header( 'Content-Length: ' . strlen( $content ) );
		header( 'Cache-Control: private, max-age=3600' );
		header( 'X-Content-Type-Options: nosniff' );

		// phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
		echo $content;
		exit;
	}
}
