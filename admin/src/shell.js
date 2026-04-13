/**
 * Bazaar Shell — main entry point.
 *
 * Coordinates all shell modules and owns the top-level application state.
 */

import { __, sprintf } from '@wordpress/i18n';
import './shell.css';

import { esc } from './shared/escape.js';
import {
	SEARCH_DEBOUNCE_MS,
	BADGE_POLL_INTERVAL_MS,
	HEALTH_POLL_INTERVAL_MS,
	DATA_CACHE_TTL_MS,
	DATA_CACHE_MAX,
	TOAST_DEFAULT_MS,
} from './shared/constants.js';

import { connectHmr } from './modules/hmr-bridge.js';

import { TrustAwareLruManager } from './modules/lru.js';
import { toggleFullscreen, popOut } from './modules/views.js';
import { showError } from './modules/errors.js';
import {
	sortedEnabled,
	buildItem,
	buildGroupHeader,
	buildDivider,
	buildSectionLabel,
	attachDragHandlers,
	registerShortcuts,
	pinnedSet,
	recentList,
	healthMap,
	invalidateSortCache,
	patchNavBadges,
	patchNavHealth,
} from './modules/nav.js';
import { CommandPalette } from './modules/palette.js';
import { connectSSE, pollBadges, pollHealth, createPollingFallback } from './modules/sse.js';
import { initServiceWorker } from './modules/sw.js';
import { NotificationCenter } from './modules/notifications.js';
import { NavContextMenu } from './modules/context-menu.js';
import { Launchpad } from './modules/launchpad.js';
import { HomeScreen } from './modules/home.js';
import { WareInfo } from './modules/ware-info.js';
import { createNavController } from './modules/navigation.js';
// ===========================================================================
// Bootstrap
// ===========================================================================

const D = window.bazaarShell ?? {};
const {
	restUrl,
	nonce: _initialNonce,
	adminColor,
	manageUrl,
	wares: initialWares,
	branding = {},
	outdatedCount = 0,
	swUrl = null,
} = D;

// REST nonce; refreshed on 401 via /wp-json/ X-WP-Nonce.
let _nonce = _initialNonce;

let _nonceRefreshing = false;

async function refreshNonce() {
	if ( _nonceRefreshing ) {
		return;
	}
	_nonceRefreshing = true;
	try {
		const r = await fetch(
			new URL( '/wp-json/', window.location.origin ).href,
			{ credentials: 'same-origin' }
		);
		const fresh = r.headers.get( 'X-WP-Nonce' );
		if ( fresh ) {
			_nonce = fresh;
		}
	} catch { /* non-fatal */ } finally {
		_nonceRefreshing = false;
	}
}

// Adds X-WP-Nonce; on 401 refreshes nonce and retries once.
async function apiFetch( url, init = {} ) {
	const withNonce = ( n ) => ( { ...( init.headers ?? {} ), 'X-WP-Nonce': n } );
	const r = await fetch( url, { ...init, headers: withNonce( _nonce ) } );
	if ( r.status === 401 ) {
		await refreshNonce();
		return fetch( url, { ...init, headers: withNonce( _nonce ) } );
	}
	return r;
}

const LRU_CAP = Math.max(
	3,
	Math.min( 10, Math.floor( ( navigator.deviceMemory ?? 4 ) * 1.5 ) )
);

// ===========================================================================
// State
// ===========================================================================

// Shared mutable state object — passed to the navigation controller so both
// this module and navigation.js can read/write navState.activeSlug by reference.
const navState = { activeSlug: /** @type {string|null} */ ( null ) };
let navFilterQuery = '';

/** @type {Map<string, Object>} slug → index entry */
const wareMap = new Map( ( initialWares ?? [] ).map( ( w ) => [ w.slug, w ] ) );
/** @type {Map<string, number>} slug → badge count */
const badgeMap = new Map();

let _badgeRafPending = false; // badge postMessage → one rAF flush

// ===========================================================================
// DOM
// ===========================================================================

const navList = document.getElementById( 'bsh-nav-list' );
const navFooter = document.getElementById( 'bsh-nav-footer' );
const navEl = document.getElementById( 'bsh-nav' );
const main = document.getElementById( 'bsh-main' );
const loading = document.getElementById( 'bsh-loading' );
const collapse = document.getElementById( 'bsh-collapse' );
const root = document.getElementById( 'bazaar-shell-root' );
const toolbarContext = document.getElementById( 'bsh-toolbar-context' );
const toolbarCtxBtns = document.getElementById( 'bsh-toolbar-ctx-btns' );
const taskbarEl = document.getElementById( 'bsh-taskbar' );
const statusbarLeft = document.getElementById( 'bsh-statusbar-left' );
const statusbarClock = document.getElementById( 'bsh-statusbar-clock' );
const homePanel = document.getElementById( 'bsh-home-screen' );

// Fail loudly in development; degrade gracefully in production when the shell
// template is missing a required element rather than throwing a cascade of
// null-dereference TypeErrors throughout the module.
if ( ! navList || ! navFooter || ! navEl || ! main || ! loading || ! collapse || ! root ) {
	throw new Error( 'Bazaar shell: missing required DOM elements' );
}

// Toast container
const toastEl = document.createElement( 'div' );
toastEl.className = 'bsh-toasts';
document.body.appendChild( toastEl );

// ─── Nav sliding pill ────────────────────────────────────────────────────────

const navPill = document.createElement( 'div' );
navPill.className = 'bsh-nav__pill';
navPill.style.opacity = '0';
navList.appendChild( navPill );

/**
 * Position the pill to overlap the currently-active nav item.
 * Hides itself when the active slug is in the footer (home/manage).
 *
 * @param {string} slug
 */
function positionNavPill( slug ) {
	if ( slug === 'home' || slug === 'manage' ) {
		navPill.style.opacity = '0';
		return;
	}
	const activeLi = navList.querySelector( `.bsh-nav__item[data-slug="${ slug }"]` );
	if ( ! activeLi || activeLi.hidden ) {
		navPill.style.opacity = '0';
		return;
	}
	const listRect = navList.getBoundingClientRect();
	const liRect = activeLi.getBoundingClientRect();
	navPill.style.top = `${ liRect.top - listRect.top + navList.scrollTop }px`;
	navPill.style.height = `${ liRect.height }px`;
	navPill.style.opacity = '1';
}

// Re-position pill whenever the nav list is resized (window resize, WP sidebar
// layout changes, and every frame of the collapse/expand CSS transition).
new ResizeObserver( () => positionNavPill( navState.activeSlug ?? '' ) ).observe( navList );

// ─── Nav filter input ────────────────────────────────────────────────────────

const filterWrap = document.createElement( 'div' );
filterWrap.className = 'bsh-nav__filter-wrap';

const filterIcon = document.createElement( 'span' );
filterIcon.className = 'dashicons dashicons-search bsh-nav__filter-icon';
filterIcon.setAttribute( 'aria-hidden', 'true' );

const filterInput = document.createElement( 'input' );
filterInput.type = 'search';
filterInput.className = 'bsh-nav__filter-input';
filterInput.placeholder = __( 'Filter…', 'bazaar' );
filterInput.setAttribute( 'aria-label', __( 'Filter wares', 'bazaar' ) );
filterInput.autocomplete = 'off';
filterInput.spellcheck = false;

filterWrap.append( filterIcon, filterInput );
navEl.querySelector( '.bsh-nav__header' )?.insertAdjacentElement( 'afterend', filterWrap );

let _navFilterTimer;
filterInput.addEventListener( 'input', () => {
	navFilterQuery = filterInput.value.trim().toLowerCase();
	clearTimeout( _navFilterTimer );
	_navFilterTimer = setTimeout( applyNavFilter, SEARCH_DEBOUNCE_MS );
} );

filterInput.addEventListener( 'keydown', ( e ) => {
	if ( e.key === 'Escape' ) {
		filterInput.value = '';
		navFilterQuery = '';
		clearTimeout( _navFilterTimer );
		applyNavFilter();
		filterInput.blur();
	}
} );

// ─── Mobile nav hamburger + backdrop ─────────────────────────────────────────

const mobileMenuBtn = document.createElement( 'button' );
mobileMenuBtn.type = 'button';
mobileMenuBtn.className = 'bsh-mobile-menu';
mobileMenuBtn.id = 'bsh-mobile-menu';
mobileMenuBtn.setAttribute( 'aria-label', __( 'Open navigation', 'bazaar' ) );
mobileMenuBtn.setAttribute( 'aria-expanded', 'false' );
mobileMenuBtn.innerHTML =
	'<span class="dashicons dashicons-menu-alt" aria-hidden="true"></span>';
document.getElementById( 'bsh-toolbar' )?.insertAdjacentElement(
	'afterbegin',
	mobileMenuBtn
);

const navBackdrop = document.createElement( 'div' );
navBackdrop.className = 'bsh-nav-backdrop';
root.appendChild( navBackdrop );

function closeMobileNav() {
	root.classList.remove( 'bsh--nav-open' );
	mobileMenuBtn.setAttribute( 'aria-expanded', 'false' );
	mobileMenuBtn.setAttribute( 'aria-label', __( 'Open navigation', 'bazaar' ) );
}

mobileMenuBtn.addEventListener( 'click', () => {
	const open = root.classList.toggle( 'bsh--nav-open' );
	mobileMenuBtn.setAttribute( 'aria-expanded', String( open ) );
	mobileMenuBtn.setAttribute(
		'aria-label',
		open ? __( 'Close navigation', 'bazaar' ) : __( 'Open navigation', 'bazaar' )
	);
} );

navBackdrop.addEventListener( 'click', closeMobileNav );

// ===========================================================================
// Core services
// ===========================================================================

const iframes = new TrustAwareLruManager( main, LRU_CAP, wareMap );

// ===========================================================================
// White-label branding
// ===========================================================================

( function applyBranding() {
	if ( branding.title ) {
		const titleEl = document.querySelector( '.bsh-nav__title' );
		if ( titleEl ) {
			titleEl.textContent = branding.title;
		}
		document.title = branding.title + ' — WordPress';
	}
	if ( branding.color ) {
		root.style.setProperty( '--bsh-accent', branding.color );
	}
	if ( branding.logoUrl ) {
		const logoEl = document.querySelector( '.bsh-nav__logo' );
		// Guard against javascript: URIs — only allow http/https/data image URIs.
		const safeLogoUrl = /^(https?:|data:image\/)/.test( branding.logoUrl )
			? branding.logoUrl
			: null;
		if ( logoEl && safeLogoUrl ) {
			const img = document.createElement( 'img' );
			img.src = safeLogoUrl;
			img.alt = '';
			img.width = 20;
			img.height = 20;
			logoEl.replaceWith( img );
		}
	}
}() );

// ===========================================================================
// Toast Manager
// ===========================================================================

class ToastManager {
	constructor( container ) {
		this.el = container;
	}
	show( message, level = 'info', ms = 4000 ) {
		const ICONS = {
			success: 'dashicons-yes-alt',
			warning: 'dashicons-warning',
			error: 'dashicons-dismiss',
			info: 'dashicons-info',
		};
		const t = document.createElement( 'div' );
		t.className = `bsh-toast bsh-toast--${ level }`;
		t.setAttribute( 'role', 'alert' );
		t.innerHTML =
			`<span class="bsh-toast__icon dashicons ${ ICONS[ level ] ?? 'dashicons-info' }" aria-hidden="true"></span>` +
			`<span class="bsh-toast__msg">${ esc( message ) }</span>`;
		this.el.appendChild( t );
		requestAnimationFrame( () => t.classList.add( 'bsh-toast--in' ) );
		setTimeout( () => {
			t.classList.remove( 'bsh-toast--in' );
			t.addEventListener( 'transitionend', () => t.remove(), {
				once: true,
			} );
		}, ms );
	}
}

// ===========================================================================
// Event Bus
// ===========================================================================
//
// Open-bus contract: all events are GLOBAL. Any subscribed ware receives every
// event it subscribes to regardless of which ware emitted it. Ware authors
// MUST namespace their event names with their slug (e.g. "crm:contact-updated")
// to avoid collisions with other wares. The broker enforces this convention at
// emit time: events that do not start with "{emitter-slug}:" are rejected.
// Built-in shell events prefixed with "bazaar:" are reserved.

class EventBus {
	constructor() {
		this.subs = new Map();
	}
	subscribe( slug, event ) {
		if ( ! this.subs.has( event ) ) {
			this.subs.set( event, new Set() );
		}
		this.subs.get( event ).add( slug );
	}
	unsubscribeAll( slug ) {
		for ( const s of this.subs.values() ) {
			s.delete( slug );
		}
	}
	/**
	 * Broadcast an event to all subscribers.
	 * Enforces slug-prefix convention: the event name must start with
	 * "{fromSlug}:" so wares cannot impersonate each other's event namespaces.
	 * Returns false when the event name violates the convention.
	 *
	 * @param {string} event    Namespaced event name (e.g. "flow:task-added").
	 * @param {*}      data     Payload forwarded to each subscriber.
	 * @param {string} fromSlug Slug of the ware sending the event.
	 * @return {boolean} False when the event name violates the slug-prefix convention.
	 */
	broadcast( event, data, fromSlug ) {
		if ( fromSlug && ! event.startsWith( fromSlug + ':' ) ) {
			return false;
		}
		for ( const slug of this.subs.get( event ) ?? [] ) {
			if ( slug === fromSlug ) {
				continue;
			}
			for ( const mgr of activeLrus() ) {
				mgr.frames
					.get( slug )
					?.contentWindow?.postMessage(
						{ type: 'bazaar:event', event, data },
						window.location.origin
					);
			}
		}
		return true;
	}
}

// ===========================================================================
// Clipboard
// ===========================================================================

// Clipboard entries are namespaced by the writing ware's slug so that a ware
// can only paste data it (or the same slug) wrote. Cross-ware reads are
// rejected to prevent one ware from silently exfiltrating another's clipboard.
class ShellClipboard {
	constructor() {
		this._data = null;
		this._mime = null;
		this._fromSlug = null;
	}
	copy( data, mime = 'application/json', fromSlug = null ) {
		this._data = data;
		this._mime = mime;
		this._fromSlug = fromSlug;
	}
	paste( mime, requestingSlug = null ) {
		if ( mime && mime !== this._mime ) {
			return null;
		}
		// Reject cross-ware reads: the requesting slug must match the writing slug.
		if ( this._fromSlug !== null && requestingSlug !== null && requestingSlug !== this._fromSlug ) {
			return null;
		}
		return this._data;
	}
}

const clipboard = new ShellClipboard();

// ===========================================================================
// Helpers
// ===========================================================================

const toasts = new ToastManager( toastEl );
const bus = new EventBus();

// ===========================================================================
// Navigation controller
// ===========================================================================

// homeScreenRef is a single-entry mutable container so the navigation
// controller can be created before HomeScreen exists. The getter below
// is only evaluated when navigateTo() is actually called, by which point
// homeScreenRef.current has been populated (see OS features section below).
const homeScreenRef = {};
const nav = createNavController( {
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
	get homeScreen() {
		return homeScreenRef.current;
	},
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
	getNonce: () => _nonce,
	TOAST_DEFAULT_MS,
	DATA_CACHE_TTL_MS,
	DATA_CACHE_MAX,
} );
const { navigateTo, applyWareInstalled, applyWareDeleted, applyWareToggled, cacheQuery, recordView } = nav;

const palette = new CommandPalette( {
	wareMap,
	restUrl,
	getNonce: () => _nonce,
	sortedEnabled,
	onSelect: navigateTo,
	openExternal,
} );

// ===========================================================================
// OS features — instantiated here so they can reference helpers above
// ===========================================================================

const homeScreen = new HomeScreen( {
	wareMap,
	navigateTo,
	iconUrl,
	sortedEnabled,
	badgeMap,
	pinnedSet,
	restUrl,
	apiFetch,
	onWareInstalled: applyWareInstalled,
} );
homeScreenRef.current = homeScreen;
if ( homePanel ) {
	homeScreen.mount( homePanel );
}

const wareInfo = new WareInfo();

const launchpad = new Launchpad( {
	wareMap,
	navigateTo,
	iconUrl,
	sortedEnabled,
} );

const notifCenter = new NotificationCenter( {
	root,
	toolbar: document.getElementById( 'bsh-toolbar' ),
	navigateTo,
} );

// Patch toasts to also log to the notification center.
// DnD mode in NotificationCenter suppresses the visible popup.
const _origToastShow = toasts.show.bind( toasts );
toasts.show = ( message, level = 'info', ms = TOAST_DEFAULT_MS ) => {
	const suppress = notifCenter.add( 'system', message, level, null );
	if ( ! suppress ) {
		_origToastShow( message, level, ms );
	}
};

const ctxMenu = new NavContextMenu( {
	navigateTo,
	popOut,
	serveUrl,
	wareMap,
	wareInfo,
} );

// Shortcut overlay state
let shortcutsEl = null;
let shortcutsWareCol = null;

/**
 * Open a URL in a new tab only if it has an http/https scheme.
 * Blocks javascript:, data:, and other dangerous protocols that could be
 * returned by a compromised federated-search endpoint.
 * @param {string} url
 */
function openExternal( url ) {
	try {
		const parsed = new URL( url );
		if ( parsed.protocol !== 'https:' && parsed.protocol !== 'http:' ) {
			return;
		}
		window.open( url, '_blank', 'noopener,noreferrer' );
	} catch { /* invalid URL — do nothing */ }
}

function serveUrl( ware ) {
	const u = new URL(
		`${ restUrl }/serve/${ encodeURIComponent( ware.slug ) }/${ encodeURIComponent( ware.entry ?? 'index.html' ) }`
	);
	u.searchParams.set( '_wpnonce', _nonce );
	u.searchParams.set( '_adminColor', adminColor ?? 'fresh' );
	return u.toString();
}

function iconUrl( ware ) {
	return `${ restUrl }/serve/${ encodeURIComponent( ware.slug ) }/${ encodeURIComponent( ware.icon ?? 'icon.svg' ) }?_wpnonce=${ _nonce }`;
}

/** Return all active LRU managers. */
function activeLrus() {
	return [ iframes ];
}

/**
 * Find which LRU owns a given contentWindow.
 * @param {Window} win
 */
function slugForWindow( win ) {
	for ( const mgr of activeLrus() ) {
		for ( const [ slug, f ] of mgr.frames ) {
			if ( f.contentWindow === win ) {
				return slug;
			}
		}
	}
	return null;
}

// ===========================================================================
// Deep links
// ===========================================================================

function parseDeepLink() {
	const p = new URLSearchParams( window.location.search );
	return { ware: p.get( 'ware' ), route: p.get( 'route' ) };
}

function updateUrl( slug, route ) {
	const p = new URLSearchParams( window.location.search );
	p.set( 'page', 'bazaar' );
	if ( slug && slug !== 'manage' && slug !== 'home' ) {
		p.set( 'ware', slug );
	} else {
		p.delete( 'ware' );
	}
	if ( route ) {
		p.set( 'route', route );
	} else {
		p.delete( 'route' );
	}
	history.replaceState(
		{ slug, route },
		'',
		`${ window.location.pathname }?${ p }`
	);
}

// ===========================================================================
// Nav filter
// ===========================================================================

/**
 * Show/hide nav list items based on the current navFilterQuery.
 * When a query is active, structural chrome (section labels, dividers, group
 * headers) is hidden so matching items appear as a flat filtered list.
 */
function applyNavFilter() {
	const q = navFilterQuery;
	navList.querySelectorAll( 'li' ).forEach( ( li ) => {
		if ( li.dataset.slug ) {
			if ( ! q ) {
				li.hidden = false;
				return;
			}
			const label = (
				li.querySelector( '.bsh-nav__label' )?.textContent ?? ''
			).toLowerCase();
			li.hidden =
				! label.includes( q ) && ! li.dataset.slug.toLowerCase().includes( q );
		} else {
			// Section labels, dividers, group headers — suppress during active filter.
			li.hidden = !! q;
		}
	} );
	// Active item may have been hidden/shown by the filter — re-sync pill.
	positionNavPill( navState.activeSlug ?? '' );
}

// ===========================================================================
// Nav rendering
// ===========================================================================

function renderNav() {
	// Structural change — discard the cached sorted list so registerShortcuts
	// rebuilds it on the next Alt+N keypress.
	invalidateSortCache();

	const hadNoWares = root.classList.contains( 'bsh--no-wares' );

	navList.innerHTML = '';
	navFooter.innerHTML = '';

	// Home — always first in footer
	const homeItem = buildItem(
		'home',
		{
			label: __( 'Home', 'bazaar' ),
			di: 'dashicons-admin-home',
		},
		navState.activeSlug,
		badgeMap
	);
	navFooter.appendChild( homeItem );

	// Manage — pinned in footer, not mixed with ware tabs
	const manageItem = buildItem(
		'manage',
		{
			label: __( 'Manage Wares', 'bazaar' ),
			svgIcon: `<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" width="16" height="16">
				<line x1="2" y1="4"  x2="14" y2="4"  stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
				<line x1="2" y1="8"  x2="14" y2="8"  stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
				<line x1="2" y1="12" x2="14" y2="12" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
				<circle cx="5"  cy="4"  r="2" fill="currentColor"/>
				<circle cx="10" cy="8"  r="2" fill="currentColor"/>
				<circle cx="6"  cy="12" r="2" fill="currentColor"/>
			</svg>`,
		},
		navState.activeSlug,
		badgeMap
	);
	navFooter.appendChild( manageItem );

	const enabled = sortedEnabled( wareMap );
	const nowHasWares = enabled.length > 0;

	root.classList.toggle( 'bsh--no-wares', ! nowHasWares );

	// Transitioning from no-wares → first ware: expand nav as a welcome moment.
	if ( hadNoWares && nowHasWares ) {
		root.classList.remove( 'bsh--collapsed' );
		collapse.setAttribute( 'aria-expanded', 'true' );
		collapse.setAttribute( 'aria-label', __( 'Collapse navigation', 'bazaar' ) );
	}

	if ( ! nowHasWares ) {
		const li = document.createElement( 'li' );
		li.className = 'bsh-nav__empty';
		const btn = document.createElement( 'button' );
		btn.type = 'button';
		btn.className = 'bsh-nav__empty-cta';
		btn.textContent =
			wareMap.size === 0
				? __( 'No wares installed yet. →', 'bazaar' )
				: __( 'All wares disabled. Enable one →', 'bazaar' );
		btn.setAttribute( 'aria-label', __( 'Go to Manage Wares', 'bazaar' ) );
		btn.addEventListener( 'click', () => navigateTo( 'manage' ) );
		li.appendChild( btn );
		navList.appendChild( li );
		filterWrap.classList.remove( 'bsh-nav__filter-wrap--active' );
		attachDragHandlers( navList );
		return;
	}

	// Pinned section
	const pinned = enabled.filter( ( w ) => pinnedSet.has( w.slug ) );
	if ( pinned.length ) {
		navList.appendChild( buildSectionLabel( __( 'Pinned', 'bazaar' ) ) );
		for ( const w of pinned ) {
			navList.appendChild(
				buildItem(
					w.slug,
					{
						label: w.menu_title ?? w.name,
						icon: iconUrl( w ),
						devMode: !! w.dev_url,
					},
					navState.activeSlug,
					badgeMap
				)
			);
		}
		navList.appendChild( buildDivider() );
	}

	// Recent section (only if some recents not already in pinned)
	const recents = recentList
		.filter(
			( s ) => wareMap.has( s ) && ! pinnedSet.has( s ) && wareMap.get( s ).enabled
		)
		.slice( 0, 3 );
	if ( recents.length ) {
		navList.appendChild( buildSectionLabel( __( 'Recent', 'bazaar' ) ) );
		for ( const slug of recents ) {
			const w = wareMap.get( slug );
			navList.appendChild(
				buildItem(
					w.slug,
					{
						label: w.menu_title ?? w.name,
						icon: iconUrl( w ),
						devMode: !! w.dev_url,
					},
					navState.activeSlug,
					badgeMap
				)
			);
		}
		navList.appendChild( buildDivider() );
	}

	// All wares (grouped) — skip anything already shown in Pinned or Recent
	const shownInSections = new Set( [
		...pinned.map( ( w ) => w.slug ),
		...recents,
	] );
	const groups = new Map();
	const ungrouped = [];
	for ( const w of enabled ) {
		if ( shownInSections.has( w.slug ) ) {
			continue;
		}
		if ( w.group ) {
			if ( ! groups.has( w.group ) ) {
				groups.set( w.group, [] );
			}
			groups.get( w.group ).push( w );
		} else {
			ungrouped.push( w );
		}
	}

	for ( const w of ungrouped ) {
		navList.appendChild(
			buildItem(
				w.slug,
				{
					label: w.menu_title ?? w.name,
					icon: iconUrl( w ),
					devMode: !! w.dev_url,
				},
				navState.activeSlug,
				badgeMap
			)
		);
	}

	for ( const [ gName, gWares ] of groups ) {
		// A group with one member would show the same name twice (header + item).
		// Render it as a plain ungrouped item instead.
		if ( gWares.length === 1 ) {
			const w = gWares[ 0 ];
			navList.appendChild(
				buildItem(
					w.slug,
					{
						label: w.menu_title ?? w.name,
						icon: iconUrl( w ),
						devMode: !! w.dev_url,
					},
					navState.activeSlug,
					badgeMap
				)
			);
			continue;
		}
		navList.appendChild( buildGroupHeader( gName ) );
		for ( const w of gWares ) {
			navList.appendChild(
				buildItem(
					w.slug,
					{
						label: w.menu_title ?? w.name,
						icon: iconUrl( w ),
						devMode: !! w.dev_url,
						grouped: true,
					},
					navState.activeSlug,
					badgeMap
				)
			);
		}
	}

	// Add Alt+N shortcut labels.
	const allItems = navList.querySelectorAll( '.bsh-nav__item[data-slug]' );
	allItems.forEach( ( li, idx ) => {
		if ( idx < 9 && li.dataset.slug !== 'manage' ) {
			const hint = document.createElement( 'span' );
			hint.className = 'bsh-nav__shortcut-hint';
			hint.textContent = `⌥${ idx + 1 }`;
			hint.setAttribute( 'aria-hidden', 'true' );
			li.querySelector( '.bsh-nav__btn' )?.appendChild( hint );
		}
	} );

	// Show filter when there are enough wares; hide on transition to fewer.
	const showFilter = enabled.length >= 5;
	if ( ! showFilter && navFilterQuery ) {
		filterInput.value = '';
		navFilterQuery = '';
	}
	filterWrap.classList.toggle( 'bsh-nav__filter-wrap--active', showFilter );

	attachDragHandlers( navList );
	ctxMenu.attach( navList );
	applyNavFilter();

	// Re-append pill (innerHTML clear removed it) and sync position.
	navList.appendChild( navPill );
	positionNavPill( navState.activeSlug ?? '' );
}

// Nav refresh event (from drag/pin toggles).
document.addEventListener( 'bazaar:nav-refresh', () => renderNav() );

// ===========================================================================
// Toolbar context breadcrumb
// ===========================================================================

function renderToolbarContext( slug ) {
	if ( 'startViewTransition' in document ) {
		document
			.startViewTransition( () => _renderToolbarContextInner( slug ) )
			.finished
			.catch( ( e ) => {
				// AbortError is expected when a navigation supersedes this animation.
				if ( e?.name !== 'AbortError' ) {
					// eslint-disable-next-line no-console
					console.error( '[bazaar] toolbar context transition error', e );
				}
			} );
	} else {
		_renderToolbarContextInner( slug );
	}
}

function _renderToolbarContextInner( slug ) {
	if ( ! toolbarContext ) {
		return;
	}
	toolbarContext.innerHTML = '';

	if ( ! slug ) {
		return;
	}

	const isManage = slug === 'manage';
	const isHome = slug === 'home';
	const ware = ( isManage || isHome ) ? null : wareMap.get( slug );
	let label;
	if ( isManage ) {
		label = __( 'Manage Wares', 'bazaar' );
	} else if ( isHome ) {
		label = __( 'Home', 'bazaar' );
	} else {
		label = ware?.menu_title ?? ware?.name ?? slug;
	}

	// Breadcrumb button opens the command palette for quick switching.
	const btn = document.createElement( 'button' );
	btn.type = 'button';
	btn.className = 'bsh-toolbar__context-btn';
	btn.setAttribute( 'aria-label', __( 'Switch ware (⌘K)', 'bazaar' ) );
	btn.title = __( 'Switch ware · ⌘K', 'bazaar' );

	const iconEl = document.createElement( 'span' );
	iconEl.setAttribute( 'aria-hidden', 'true' );

	if ( isHome ) {
		iconEl.className = 'dashicons dashicons-admin-home bsh-toolbar__context-icon';
	} else if ( isManage ) {
		iconEl.className = 'dashicons dashicons-admin-settings bsh-toolbar__context-icon';
	} else if ( ware?.icon ) {
		const img = document.createElement( 'img' );
		img.src = iconUrl( ware );
		img.alt = '';
		img.className = 'bsh-toolbar__context-icon-img';
		img.onerror = () => img.remove();
		iconEl.replaceWith( img );
		btn.appendChild( img );
	} else {
		iconEl.className = 'dashicons dashicons-admin-plugins bsh-toolbar__context-icon';
	}

	if ( iconEl.className ) {
		btn.appendChild( iconEl );
	}

	const labelEl = document.createElement( 'span' );
	labelEl.className = 'bsh-toolbar__context-label';
	labelEl.textContent = label;
	btn.appendChild( labelEl );

	const chevron = document.createElement( 'span' );
	chevron.className = 'bsh-toolbar__context-chevron';
	chevron.setAttribute( 'aria-hidden', 'true' );
	btn.appendChild( chevron );

	btn.addEventListener( 'click', () => palette.open() );
	toolbarContext.appendChild( btn );

	// Context-sensitive action buttons: Reload + Info (wares only).
	// These live in the toolbar rather than a separate winbar so there's
	// one unified chrome strip with no duplicated title.
	if ( toolbarCtxBtns ) {
		toolbarCtxBtns.innerHTML = '';

		if ( ! isHome ) {
			const reloadBtn = document.createElement( 'button' );
			reloadBtn.type = 'button';
			reloadBtn.className = 'bsh-toolbar__btn bsh-toolbar__btn--ctx';
			reloadBtn.setAttribute( 'aria-label', __( 'Reload', 'bazaar' ) );
			reloadBtn.title = __( 'Reload', 'bazaar' );
			reloadBtn.innerHTML = '<span class="dashicons dashicons-update" aria-hidden="true"></span>';
			reloadBtn.addEventListener( 'click', () => {
				if ( navState.activeSlug ) {
					iframes.reload( navState.activeSlug );
				}
			} );
			toolbarCtxBtns.appendChild( reloadBtn );
		}

		if ( ware ) {
			const infoBtn = document.createElement( 'button' );
			infoBtn.type = 'button';
			infoBtn.className = 'bsh-toolbar__btn bsh-toolbar__btn--ctx';
			infoBtn.setAttribute( 'aria-label', __( 'Ware settings', 'bazaar' ) );
			infoBtn.title = __( 'Ware settings', 'bazaar' );
			infoBtn.innerHTML = '<span class="dashicons dashicons-admin-generic" aria-hidden="true"></span>';
			infoBtn.addEventListener( 'click', ( e ) => {
				e.stopPropagation();
				wareInfo.toggle( ware, infoBtn );
			} );
			toolbarCtxBtns.appendChild( infoBtn );
		}
	}
}

// ===========================================================================
// SSE / badge + health polling — wired via shared sse.js module
// ===========================================================================

const sseDeps = {
	restUrl,
	get nonce() {
		return _nonce;
	},
	// SSE-delivered badge/health events patch in-place — no full nav rebuild.
	onBadge: ( slug, count ) => {
		badgeMap.set( slug, count );
		patchNavBadges( navList, badgeMap );
		renderTaskbar();
	},
	onToast: ( message, level ) => toasts.show( message, level ),
	onWareInstalled: applyWareInstalled,
	onWareDeleted: applyWareDeleted,
	onWareToggled: applyWareToggled,
	onHealthUpdate: ( slug, status ) => {
		healthMap.set( slug, status );
		patchNavHealth( navList, healthMap );
	},
};

// Separate deps for the fallback pollers — each has its own onDirty so
// badge and health updates trigger the correct targeted patch, not a full rebuild.
const badgePollDeps = {
	restUrl,
	get nonce() {
		return _nonce;
	},
	badgeMap,
	onDirty: () => patchNavBadges( navList, badgeMap ),
};

const healthPollDeps = {
	restUrl,
	get nonce() {
		return _nonce;
	},
	healthMap,
	onDirty: () => patchNavHealth( navList, healthMap ),
};

// ===========================================================================
// postMessage hub
// ===========================================================================

window.addEventListener( 'message', ( event ) => {
	if ( event.origin !== window.location.origin ) {
		return;
	}
	const { type, ...p } = event.data ?? {};
	const fromSlug = slugForWindow( event.source );

	try {
		switch ( type ) {
		// Lifecycle — only the manage iframe is trusted to report these events.
		// Any ware that can post same-origin messages cannot spoof installs/deletes.
			case 'bazaar:ware-installed':
				if ( fromSlug === 'manage' && p.ware?.slug ) {
					applyWareInstalled( p.ware );
				}
				break;
			case 'bazaar:ware-deleted':
				if ( fromSlug === 'manage' && p.slug ) {
					applyWareDeleted( p.slug );
				}
				break;
			case 'bazaar:ware-toggled':
				if ( fromSlug === 'manage' ) {
					applyWareToggled( p.slug, p.enabled );
				}
				break;

				// Event bus
			case 'bazaar:subscribe':
				if ( fromSlug ) {
					bus.subscribe( fromSlug, p.event );
				}
				break;
			case 'bazaar:emit':
				if ( fromSlug ) {
					bus.broadcast( p.event, p.data, fromSlug );
				}
				break;
			case 'bazaar:unsubscribe-all':
				if ( fromSlug ) {
					bus.unsubscribeAll( fromSlug );
				}
				break;

				// UI
			case 'bazaar:toast':
				toasts.show( p.message ?? '', p.level ?? 'info', p.duration ?? 4000 );
				break;
			case 'bazaar:notify':
				notifCenter.add(
					fromSlug ?? 'system',
					p.message ?? '',
					p.level ?? 'info',
					fromSlug ? wareMap.get( fromSlug ) : null
				);
				break;
			case 'bazaar:badge':
				if ( fromSlug ) {
					badgeMap.set( fromSlug, p.count ?? 0 );
					if ( ! _badgeRafPending ) {
						_badgeRafPending = true;
						requestAnimationFrame( () => {
							_badgeRafPending = false;
							patchNavBadges( navList, badgeMap );
							renderTaskbar();
							homeScreen.patchBadges( badgeMap );
						} );
					}
				}
				break;
			case 'bazaar:navigate':
				// Unknown frame → no fromSlug; ignore.
				if ( fromSlug ) {
					navigateTo( p.ware, p.route, p.secondary ?? false );
				}
				break;
			case 'bazaar:widget':
				if ( fromSlug ) {
					homeScreen.addWidget( fromSlug, p.data ?? {} );
				}
				break;
			case 'bazaar:shortcuts':
				if ( fromSlug && p.shortcuts ) {
					updateWareShortcuts( fromSlug, wareMap.get( fromSlug ), p.shortcuts );
				}
				break;

				// Data cache
			case 'bazaar:query':
				if ( p.id && p.path ) {
					cacheQuery( p.id, p.path, event.source );
				}
				break;

				// Clipboard
			case 'bazaar:copy':
				clipboard.copy( p.data, p.mime, fromSlug );
				break;
			case 'bazaar:paste':
				event.source.postMessage(
					{
						type: 'bazaar:paste-response',
						id: p.id,
						data: clipboard.paste( p.mime, fromSlug ),
					},
					window.location.origin
				);
				break;

				// Error reporting
			case 'bazaar:error':
				if ( fromSlug ) {
					showError( fromSlug, p.message, p.stack, main, ( slug ) => {
						iframes.reload( slug );
					} );
					// POST to error log endpoint.
					fetch( `${ restUrl }/errors`, {
						method: 'POST',
						headers: {
							'Content-Type': 'application/json',
							'X-WP-Nonce': _nonce,
						},
						body: JSON.stringify( {
							slug: fromSlug,
							message: p.message,
							stack: p.stack,
							url: p.url,
						} ),
						keepalive: true,
					} ).catch( () => {} );
				}
				break;
		}
	} catch ( err ) {
		// eslint-disable-next-line no-console
		console.error( '[bazaar] message handler error', err );
	}
} );

// ===========================================================================
// Toolbar buttons (split, fullscreen, pop-out, inspector)
// ===========================================================================

( function buildToolbar() {
	const toolbar = document.getElementById( 'bsh-toolbar' );
	if ( ! toolbar ) {
		return;
	}

	function mkBtn( label, icon, onClick ) {
		const b = document.createElement( 'button' );
		b.type = 'button';
		b.className = 'bsh-toolbar__btn';
		b.setAttribute( 'aria-label', label );
		b.title = label;
		b.innerHTML = `<span class="dashicons ${ icon }" aria-hidden="true"></span>`;
		b.addEventListener( 'click', onClick );
		toolbar.appendChild( b );
		return b;
	}

	// Launchpad
	mkBtn( __( 'Launchpad', 'bazaar' ), 'dashicons-grid-view', () => {
		if ( launchpad.visible ) {
			launchpad.close();
		} else {
			launchpad.open();
		}
	} );

	const fsBtn = mkBtn( __( 'Fullscreen', 'bazaar' ), 'dashicons-fullscreen-alt', () => {
		toggleFullscreen( root );
		const isFs = root.classList.contains( 'bsh--fullscreen' );
		fsBtn.classList.toggle( 'bsh-toolbar__btn--active', isFs );
	} );

	mkBtn( __( 'Pop out', 'bazaar' ), 'dashicons-external', () => {
		if ( navState.activeSlug && navState.activeSlug !== 'manage' && navState.activeSlug !== 'home' ) {
			const ware = wareMap.get( navState.activeSlug );
			if ( ware ) {
				popOut( serveUrl( ware ), navState.activeSlug );
			}
		}
	} );
}() );

// ===========================================================================
// Taskbar — shows LRU-resident running wares
// ===========================================================================

function renderTaskbar() {
	if ( ! taskbarEl ) {
		return;
	}
	taskbarEl.innerHTML = '';

	if ( iframes.order.length === 0 ) {
		taskbarEl.hidden = true;
		return;
	}
	taskbarEl.hidden = false;

	// Newest first (most recently used at front)
	for ( const slug of [ ...iframes.order ].reverse() ) {
		const ware = wareMap.get( slug );
		const label = slug === 'manage'
			? __( 'Manage Wares', 'bazaar' )
			: ( ware?.menu_title ?? ware?.name ?? slug );

		const item = document.createElement( 'div' );
		item.className = 'bsh-taskbar__item' +
			( slug === navState.activeSlug ? ' bsh-taskbar__item--active' : '' );
		item.dataset.slug = slug;
		item.setAttribute( 'role', 'button' );
		item.setAttribute( 'tabindex', '0' );
		item.setAttribute( 'aria-label', label );
		item.setAttribute( 'aria-pressed', slug === navState.activeSlug ? 'true' : 'false' );

		// Icon
		const iconWrap = document.createElement( 'span' );
		iconWrap.className = 'bsh-taskbar__icon-wrap';
		iconWrap.setAttribute( 'aria-hidden', 'true' );
		if ( ware?.icon ) {
			const img = document.createElement( 'img' );
			img.src = iconUrl( ware );
			img.alt = '';
			img.className = 'bsh-taskbar__icon';
			img.onerror = () => img.remove();
			iconWrap.appendChild( img );
		} else {
			const di = document.createElement( 'span' );
			di.className = 'dashicons ' +
				( slug === 'manage' ? 'dashicons-admin-settings' : 'dashicons-admin-plugins' );
			iconWrap.appendChild( di );
		}
		item.appendChild( iconWrap );

		// Label
		item.appendChild(
			Object.assign( document.createElement( 'span' ), {
				className: 'bsh-taskbar__label',
				textContent: label,
			} )
		);

		// Badge
		const badge = badgeMap.get( slug );
		if ( badge > 0 ) {
			item.appendChild(
				Object.assign( document.createElement( 'span' ), {
					className: 'bsh-taskbar__badge',
					textContent: badge > 99 ? '99+' : String( badge ),
				} )
			);
		}

		// Close button
		const closeBtn = document.createElement( 'button' );
		closeBtn.type = 'button';
		closeBtn.className = 'bsh-taskbar__close';
		closeBtn.setAttribute(
			'aria-label',
			/* translators: %s: ware name */
			sprintf( __( 'Close %s', 'bazaar' ), label )
		);
		closeBtn.innerHTML = '<span class="dashicons dashicons-no-alt" aria-hidden="true"></span>';
		const closedSlug = slug;
		closeBtn.addEventListener( 'click', ( e ) => {
			e.stopPropagation();
			iframes.destroy( closedSlug );
			if ( navState.activeSlug === closedSlug ) {
				const next = [ ...iframes.order ].reverse()[ 0 ] ?? 'home';
				navigateTo( next );
			}
			renderTaskbar();
		} );
		item.appendChild( closeBtn );

		item.addEventListener( 'click', () => navigateTo( slug ) );
		item.addEventListener( 'keydown', ( e ) => {
			if ( e.key === 'Enter' || e.key === ' ' ) {
				e.preventDefault();
				navigateTo( slug );
			}
		} );
		taskbarEl.appendChild( item );
	}
}

// ===========================================================================
// Status bar — ware name, trust badge, clock
// ===========================================================================

function renderStatusBar( slug ) {
	if ( ! statusbarLeft ) {
		return;
	}
	statusbarLeft.innerHTML = '';

	if ( slug && slug !== 'home' ) {
		const ware = slug === 'manage' ? null : wareMap.get( slug );
		const label = slug === 'manage'
			? __( 'Manage Wares', 'bazaar' )
			: ( ware?.menu_title ?? ware?.name ?? slug );

		statusbarLeft.appendChild(
			Object.assign( document.createElement( 'span' ), {
				className: 'bsh-statusbar__ware-name',
				textContent: label,
			} )
		);

		if ( ware ) {
			const trust = ware.trust ?? 'standard';
			const TRUST_ICONS = {
				verified: 'dashicons-shield',
				trusted: 'dashicons-shield-alt',
				standard: 'dashicons-unlock',
			};
			const trustEl = document.createElement( 'span' );
			trustEl.className = 'bsh-statusbar__trust bsh-statusbar__trust--' + trust;
			trustEl.title = trust.charAt( 0 ).toUpperCase() + trust.slice( 1 );
			trustEl.innerHTML =
				`<span class="dashicons ${ TRUST_ICONS[ trust ] ?? 'dashicons-unlock' }" aria-hidden="true"></span>`;
			statusbarLeft.appendChild( trustEl );

			// Dev-mode indicator when ware is running from a Vite dev server.
			if ( ware.dev_url ) {
				const devEl = document.createElement( 'span' );
				devEl.className = 'bsh-statusbar__dev';
				devEl.title = __( 'Dev mode — running from local server', 'bazaar' );
				devEl.textContent = 'DEV';
				statusbarLeft.appendChild( devEl );
			}
		}
	}
}

( function startClock() {
	if ( ! statusbarClock ) {
		return;
	}
	function tick() {
		const now = new Date();
		const h = now.getHours().toString().padStart( 2, '0' );
		const m = now.getMinutes().toString().padStart( 2, '0' );
		statusbarClock.textContent = h + ':' + m;
	}
	tick();
	setInterval( tick, 10_000 );
}() );

// ===========================================================================
// Keyboard shortcuts overlay
// ===========================================================================

( function buildShortcutsOverlay() {
	const overlay = document.createElement( 'div' );
	overlay.className = 'bsh-shortcuts';
	overlay.setAttribute( 'role', 'dialog' );
	overlay.setAttribute( 'aria-modal', 'true' );
	overlay.setAttribute( 'aria-label', __( 'Keyboard shortcuts', 'bazaar' ) );
	overlay.hidden = true;

	const inner = document.createElement( 'div' );
	inner.className = 'bsh-shortcuts__inner';

	// ── Header
	const header = document.createElement( 'div' );
	header.className = 'bsh-shortcuts__header';

	const title = Object.assign( document.createElement( 'h2' ), {
		className: 'bsh-shortcuts__title',
		textContent: __( 'Keyboard Shortcuts', 'bazaar' ),
	} );

	const closeBtn = document.createElement( 'button' );
	closeBtn.type = 'button';
	closeBtn.className = 'bsh-shortcuts__close';
	closeBtn.setAttribute( 'aria-label', __( 'Close shortcuts', 'bazaar' ) );
	closeBtn.innerHTML = '<span class="dashicons dashicons-no-alt" aria-hidden="true"></span>';
	closeBtn.addEventListener( 'click', () => {
		overlay.hidden = true;
	} );
	header.append( title, closeBtn );

	// ── Body
	const body = document.createElement( 'div' );
	body.className = 'bsh-shortcuts__body';

	const SHELL_SHORTCUTS = [
		{ keys: [ '⌘', 'K' ], label: __( 'Open command palette', 'bazaar' ) },
		{ keys: [ '?' ], label: __( 'Show this overlay', 'bazaar' ) },
		{ keys: [ 'F' ], label: __( 'Toggle fullscreen', 'bazaar' ) },
		{ keys: [ '/' ], label: __( 'Focus nav filter', 'bazaar' ) },
		{ keys: [ '⌥', '1–9' ], label: __( 'Switch to nth ware', 'bazaar' ) },
		{ keys: [ 'Esc' ], label: __( 'Close overlay / palette', 'bazaar' ) },
	];

	const shellCol = document.createElement( 'div' );
	shellCol.className = 'bsh-shortcuts__col';

	const shellColTitle = Object.assign( document.createElement( 'h3' ), {
		className: 'bsh-shortcuts__col-title',
		textContent: __( 'Shell', 'bazaar' ),
	} );
	shellCol.appendChild( shellColTitle );

	const dl = document.createElement( 'dl' );
	dl.className = 'bsh-shortcuts__list';
	for ( const { keys, label: lbl } of SHELL_SHORTCUTS ) {
		const dt = document.createElement( 'dt' );
		dt.className = 'bsh-shortcuts__keys';
		for ( const k of keys ) {
			const kbd = Object.assign( document.createElement( 'kbd' ), {
				className: 'bsh-shortcuts__key',
				textContent: k,
			} );
			dt.appendChild( kbd );
		}
		const dd = Object.assign( document.createElement( 'dd' ), {
			className: 'bsh-shortcuts__desc',
			textContent: lbl,
		} );
		dl.append( dt, dd );
	}
	shellCol.appendChild( dl );
	body.appendChild( shellCol );

	// Ware shortcuts column (populated via bazaar:shortcuts postMessages)
	const wareCol = document.createElement( 'div' );
	wareCol.className = 'bsh-shortcuts__col bsh-shortcuts__col--ware';
	wareCol.hidden = true;
	body.appendChild( wareCol );
	shortcutsWareCol = wareCol;

	inner.append( header, body );
	overlay.appendChild( inner );

	overlay.addEventListener( 'click', ( e ) => {
		if ( e.target === overlay ) {
			overlay.hidden = true;
		}
	} );

	document.body.appendChild( overlay );
	shortcutsEl = overlay;
}() );

/**
 * Update the ware-specific shortcuts column in the overlay.
 *
 * @param {string} slug
 * @param {Object} ware
 * @param {Array}  shortcuts Array of { keys: string[], label: string }
 */
function updateWareShortcuts( slug, ware, shortcuts ) {
	if ( ! shortcutsWareCol ) {
		return;
	}
	shortcutsWareCol.innerHTML = '';
	if ( ! shortcuts?.length ) {
		shortcutsWareCol.hidden = true;
		return;
	}
	shortcutsWareCol.hidden = false;

	const colTitle = Object.assign( document.createElement( 'h3' ), {
		className: 'bsh-shortcuts__col-title',
		textContent: ware?.menu_title ?? ware?.name ?? slug,
	} );
	shortcutsWareCol.appendChild( colTitle );

	const dl = document.createElement( 'dl' );
	dl.className = 'bsh-shortcuts__list';
	for ( const { keys, label: lbl } of shortcuts ) {
		const dt = document.createElement( 'dt' );
		dt.className = 'bsh-shortcuts__keys';
		for ( const k of ( Array.isArray( keys ) ? keys : [ keys ] ) ) {
			const kbd = Object.assign( document.createElement( 'kbd' ), {
				className: 'bsh-shortcuts__key',
				textContent: k,
			} );
			dt.appendChild( kbd );
		}
		const dd = Object.assign( document.createElement( 'dd' ), {
			className: 'bsh-shortcuts__desc',
			textContent: lbl,
		} );
		dl.append( dt, dd );
	}
	shortcutsWareCol.appendChild( dl );
}

// ===========================================================================
// Keyboard shortcuts
// ===========================================================================

document.addEventListener( 'keydown', ( e ) => {
	// ⌘K / Ctrl+K → command palette
	if ( ( e.metaKey || e.ctrlKey ) && e.key === 'k' ) {
		e.preventDefault();
		if ( palette.visible ) {
			palette.close();
		} else {
			palette.open();
		}
		return;
	}

	const _active = ( root?.ownerDocument ?? document ).activeElement;
	const _typing =
		[ 'INPUT', 'TEXTAREA', 'SELECT' ].includes( _active?.tagName ?? '' ) ||
		( _active?.isContentEditable ?? false );

	// F → fullscreen (not when typing in an input/editable element).
	if ( e.key === 'F' && ! e.metaKey && ! e.ctrlKey && ! _typing ) {
		toggleFullscreen( root );
		return;
	}

	// ? → keyboard shortcuts overlay (not when typing)
	if ( e.key === '?' && ! e.metaKey && ! e.ctrlKey && ! _typing ) {
		if ( shortcutsEl ) {
			shortcutsEl.hidden = ! shortcutsEl.hidden;
		}
		return;
	}

	// / → focus nav filter when visible and not already typing somewhere.
	if (
		e.key === '/' &&
		! e.metaKey &&
		! e.ctrlKey &&
		filterWrap.classList.contains( 'bsh-nav__filter-wrap--active' ) &&
		! root.classList.contains( 'bsh--collapsed' ) &&
		! _typing
	) {
		e.preventDefault();
		filterInput.focus();
		filterInput.select();
		return;
	}

	// Esc — close any open overlay
	if ( e.key === 'Escape' ) {
		if ( palette.visible ) {
			palette.close();
		} else if ( shortcutsEl && ! shortcutsEl.hidden ) {
			shortcutsEl.hidden = true;
		} else if ( launchpad.visible ) {
			launchpad.close();
		}
	}
} );

// Reload a specific ware (dispatched by context-menu.js)
document.addEventListener( 'bazaar:reload-ware', ( e ) => {
	const slug = e.detail?.slug;
	if ( slug ) {
		iframes.reload( slug );
	}
} );

registerShortcuts( wareMap, navigateTo );

// ===========================================================================
// Nav resize
// ===========================================================================

const LS_NAV_WIDTH = 'bazaar_nav_width';
const LS_COLLAPSED = 'bsh-collapsed';
const NAV_MIN_W = 140;
const NAV_MAX_W = 400;

( function restoreNavWidth() {
	try {
		const saved = parseInt( localStorage.getItem( LS_NAV_WIDTH ), 10 );
		if ( saved >= NAV_MIN_W && saved <= NAV_MAX_W ) {
			root.style.setProperty( '--bsh-nav-width', saved + 'px' );
		}
	} catch {
		/* non-fatal */
	}
}() );

// Restore the nav collapsed/expanded preference saved by the user.
// Applied before the first paint so there's no flash of the wrong layout.
( function restoreCollapsed() {
	try {
		if ( localStorage.getItem( LS_COLLAPSED ) === '1' ) {
			root.classList.add( 'bsh--collapsed' );
			collapse.setAttribute( 'aria-expanded', 'false' );
			collapse.setAttribute( 'aria-label', __( 'Expand navigation', 'bazaar' ) );
		}
	} catch {
		/* non-fatal */
	}
}() );

const resizeHandle = document.getElementById( 'bsh-resize-handle' );
if ( resizeHandle ) {
	resizeHandle.addEventListener( 'mousedown', ( e ) => {
		if ( root.classList.contains( 'bsh--collapsed' ) ) {
			return;
		}
		e.preventDefault();
		const startX = e.clientX;
		const startW = navEl.getBoundingClientRect().width;
		root.classList.add( 'bsh--resizing' );

		const onMove = ( me ) => {
			const w = Math.min(
				NAV_MAX_W,
				Math.max( NAV_MIN_W, startW + me.clientX - startX )
			);
			root.style.setProperty( '--bsh-nav-width', w + 'px' );
		};

		const onUp = ( me ) => {
			const w = Math.min(
				NAV_MAX_W,
				Math.max( NAV_MIN_W, startW + me.clientX - startX )
			);
			root.style.setProperty( '--bsh-nav-width', w + 'px' );
			try {
				localStorage.setItem( LS_NAV_WIDTH, String( Math.round( w ) ) );
			} catch {
				/* non-fatal */
			}
			root.classList.remove( 'bsh--resizing' );
			document.removeEventListener( 'mousemove', onMove );
			document.removeEventListener( 'mouseup', onUp );
		};

		document.addEventListener( 'mousemove', onMove );
		document.addEventListener( 'mouseup', onUp );
	} );
}

// ===========================================================================
// Collapse toggle
// ===========================================================================

collapse.addEventListener( 'click', () => {
	const c = root.classList.toggle( 'bsh--collapsed' );
	collapse.setAttribute( 'aria-expanded', String( ! c ) );
	collapse.setAttribute(
		'aria-label',
		c
			? __( 'Expand navigation', 'bazaar' )
			: __( 'Collapse navigation', 'bazaar' )
	);
	// Persist the new preference so it survives page navigation.
	try {
		localStorage.setItem( LS_COLLAPSED, c ? '1' : '0' );
	} catch {
		/* non-fatal: storage may be full or blocked in private mode */
	}
	// Clear filter when collapsing — it won't be visible anyway.
	if ( c && navFilterQuery ) {
		filterInput.value = '';
		navFilterQuery = '';
		applyNavFilter();
	}
	// ResizeObserver handles per-frame updates during the CSS transition but
	// fire an immediate re-position too for responsiveness on the first frame.
	positionNavPill( navState.activeSlug ?? '' );
} );

navEl.addEventListener( 'click', ( e ) => {
	const btn = e.target.closest( '.bsh-nav__btn' );
	if ( btn ) {
		navigateTo( btn.dataset.slug );
	}
} );

// ===========================================================================
// Boot
// ===========================================================================

// Seed the manage-nav badge from the server-side outdated count.
if ( outdatedCount > 0 ) {
	badgeMap.set( 'manage', outdatedCount );
}

// Collapse nav to icon-only rail when no wares are installed yet.
// renderNav() will lift this once the first enabled ware appears.
if ( ! sortedEnabled( wareMap ).length ) {
	root.classList.add( 'bsh--no-wares' );
}

renderNav();

// Prime badge and health data on initial load, then open the SSE stream.
void pollBadges( badgePollDeps );
void pollHealth( healthPollDeps );
connectSSE( sseDeps );

// Fallback polling — only fires when SSE is not delivering events.
// Paused when the tab is hidden to avoid unnecessary background traffic.
const polling = createPollingFallback( {
	badgePollDeps,
	healthPollDeps,
	BADGE_POLL_INTERVAL_MS,
	HEALTH_POLL_INTERVAL_MS,
} );

document.addEventListener( 'visibilitychange', () => {
	if ( document.hidden ) {
		polling.stop();
		recordView( null );
	} else {
		if ( navState.activeSlug ) {
			// Reset the view timer so the hidden period isn't counted as active time.
			recordView( navState.activeSlug );
		}
		polling.start();
	}
} );

window.addEventListener( 'pagehide', () => recordView( null ) );

polling.start();

// HMR bridge — connect to Vite dev servers for all dev-mode wares.
for ( const ware of wareMap.values() ) {
	if ( ware.dev_url ) {
		connectHmr( ware.slug, ware.dev_url, ( slug ) => iframes.reload( slug ) );
	}
}

// Service worker — always registered for universal asset caching;
// also sends zero-trust permissions when relevant wares are installed.
void initServiceWorker( { swUrl, wareMap } );

const dl = parseDeepLink();
navigateTo( dl.ware ?? 'home', dl.route );
