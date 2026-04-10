<?php
/**
 * PHPUnit bootstrap — sets up Brain Monkey and defines WordPress stubs
 * so unit tests run without a full WordPress installation.
 */

declare( strict_types=1 );

require_once dirname( __DIR__, 2 ) . '/vendor/autoload.php';

if ( ! class_exists( 'WP_Error' ) ) {
	/**
	 * Minimal WP_Error stub for unit tests.
	 */
	class WP_Error { // phpcs:ignore
		/** @var string */
		private string $code;
		/** @var string */
		private string $message;
		/** @var mixed */
		private mixed $data = null;

		/**
		 * @param string $code    Error code.
		 * @param string $message Error message.
		 * @param mixed  $data    Optional extra data.
		 */
		public function __construct( string $code = '', string $message = '', mixed $data = '' ) {
			$this->code    = $code;
			$this->message = $message;
			$this->data    = $data;
		}

		/** @return string */
		public function get_error_code(): string { return $this->code; }

		/** @return string */
		public function get_error_message(): string { return $this->message; }

		/** @param mixed $data Extra data to attach. */
		public function add_data( mixed $data ): void { $this->data = $data; }
	}
}

// Define constants that the plugin expects to be in place.
if ( ! defined( 'ABSPATH' ) ) {
	define( 'ABSPATH', sys_get_temp_dir() . '/' );
}
if ( ! defined( 'WP_CONTENT_DIR' ) ) {
	define( 'WP_CONTENT_DIR', sys_get_temp_dir() );
}
if ( ! defined( 'BAZAAR_VERSION' ) ) {
	define( 'BAZAAR_VERSION', '1.0.0' );
}
if ( ! defined( 'BAZAAR_FILE' ) ) {
	define( 'BAZAAR_FILE', dirname( __DIR__, 2 ) . '/bazaar.php' );
}
if ( ! defined( 'BAZAAR_DIR' ) ) {
	define( 'BAZAAR_DIR', dirname( __DIR__, 2 ) . '/' );
}
if ( ! defined( 'BAZAAR_URL' ) ) {
	define( 'BAZAAR_URL', 'http://example.com/wp-content/plugins/bazaar/' );
}
if ( ! defined( 'BAZAAR_SLUG' ) ) {
	define( 'BAZAAR_SLUG', 'bazaar' );
}
if ( ! defined( 'BAZAAR_WARES_DIR' ) ) {
	define( 'BAZAAR_WARES_DIR', sys_get_temp_dir() . '/bazaar/' );
}
if ( ! defined( 'BAZAAR_MAX_UNCOMPRESSED_SIZE' ) ) {
	define( 'BAZAAR_MAX_UNCOMPRESSED_SIZE', 50 * 1024 * 1024 );
}
if ( ! defined( 'FS_CHMOD_FILE' ) ) {
	define( 'FS_CHMOD_FILE', 0644 );
}
if ( ! defined( 'FS_CHMOD_DIR' ) ) {
	define( 'FS_CHMOD_DIR', 0755 );
}
