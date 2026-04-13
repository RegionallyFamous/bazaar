/**
 * Navigation controller — manages the shell's active-ware state machine.
 *
 * Extracted from shell.js so the navigation flow, ware lifecycle helpers, and
 * analytics recording are co-located and independently testable.
 *
 * @module navigation
 */

import { __, sprintf } from '@wordpress/i18n';
import { sortedEnabled, pushRecent } from './nav.js';
import { dismissError } from './errors.js';

/**
 * Create a navigation controller that owns all per-navigation state.
 *
 * @param {Object}   deps
 * @param {Object}   deps.navState             Shared mutable object; `.activeSlug` is read/written here.
 * @param {string}   deps.restUrl              Base REST URL.
 * @param {string}   deps.manageUrl            URL for the manage iframe.
 * @param {Map}      deps.wareMap              Live ware registry map.
 * @param {Map}      deps.badgeMap             Per-ware badge counts.
 * @param {Map}      deps.healthMap            Per-ware health status.
 * @param {Object}   deps.iframes              LRU iframe manager.
 * @param {Element}  deps.navEl                Nav element (for active-state classes).
 * @param {Element}  deps.homePanel            Home screen panel element.
 * @param {Element}  deps.loading              Loading overlay element.
 * @param {Element}  deps.root                 Shell root element.
 * @param {Object}   deps.homeScreen           HomeScreen instance.
 * @param {Object}   deps.toasts               ToastManager instance.
 * @param {Function} deps.serveUrl             Returns the serve URL for a ware.
 * @param {Function} deps.closeMobileNav       Close the mobile nav drawer.
 * @param {Function} deps.positionNavPill      Position the nav pill indicator.
 * @param {Function} deps.updateUrl            Update the browser URL bar.
 * @param {Function} deps.renderNav            Rebuild the nav list.
 * @param {Function} deps.renderTaskbar        Rebuild the taskbar.
 * @param {Function} deps.renderToolbarContext Update the toolbar breadcrumb.
 * @param {Function} deps.renderStatusBar      Update the status bar.
 * @param {Function} deps.apiFetch             Authenticated REST fetch helper.
 * @param {number}   deps.TOAST_DEFAULT_MS     Default toast display duration.
 * @param {number}   deps.DATA_CACHE_TTL_MS    Cache TTL for data queries.
 * @param {number}   deps.DATA_CACHE_MAX       Maximum entries in the data cache.
 * @return {{ navigateTo, applyWareInstalled, applyWareDeleted, applyWareToggled, cacheQuery, recordView }} Navigation controller methods.
 */
export function createNavController( deps ) {
	const {
		navState,
		restUrl,
		manageUrl,
		wareMap,
		badgeMap,
		healthMap,
		iframes,
		navEl,
		homePanel,
		loading,
		root,
		homeScreen,
		toasts,
		serveUrl,
		closeMobileNav,
		positionNavPill,
		updateUrl,
		renderNav,
		renderTaskbar,
		renderToolbarContext,
		renderStatusBar,
		apiFetch,
		getNonce,
		TOAST_DEFAULT_MS,
		DATA_CACHE_TTL_MS,
		DATA_CACHE_MAX,
	} = deps;

	// ── Internal state ────────────────────────────────────────────────────────

	let _navInFlight = false;
	let _navPending = /** @type {{ slug: string, route?: string }|null} */ ( null );
	let _loadTimer = null;

	let _viewSlug = null;
	let _viewStart = 0;

	const _dataCache = new Map();

	// ── Analytics ─────────────────────────────────────────────────────────────

	/**
	 * Record a view-end event for the outgoing ware and start timing the new one.
	 *
	 * @param {string} newSlug
	 */
	function recordView( newSlug ) {
		if ( _viewSlug && _viewSlug !== newSlug && _viewStart ) {
			fetch( `${ restUrl }/analytics`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'X-WP-Nonce': getNonce(),
				},
				body: JSON.stringify( {
					slug: _viewSlug,
					event: 'view',
					duration_ms: Date.now() - _viewStart,
				} ),
				keepalive: true,
			} ).catch( () => {} );
		}
		_viewSlug = newSlug;
		_viewStart = Date.now();
	}

	// ── Navigation state machine ───────────────────────────────────────────────

	function _navDone() {
		_navInFlight = false;
		if ( _navPending ) {
			const { slug, route } = _navPending;
			_navPending = null;
			navigateTo( slug, route );
		}
	}

	/**
	 * Navigate to a ware (or the home / manage view).
	 *
	 * Queues subsequent calls while a view transition is in flight so only the
	 * last-requested destination wins.
	 *
	 * @param {string}  slug  Target ware slug, 'home', or 'manage'.
	 * @param {string=} route Optional deep-link route to pass to the ware.
	 */
	function navigateTo( slug, route ) {
		if ( ! slug ) {
			return;
		}

		// Guard: non-manage/home slugs must exist in the registry.
		if ( slug !== 'manage' && slug !== 'home' && ! wareMap.has( slug ) ) {
			toasts.show( __( 'Ware not found', 'bazaar' ), 'error', TOAST_DEFAULT_MS );
			navigateTo( 'home' );
			return;
		}

		// Last-wins queue while a view transition is running.
		if ( _navInFlight ) {
			_navPending = { slug, route };
			return;
		}

		_navInFlight = true;

		// Close the mobile drawer on navigation.
		closeMobileNav();

		// Cancel any pending slow-load toast from a previous navigation.
		clearTimeout( _loadTimer );
		_loadTimer = null;

		const prevSlug = navState.activeSlug;
		navState.activeSlug = slug;
		updateUrl( slug, route );
		pushRecent( slug );
		recordView( slug );
		homeScreen.recordOpen( slug );
		renderToolbarContext( slug );
		renderStatusBar( slug );

		navEl.querySelectorAll( '.bsh-nav__btn' ).forEach( ( btn ) => {
			const a = btn.dataset.slug === slug;
			btn.classList.toggle( 'bsh-nav__btn--active', a );
			if ( a ) {
				btn.setAttribute( 'aria-current', 'page' );
			} else {
				btn.removeAttribute( 'aria-current' );
			}
		} );

		positionNavPill( slug );

		// Home screen — no iframe needed.
		if ( slug === 'home' ) {
			for ( const f of iframes.frames.values() ) {
				f.classList.remove( 'bsh-iframe--visible' );
				f.setAttribute( 'aria-hidden', 'true' );
			}
			if ( homePanel ) {
				homePanel.hidden = false;
				homeScreen.refresh();
				// Move focus to the home panel so keyboard users land in the right place.
				requestAnimationFrame( () => {
					if ( ! homePanel.hasAttribute( 'tabindex' ) ) {
						homePanel.setAttribute( 'tabindex', '-1' );
					}
					homePanel.focus( { preventScroll: true } );
				} );
			}
			loading.hidden = true;
			renderTaskbar();
			_navDone();
			return;
		}

		// Hide the home panel when switching to a real ware.
		if ( homePanel ) {
			homePanel.hidden = true;
		}

		const url = slug === 'manage' ? manageUrl : serveUrl( wareMap.get( slug ) );
		const had = iframes.frames.has( slug );

		dismissError( slug );

		if ( 'startViewTransition' in document ) {
			const enabled = sortedEnabled( wareMap );
			const prevIdx = enabled.findIndex( ( w ) => w.slug === prevSlug );
			const nextIdx = enabled.findIndex( ( w ) => w.slug === slug );
			let dir = null;
			if ( prevIdx !== -1 && nextIdx !== -1 ) {
				dir = nextIdx > prevIdx ? 'down' : 'up';
			}
			if ( dir ) {
				root.dataset.vtDir = dir;
			} else {
				delete root.dataset.vtDir;
			}
			const t = document.startViewTransition( () => iframes.activate( slug, url ) );
			t.finished
				.catch( ( e ) => {
					// AbortError is expected when a navigation supersedes an in-flight
					// transition (e.g. a deep-link triggers navigation on page load while
					// the opening transition is still running). Log anything unexpected
					// but do not rethrow — navigation has already completed and _navDone
					// must always run regardless of transition outcome.
					if ( e?.name !== 'AbortError' ) {
						// eslint-disable-next-line no-console
						console.error( '[bazaar] view transition error', e );
					}
				} )
				.finally( () => {
					delete root.dataset.vtDir;
					_navDone();
				} );
		} else {
			iframes.activate( slug, url );
			_navDone();
		}

		renderTaskbar();

		if ( had ) {
			loading.hidden = true;
			// Move focus to the iframe boundary so keyboard/AT users land in the right place.
			requestAnimationFrame( () => iframes.frames.get( slug )?.focus() );
			if ( route ) {
				iframes.frames
					.get( slug )
					?.contentWindow?.postMessage(
						{ type: 'bazaar:route', route },
						window.location.origin
					);
			}
		} else {
			loading.hidden = false;
			const f = iframes.frames.get( slug );
			const wareName = wareMap.get( slug )?.name ?? slug;

			const clearLoad = () => {
				clearTimeout( _loadTimer );
				_loadTimer = null;
				loading.hidden = true;
			};

			// If the iframe document never fires 'load' (hung network, DNS failure,
			// HTTP 5xx that returns no document), hide the overlay after 15 s and
			// show a toast so the user isn't stuck indefinitely.
			_loadTimer = setTimeout( () => {
				loading.hidden = true;
				toasts.show(
					sprintf(
						/* translators: %s: ware name */
						__( '%s is taking a long time to load. Try reloading.', 'bazaar' ),
						wareName
					),
					'error',
					TOAST_DEFAULT_MS
				);
			}, 15_000 );

			f?.addEventListener(
				'load',
				() => {
					clearLoad();
					// Move focus to the iframe so keyboard users enter the ware content.
					f.focus();
					if ( route ) {
						f.contentWindow?.postMessage(
							{ type: 'bazaar:route', route },
							window.location.origin
						);
					}
				},
				{ once: true }
			);

			// 'error' fires when the src itself cannot be fetched (network offline,
			// SSL failure). HTTP error documents still fire 'load', so the timeout
			// above covers those cases.
			f?.addEventListener(
				'error',
				() => {
					clearLoad();
					toasts.show(
						sprintf(
							/* translators: %s: ware name */
							__( '%s failed to load.', 'bazaar' ),
							wareName
						),
						'error',
						TOAST_DEFAULT_MS
					);
				},
				{ once: true }
			);
		}
	}

	// ── Ware lifecycle helpers ────────────────────────────────────────────────

	/**
	 * Apply a ware-installed event: register the ware, refresh the nav, navigate
	 * to it, show a success toast, and clear any stale SW-cached assets.
	 *
	 * @param {Object} ware Ware descriptor from the server.
	 */
	function applyWareInstalled( ware ) {
		wareMap.set( ware.slug, ware );
		renderNav();
		navigateTo( ware.slug );
		toasts.show(
			sprintf( /* translators: %s: ware name */ __( '%s is ready', 'bazaar' ), ware.name ?? ware.slug ),
			'success',
			TOAST_DEFAULT_MS
		);
		// Flush stale SW-cached assets so the next load always fetches the
		// freshly-deployed build rather than a stale one that may reference
		// removed REST routes.
		navigator.serviceWorker?.controller?.postMessage( {
			type: 'bazaar:cache-clear',
			slug: ware.slug,
		} );
	}

	/**
	 * Apply a ware-deleted event: remove from registry, destroy iframe, redirect
	 * away if it was active, and refresh the nav.
	 *
	 * @param {string} slug
	 */
	function applyWareDeleted( slug ) {
		wareMap.delete( slug );
		badgeMap.delete( slug );
		healthMap.delete( slug );
		iframes.destroy( slug );
		if ( navState.activeSlug === slug ) {
			navigateTo( 'home' );
		}
		renderNav();
		renderTaskbar();
	}

	/**
	 * Apply a ware-toggled (enable/disable) event.
	 *
	 * @param {string}  slug
	 * @param {boolean} enabled
	 */
	function applyWareToggled( slug, enabled ) {
		const w = wareMap.get( slug );
		if ( w ) {
			w.enabled = enabled;
			if ( ! enabled && navState.activeSlug === slug ) {
				navigateTo( 'manage' );
			}
		}
		renderNav();
	}

	// ── Shared data cache proxy ───────────────────────────────────────────────

	/**
	 * Proxy a bazaar/v1 data request from a ware iframe, caching results
	 * to avoid redundant REST round-trips.
	 *
	 * Only paths within /bazaar/v1/ are forwarded. Paths containing ../ are
	 * rejected after URL normalisation to prevent scope escalation.
	 *
	 * @param {string} id           Correlation ID to echo back in the response.
	 * @param {string} path         REST path (must start with /bazaar/v1/).
	 * @param {Window} targetWindow Source iframe's contentWindow.
	 */
	async function cacheQuery( id, path, targetWindow ) {
		if ( typeof path !== 'string' ) {
			return;
		}
		let normalizedPath;
		try {
			normalizedPath = new URL( path, window.location.origin ).pathname;
		} catch {
			return;
		}
		if ( ! normalizedPath.startsWith( '/bazaar/v1/' ) ) {
			return;
		}

		const cached = _dataCache.get( normalizedPath );
		if ( cached && Date.now() - cached.ts < DATA_CACHE_TTL_MS ) {
			try {
				targetWindow.postMessage(
					{ type: 'bazaar:query-response', id, data: cached.data },
					window.location.origin
				);
			} catch {
				/* target window may have been closed */
			}
			return;
		}
		const replyError = ( status = 0 ) => {
			try {
				targetWindow.postMessage(
					{ type: 'bazaar:query-error', id, status },
					window.location.origin
				);
			} catch { /* target window may have been closed */ }
		};
		try {
			const r = await apiFetch(
				`${ restUrl.replace( /\/bazaar\/v1$/, '' ) }${ normalizedPath }`
			);
			if ( ! r.ok ) {
				replyError( r.status );
				return;
			}
			const contentType = r.headers.get( 'content-type' ) ?? '';
			if ( ! contentType.includes( 'application/json' ) ) {
				replyError( r.status );
				return;
			}
			const d = await r.json();
			// Evict oldest entry when cache is full (simple FIFO).
			if ( _dataCache.size >= DATA_CACHE_MAX ) {
				_dataCache.delete( _dataCache.keys().next().value );
			}
			_dataCache.set( normalizedPath, { data: d, ts: Date.now() } );
			try {
				targetWindow.postMessage(
					{ type: 'bazaar:query-response', id, data: d },
					window.location.origin
				);
			} catch {
				/* target window may have been closed */
			}
		} catch {
			replyError();
		}
	}

	return { navigateTo, applyWareInstalled, applyWareDeleted, applyWareToggled, cacheQuery, recordView };
}
