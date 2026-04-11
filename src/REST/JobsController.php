<?php
/**
 * Background Jobs API — manifest-declared WP-Cron tasks.
 *
 * Wares declare recurring jobs in manifest.json:
 *
 *   "jobs": [
 *     {
 *       "id":       "sync_products",
 *       "label":    "Sync products from API",
 *       "interval": "hourly",
 *       "endpoint": "/wp-json/bazaar/v1/jobs/my-ware/sync_products"
 *     }
 *   ]
 *
 * On ware install, Bazaar registers WP-Cron events for each declared job.
 * The client-side `bzr.scheduleJob(id, callback)` registers a handler; but
 * since cron runs server-side, the callback is a REST endpoint on the ware
 * server (or a WP AJAX action if the ware is WordPress-native).
 *
 * Routes
 * ──────
 *   GET  /bazaar/v1/jobs/{slug}          List jobs for a ware.
 *   POST /bazaar/v1/jobs/{slug}/{job_id} Manually trigger a job (admin).
 *
 * @package Bazaar
 */

declare( strict_types=1 );

namespace Bazaar\REST;

defined( 'ABSPATH' ) || exit;

use Bazaar\WareRegistry;
use Bazaar\REST\AuditController;
use WP_REST_Server;
use WP_REST_Request;
use WP_REST_Response;
use WP_Error;

/**
 * Manages manifest-declared background jobs.
 */
final class JobsController extends BazaarController {

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
	protected $rest_base = 'jobs';

	/**
	 * WareRegistry instance.
	 *
	 * @var WareRegistry
	 */
	private WareRegistry $registry;

	/**
	 * Constructor.
	 *
	 * @param WareRegistry $registry Description.
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
				'methods'             => WP_REST_Server::READABLE,
				'callback'            => array( $this, 'list_jobs' ),
				'permission_callback' => $this->require_admin(),
			)
		);

		register_rest_route(
			$this->namespace,
			"/{$this->rest_base}/(?P<slug>[a-z0-9-]+)/(?P<job_id>[a-zA-Z0-9_-]+)",
			array(
				'methods'             => WP_REST_Server::CREATABLE,
				'callback'            => array( $this, 'trigger_job' ),
				'permission_callback' => $this->require_admin(),
			)
		);
	}

	/**
	 * List jobs.
	 *
	 * @param WP_REST_Request $request Description.
	 * @return WP_REST_Response|WP_Error
	 */
	public function list_jobs( WP_REST_Request $request ): WP_REST_Response|WP_Error {
		$slug = sanitize_key( $request->get_param( 'slug' ) );
		$ware = $this->registry->get( $slug );
		if ( null === $ware ) {
			return new WP_Error( 'not_found', __( 'Ware not found.', 'bazaar' ), array( 'status' => 404 ) );
		}

		$jobs = array();
		foreach ( (array) ( $ware['jobs'] ?? array() ) as $job ) {
			if ( ! is_array( $job ) || empty( $job['id'] ) ) {
				continue;
			}
			$hook     = $this->cron_hook( $slug, $job['id'] );
			$next_run = wp_next_scheduled( $hook );
			$jobs[]   = array_merge( $job, array( 'next_run' => $next_run ? gmdate( 'c', $next_run ) : null ) );
		}
		return new WP_REST_Response( $jobs, 200 );
	}

	/**
	 * Trigger job.
	 *
	 * @param WP_REST_Request $request Description.
	 * @return WP_REST_Response|WP_Error
	 */
	public function trigger_job( WP_REST_Request $request ): WP_REST_Response|WP_Error {
		$slug   = sanitize_key( $request->get_param( 'slug' ) );
		$job_id = sanitize_key( $request->get_param( 'job_id' ) );
		$ware   = $this->registry->get( $slug );

		if ( null === $ware ) {
			return new WP_Error( 'not_found', __( 'Ware not found.', 'bazaar' ), array( 'status' => 404 ) );
		}

		$jobs = array_column( (array) ( $ware['jobs'] ?? array() ), null, 'id' );
		if ( ! isset( $jobs[ $job_id ] ) ) {
			return new WP_Error( 'no_job', __( 'Job not declared in manifest.', 'bazaar' ), array( 'status' => 404 ) );
		}

		do_action( $this->cron_hook( $slug, $job_id ) );
		\Bazaar\AuditLog::record(
			$slug,
			'job_ran',
			array(
				'job_id'    => $job_id,
				'triggered' => 'manual',
			)
		);
		return new WP_REST_Response(
			array(
				'triggered' => true,
				'job_id'    => $job_id,
			),
			200
		);
	}

	// ─── Registration helpers ─────────────────────────────────────────────

	/**
	 * Register WP-Cron events for all jobs declared in a ware's manifest.
	 * Call this on ware install.
	 *
	 * @param array<string,mixed> $ware Ware index entry.
	 */
	public static function register_ware_jobs( array $ware ): void {
		foreach ( (array) ( $ware['jobs'] ?? array() ) as $job ) {
			if ( ! is_array( $job ) || '' === (string) ( $job['id'] ?? '' ) ) {
				continue; // Skip malformed job entries that lack a required id.
			}
			$hook     = self::static_hook( $ware['slug'], $job['id'] );
			$interval = sanitize_text_field( $job['interval'] ?? 'hourly' );

			if ( ! wp_next_scheduled( $hook ) ) {
				wp_schedule_event( time() + 60, $interval, $hook );
			}

			// When the cron fires, call the ware's declared endpoint.
			add_action(
				$hook,
				static function () use ( $ware, $job ) {
					self::run_job( $ware, $job );
				}
			);
		}
	}

	/**
	 * Deregister all cron events for a ware (on uninstall).
	 *
	 * @param string                          $slug Description.
	 * @param array<int, array<string,mixed>> $jobs Description.
	 */
	public static function deregister_ware_jobs( string $slug, array $jobs ): void {
		foreach ( $jobs as $job ) {
			if ( ! is_array( $job ) || '' === (string) ( $job['id'] ?? '' ) ) {
				continue;
			}
			$hook = self::static_hook( $slug, $job['id'] );
			wp_unschedule_hook( $hook );
		}
	}

	/**
	 * Execute a single job by calling its declared endpoint.
	 *
	 * @param array<string,mixed> $ware Description.
	 * @param array<string,mixed> $job Description.
	 */
	private static function run_job( array $ware, array $job ): void {
		if ( empty( $job['endpoint'] ) ) {
			return;
		}

		$url      = $job['endpoint'];
		$response = wp_remote_post(
			$url,
			array(
				'timeout'   => 30,
				'sslverify' => true,
			)
		);
		$ok       = ! is_wp_error( $response ) && wp_remote_retrieve_response_code( $response ) < 400;

		\Bazaar\AuditLog::record(
			$ware['slug'],
			'job_ran',
			array(
				'job_id'  => $job['id'],
				'success' => $ok,
				'status'  => is_wp_error( $response ) ? 0 : (int) wp_remote_retrieve_response_code( $response ),
			)
		);
	}

	/**
	 * Build the WP-Cron hook name for a job.
	 *
	 * @param string $slug   Ware slug.
	 * @param string $job_id Job identifier.
	 * @return non-empty-string
	 */
	private function cron_hook( string $slug, string $job_id ): string {
		return "bazaar_job_{$slug}_{$job_id}"; }
	/**
	 * Build the WP-Cron hook name for a job (static variant).
	 *
	 * @param string $slug   Ware slug.
	 * @param string $job_id Job identifier.
	 * @return non-empty-string
	 */
	private static function static_hook( string $slug, string $job_id ): string {
		return "bazaar_job_{$slug}_{$job_id}"; }
}
