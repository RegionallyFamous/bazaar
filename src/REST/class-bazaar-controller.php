<?php
/**
 * Bazaar REST base controller.
 *
 * Provides shared permission callbacks so every subclass gets the same
 * auth vocabulary without copy-pasting a method.
 *
 * Usage:
 *   'permission_callback' => $this->require_admin()
 *   'permission_callback' => $this->require_login()
 *
 * Why callbacks instead of direct `bool` returns?  register_rest_route()
 * accepts a callable, so returning a closure lets each route declare its
 * own requirement inline while still sharing the implementation.
 *
 * @package Bazaar
 */

declare( strict_types=1 );

namespace Bazaar\REST;

defined( 'ABSPATH' ) || exit;

use WP_REST_Controller;

/**
 * Base class for all Bazaar REST controllers.
 */
abstract class BazaarController extends WP_REST_Controller {

	/**
	 * REST namespace shared by all Bazaar endpoints.
	 *
	 * @var string
	 */
	protected string $namespace = 'bazaar/v1';

	/**
	 * Permission callback: user must be logged in.
	 * Use for endpoints that read data scoped to the current user (storage, health, badges…).
	 */
	protected function require_login(): \Closure {
		return static fn() => is_user_logged_in();
	}

	/**
	 * Permission callback: user must hold manage_options.
	 * Use for all write operations and any endpoint that exposes site-wide data.
	 */
	protected function require_admin(): \Closure {
		return static fn() => current_user_can( 'manage_options' );
	}
}
