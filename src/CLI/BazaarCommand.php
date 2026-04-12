<?php
/**
 * Bazaar WP-CLI command — entry point.
 *
 * Keeps service wiring in one place. All command logic lives in the
 * three focused traits imported below.
 *
 * @package Bazaar
 */

declare( strict_types=1 );

namespace Bazaar\CLI;

defined( 'ABSPATH' ) || exit;

use Bazaar\CLI\Traits\WareDevTrait;
use Bazaar\CLI\Traits\WareLifecycleTrait;
use Bazaar\CLI\Traits\WareOpsTrait;
use Bazaar\RemoteRegistry;
use Bazaar\WareLoader;
use Bazaar\WareRegistry;
use Bazaar\WareUpdater;
use Bazaar\WareSigner;
use Bazaar\WareLicense;

/**
 * Manage Bazaar wares from the command line.
 *
 * ## EXAMPLES
 *
 *     # List all installed wares
 *     $ wp bazaar list
 *
 *     # Install a ware from a .wp file
 *     $ wp bazaar install ledger.wp
 *
 *     # Enable a disabled ware
 *     $ wp bazaar enable ledger
 *
 *     # Run the health-check suite
 *     $ wp bazaar doctor
 *
 * @package Bazaar
 */
final class BazaarCommand {

	use WareLifecycleTrait;
	use WareDevTrait;
	use WareOpsTrait;

	/**
	 * Ware index + state.
	 *
	 * @var WareRegistry
	 */
	private WareRegistry $registry;

	/**
	 * Install / validate / delete .wp packages.
	 *
	 * @var WareLoader
	 */
	private WareLoader $loader;

	/**
	 * Fetch packages from the remote registry.
	 *
	 * @var RemoteRegistry
	 */
	private RemoteRegistry $remote;

	/**
	 * Check for and apply ware updates.
	 *
	 * @var WareUpdater
	 */
	private WareUpdater $updater;

	/**
	 * Sign and verify .wp package signatures.
	 *
	 * @var WareSigner
	 */
	private WareSigner $signer;

	/**
	 * Manage per-ware license keys.
	 *
	 * @var WareLicense
	 */
	private WareLicense $license;

	/**
	 * Initialise all service dependencies shared across command traits.
	 */
	public function __construct() {
		$this->registry = new WareRegistry();
		$this->loader   = new WareLoader( $this->registry );
		$this->remote   = new RemoteRegistry();
		$this->updater  = new WareUpdater( $this->registry, $this->remote, $this->loader );
		$this->signer   = new WareSigner();
		$this->license  = new WareLicense();
	}
}
