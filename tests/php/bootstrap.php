<?php
/**
 * PHPUnit bootstrap — sets up Brain Monkey and defines WordPress stubs
 * so unit tests run without a full WordPress installation.
 */

declare( strict_types=1 );

require_once dirname( __DIR__, 2 ) . '/vendor/autoload.php';

// Pre-load the interface so it's available before ABSPATH-guarded files are loaded.
require_once dirname( __DIR__, 2 ) . '/src/WareRegistryInterface.php';

if ( ! class_exists( 'WP_Error' ) ) {
	/**
	 * Minimal WP_Error stub for unit tests.
	 */
	class WP_Error {
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
		public function get_error_code(): string {
			return $this->code; }

		/** @return string */
		public function get_error_message(): string {
			return $this->message; }

		/** @param mixed $data Extra data to attach. */
		public function add_data( mixed $data ): void {
			$this->data = $data; }
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
if ( ! defined( 'HOUR_IN_SECONDS' ) ) {
	define( 'HOUR_IN_SECONDS', 3600 );
}
if ( ! defined( 'MINUTE_IN_SECONDS' ) ) {
	define( 'MINUTE_IN_SECONDS', 60 );
}
if ( ! defined( 'BAZAAR_SECRET' ) ) {
	define( 'BAZAAR_SECRET', 'test-secret-key' );
}

// ─── WordPress REST API stubs ─────────────────────────────────────────────────

if ( ! class_exists( 'WP_REST_Server' ) ) {
	/**
	 * Minimal WP_REST_Server stub.
	 */
	class WP_REST_Server {
		const READABLE   = 'GET';
		const CREATABLE  = 'POST';
		const EDITABLE   = 'POST, PUT, PATCH';
		const DELETABLE  = 'DELETE';
		const ALLMETHODS = 'GET, POST, PUT, PATCH, DELETE';
	}
}

if ( ! class_exists( 'WP_REST_Response' ) ) {
	/**
	 * Minimal WP_REST_Response stub.
	 */
	class WP_REST_Response {
		/** @var mixed */
		public mixed $data;

		/** @var int */
		public int $status;

		/**
		 * @param mixed $data   Response data.
		 * @param int   $status HTTP status code.
		 */
		public function __construct( mixed $data = null, int $status = 200 ) {
			$this->data   = $data;
			$this->status = $status;
		}

		/** @return mixed */
		public function get_data(): mixed {
			return $this->data; }

		/** @return int */
		public function get_status(): int {
			return $this->status; }
	}
}

if ( ! class_exists( 'WP_REST_Request' ) ) {
	/**
	 * Minimal WP_REST_Request stub.
	 */
	class WP_REST_Request {
		/** @var array<string, mixed> */
		private array $params = array();

		/** @var array<string, mixed> */
		private array $file_params = array();

		/** @param mixed $value */
		public function set_param( string $key, mixed $value ): void {
			$this->params[ $key ] = $value;
		}

		/** @return mixed */
		public function get_param( string $key ): mixed {
			return $this->params[ $key ] ?? null;
		}

		/** @return array<string, mixed> */
		public function get_params(): array {
			return $this->params; }

		/** @param array<string, mixed> $files */
		public function set_file_params( array $files ): void {
			$this->file_params = $files;
		}

		/** @return array<string, mixed> */
		public function get_file_params(): array {
			return $this->file_params; }
	}
}

if ( ! class_exists( 'WP_REST_Controller' ) ) {
	/**
	 * Minimal WP_REST_Controller stub.
	 */
	abstract class WP_REST_Controller {
		/** @var string */
		protected $namespace = '';

		/** @var string */
		protected $rest_base = '';

		abstract public function register_routes(): void;
	}
}
