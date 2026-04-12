/**
 * Bazaar Shell — main entry point.
 *
 * Coordinates all shell modules and owns the top-level application state.
 */

import { __, sprintf } from '@wordpress/i18n';
import './shell.css';

import { connectHmr } from './modules/hmr-bridge.js';

import { TrustAwareLruManager } from './modules/lru.js';
import { SplitView, toggleFullscreen, popOut } from './modules/views.js';
import { WareInspector } from './modules/inspector.js';
import { showError, dismissError } from './modules/errors.js';
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
	pushRecent,
	healthMap,
} from './modules/nav.js';

// ===========================================================================
// Bootstrap
// ===========================================================================

const D = window.bazaarShell ?? {};
const {
	restUrl,
	nonce,
	adminColor,
	manageUrl,
	wares: initialWares,
	branding = {},
	devMode: globalDevMode = false,
	outdatedCount = 0,
	swUrl = null,
} = D;

const LRU_CAP = Math.max(
	3,
	Math.min( 10, Math.floor( ( navigator.deviceMemory ?? 4 ) * 1.5 ) )
);

// ===========================================================================
// State
// ===========================================================================

let activeSlug = null;
let navFilterQuery = '';

/** @type {Map<string, Object>} slug → index entry */
const wareMap = new Map( ( initialWares ?? [] ).map( ( w ) => [ w.slug, w ] ) );
/** @type {Map<string, number>} slug → badge count */
const badgeMap = new Map();

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

// Fail loudly in development; degrade gracefully in production when the shell
// template is missing a required element rather than throwing a cascade of
// null-dereference TypeErrors throughout the module.
if ( ! navList || ! navFooter || ! navEl || ! main || ! loading || ! collapse || ! root ) {
	// eslint-disable-next-line no-console
	console.error( '[Bazaar] Shell template is missing required elements. Shell will not start.' );
	throw new Error( 'Bazaar shell: missing required DOM elements' );
}

// Toast container
const toastEl = document.createElement( 'div' );
toastEl.className = 'bsh-toasts';
document.body.appendChild( toastEl );

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

filterInput.addEventListener( 'input', () => {
	navFilterQuery = filterInput.value.trim().toLowerCase();
	applyNavFilter();
} );

filterInput.addEventListener( 'keydown', ( e ) => {
	if ( e.key === 'Escape' ) {
		filterInput.value = '';
		navFilterQuery = '';
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
const splitView = new SplitView( main, Math.max( 2, Math.floor( LRU_CAP / 2 ) ) );
const inspector = new WareInspector();

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
// Command Palette  (with federated search)
// ===========================================================================

class CommandPalette {
	constructor( onSelect ) {
		this.onSelect = onSelect;
		this.visible = false;
		this.items = [];
		this.sel = 0;
		this._searchTimer = null;

		this.overlay = Object.assign( document.createElement( 'div' ), {
			className: 'bsh-palette',
		} );
		this.overlay.setAttribute( 'role', 'dialog' );
		this.overlay.setAttribute(
			'aria-label',
			__( 'Command palette', 'bazaar' )
		);
		this.overlay.setAttribute( 'aria-modal', 'true' );
		this.overlay.hidden = true;

		this.input = Object.assign( document.createElement( 'input' ), {
			type: 'text',
			className: 'bsh-palette__input',
			placeholder: __(
				'Search wares, content, actions… (↑↓ navigate · Enter open · Esc close)',
				'bazaar'
			),
			autocomplete: 'off',
			spellcheck: false,
		} );

		this.list = Object.assign( document.createElement( 'ul' ), {
			className: 'bsh-palette__list',
		} );
		this.list.setAttribute( 'role', 'listbox' );

		const inner = document.createElement( 'div' );
		inner.className = 'bsh-palette__inner';
		inner.append( this.input, this.list );
		this.overlay.appendChild( inner );
		document.body.appendChild( this.overlay );

		this.input.addEventListener( 'input', () => {
			clearTimeout( this._searchTimer );
			this._searchTimer = setTimeout( () => {
				void this._render().catch( ( err ) => {
					// eslint-disable-next-line no-console
					console.error( '[Bazaar] Palette render failed:', err );
				} );
			}, 150 );
		} );
		this.input.addEventListener( 'keydown', ( e ) => this._key( e ) );
		this.overlay.addEventListener( 'click', ( e ) => {
			if ( e.target === this.overlay ) {
				this.close();
			}
		} );
	}

	open() {
		this.visible = true;
		this.overlay.hidden = false;
		this.input.value = '';
		void this._render().catch( ( err ) => {
			// eslint-disable-next-line no-console
			console.error( '[Bazaar] Palette render failed:', err );
		} );
		this.input.focus();
		document.body.classList.add( 'bsh-palette-open' );
	}
	close() {
		this.visible = false;
		this.overlay.hidden = true;
		document.body.classList.remove( 'bsh-palette-open' );
	}

	async _render() {
		const q = this.input.value.trim();
		const ql = q.toLowerCase();

		const all = [
			{
				slug: 'manage',
				label: __( 'Manage Wares', 'bazaar' ),
				meta: 'settings',
				type: 'ware',
			},
			...sortedEnabled( wareMap ).map( ( w ) => ( {
				slug: w.slug,
				label: w.menu_title ?? w.name,
				meta: w.enabled
					? __( 'ware', 'bazaar' )
					: __( 'disabled', 'bazaar' ),
				type: 'ware',
			} ) ),
		];

		const wareItems = q
			? all.filter(
				( i ) =>
					String( i.label ?? '' ).toLowerCase().includes( ql ) ||
						String( i.slug ?? '' ).includes( ql )
			)
			: all;

		let items = wareItems;

		// Federated search: query registered ware search endpoints.
		if ( q.length >= 2 ) {
			const fedResults = await this._fedSearch( q );
			items = [ ...wareItems, ...fedResults ];
		}

		this.items = items;
		this.sel = 0;
		this.list.innerHTML = '';

		if ( ! items.length ) {
			const li = document.createElement( 'li' );
			li.className = 'bsh-palette__empty';
			li.textContent = __( 'No results.', 'bazaar' );
			this.list.appendChild( li );
			return;
		}

		items.forEach( ( item, i ) => {
			const li = document.createElement( 'li' );
			li.className =
				'bsh-palette__item' +
				( i === 0 ? ' bsh-palette__item--sel' : '' );
			li.setAttribute( 'role', 'option' );
			li.setAttribute( 'aria-selected', i === 0 ? 'true' : 'false' );
			li.dataset.slug = item.slug ?? '';
			li.innerHTML =
				`<span class="bsh-palette__lbl">${ esc( item.label ) }</span>` +
				`<span class="bsh-palette__meta bsh-palette__meta--${ item.type ?? 'ware' }">${ esc( item.meta ?? '' ) }</span>`;
			li.addEventListener( 'click', () => {
				if ( item.url ) {
					openExternal( item.url );
				} else {
					this.onSelect( item.slug );
				}
				this.close();
			} );
			li.addEventListener( 'mouseenter', () => this._sel( i ) );
			this.list.appendChild( li );
		} );
	}

	async _fedSearch( query ) {
		const results = [];
		for ( const [ slug, ware ] of wareMap ) {
			const searchEndpoint = ware.search_endpoint;
			if ( ! searchEndpoint ) {
				continue;
			}
			try {
				const r = await fetch(
					`${ restUrl }/${ searchEndpoint }?q=${ encodeURIComponent( query ) }`,
					{
						headers: { 'X-WP-Nonce': nonce },
						signal: AbortSignal.timeout
							? AbortSignal.timeout( 2000 )
							: ( () => {
								const c = new AbortController(); setTimeout( () => c.abort(), 2000 ); return c.signal;
							} )(),
					}
				);
				if ( ! r.ok ) {
					continue;
				}
				const items = await r.json();
				if ( ! Array.isArray( items ) ) {
					continue;
				}
				for ( const item of items ) {
					results.push( {
						slug: item.slug ?? slug,
						label: item.label ?? item.title ?? item.name,
						meta: `${ ware.menu_title ?? ware.name } › ${ item.type ?? 'result' }`,
						url: item.url,
						type: 'search',
						ware: slug,
					} );
				}
			} catch {
				/* non-fatal */
			}
		}
		return results;
	}

	_sel( i ) {
		this.list.querySelectorAll( '.bsh-palette__item' ).forEach( ( el, j ) => {
			const a = j === i;
			el.classList.toggle( 'bsh-palette__item--sel', a );
			el.setAttribute( 'aria-selected', a ? 'true' : 'false' );
		} );
		this.sel = i;
	}

	_key( e ) {
		const n = this.items.length;
		if ( ! n ) {
			return;
		}
		if ( e.key === 'ArrowDown' ) {
			e.preventDefault();
			this._sel( ( this.sel + 1 ) % n );
		}
		if ( e.key === 'ArrowUp' ) {
			e.preventDefault();
			this._sel( ( this.sel - 1 + n ) % n );
		}
		if ( e.key === 'Enter' ) {
			e.preventDefault();
			const item = this.items[ this.sel ];
			if ( item ) {
				if ( item.url ) {
					openExternal( item.url );
				} else {
					this.onSelect( item.slug );
				}
				this.close();
			}
		}
		if ( e.key === 'Escape' ) {
			this.close();
		}
	}
}

// ===========================================================================
// Toast Manager
// ===========================================================================

class ToastManager {
	constructor( container ) {
		this.el = container;
	}
	show( message, level = 'info', ms = 4000 ) {
		const ICONS = { success: '✓', warning: '⚠', error: '✕', info: 'ℹ' };
		const t = document.createElement( 'div' );
		t.className = `bsh-toast bsh-toast--${ level }`;
		t.setAttribute( 'role', 'alert' );
		t.innerHTML =
			`<span class="bsh-toast__icon" aria-hidden="true">${ ICONS[ level ] ?? 'ℹ' }</span>` +
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
	broadcast( event, data, fromSlug ) {
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
	}
}

// ===========================================================================
// Clipboard
// ===========================================================================

class ShellClipboard {
	constructor() {
		this._data = null;
		this._mime = null;
	}
	copy( data, mime = 'application/json' ) {
		this._data = data;
		this._mime = mime;
	}
	paste( mime ) {
		if ( mime && mime !== this._mime ) {
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
const palette = new CommandPalette( navigateTo );

function esc( s ) {
	return String( s )
		.replace( /&/g, '&amp;' )
		.replace( /</g, '&lt;' )
		.replace( />/g, '&gt;' )
		.replace( /"/g, '&quot;' );
}

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
	u.searchParams.set( '_wpnonce', nonce );
	u.searchParams.set( '_adminColor', adminColor ?? 'fresh' );
	return u.toString();
}

function iconUrl( ware ) {
	return `${ restUrl }/serve/${ encodeURIComponent( ware.slug ) }/${ encodeURIComponent( ware.icon ?? 'icon.svg' ) }?_wpnonce=${ nonce }`;
}

/** Return all active LRU managers (primary + secondary if split). */
function activeLrus() {
	return splitView.active
		? [ iframes, splitView.secondLru ].filter( Boolean )
		: [ iframes ];
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
	if ( slug && slug !== 'manage' ) {
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
}

// ===========================================================================
// Nav rendering
// ===========================================================================

function renderNav() {
	const hadNoWares = root.classList.contains( 'bsh--no-wares' );

	navList.innerHTML = '';
	navFooter.innerHTML = '';

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
		activeSlug,
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
					activeSlug,
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
					activeSlug,
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
				activeSlug,
				badgeMap
			)
		);
	}

	for ( const [ gName, gWares ] of groups ) {
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
					activeSlug,
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
	applyNavFilter();
}

// Nav refresh event (from drag/pin toggles).
document.addEventListener( 'bazaar:nav-refresh', () => renderNav() );

// ===========================================================================
// Analytics
// ===========================================================================

let _viewSlug = null;
let _viewStart = 0;

function recordView( newSlug ) {
	if ( _viewSlug && _viewSlug !== newSlug && _viewStart ) {
		fetch( `${ restUrl }/analytics`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'X-WP-Nonce': nonce,
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

// ===========================================================================
// Toolbar context breadcrumb
// ===========================================================================

function renderToolbarContext( slug ) {
	if ( ! toolbarContext ) {
		return;
	}
	toolbarContext.innerHTML = '';

	if ( ! slug ) {
		return;
	}

	const isManage = slug === 'manage';
	const ware = isManage ? null : wareMap.get( slug );
	const label = isManage
		? __( 'Manage Wares', 'bazaar' )
		: ( ware?.menu_title ?? ware?.name ?? slug );

	// Breadcrumb button opens the command palette for quick switching.
	const btn = document.createElement( 'button' );
	btn.type = 'button';
	btn.className = 'bsh-toolbar__context-btn';
	btn.setAttribute( 'aria-label', __( 'Switch ware (⌘K)', 'bazaar' ) );
	btn.title = __( 'Switch ware · ⌘K', 'bazaar' );

	const iconEl = document.createElement( 'span' );
	iconEl.setAttribute( 'aria-hidden', 'true' );

	if ( isManage ) {
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
}

// ===========================================================================
// Navigation
// ===========================================================================

function navigateTo( slug, route, toSecondary = false ) {
	if ( ! slug ) {
		return;
	}

	// Guard: non-manage slugs must exist in the registry.
	if ( slug !== 'manage' && ! wareMap.has( slug ) ) {
		return;
	}

	// Close the mobile drawer on navigation.
	closeMobileNav();

	if ( toSecondary && splitView.active ) {
		const url =
			slug === 'manage' ? manageUrl : serveUrl( wareMap.get( slug ) );
		splitView.activateSecondary( slug, url );
		return;
	}

	activeSlug = slug;
	updateUrl( slug, route );
	pushRecent( slug );
	recordView( slug );
	renderToolbarContext( slug );

	navEl.querySelectorAll( '.bsh-nav__btn' ).forEach( ( btn ) => {
		const a = btn.dataset.slug === slug;
		btn.classList.toggle( 'bsh-nav__btn--active', a );
		if ( a ) {
			btn.setAttribute( 'aria-current', 'page' );
		} else {
			btn.removeAttribute( 'aria-current' );
		}
	} );

	const url =
		slug === 'manage' ? manageUrl : serveUrl( wareMap.get( slug ) );
	const had = iframes.frames.has( slug );

	dismissError( slug );
	iframes.activate( slug, url );

	if ( had ) {
		loading.hidden = true;
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
		f?.addEventListener(
			'load',
			() => {
				loading.hidden = true;
				if ( route ) {
					f.contentWindow?.postMessage(
						{ type: 'bazaar:route', route },
						window.location.origin
					);
				}
			},
			{ once: true }
		);
	}
}

// ===========================================================================
// Health checks
// ===========================================================================

async function pollHealth() {
	try {
		const r = await fetch( `${ restUrl }/health`, {
			headers: { 'X-WP-Nonce': nonce },
		} );
		if ( ! r.ok ) {
			return;
		}
		const list = await r.json();
		if ( ! Array.isArray( list ) ) {
			return;
		}
		let dirty = false;
		for ( const { slug, status } of list ) {
			if ( healthMap.get( slug ) !== status ) {
				healthMap.set( slug, status );
				dirty = true;
			}
		}
		if ( dirty ) {
			renderNav();
		}
	} catch {
		/* non-fatal */
	}
}

// ===========================================================================
// Badge polling + SSE
// ===========================================================================

async function pollBadges() {
	try {
		const r = await fetch( `${ restUrl }/badges`, {
			headers: { 'X-WP-Nonce': nonce },
		} );
		if ( ! r.ok ) {
			return;
		}
		const badges = await r.json();
		if ( ! Array.isArray( badges ) ) {
			return;
		}
		let dirty = false;
		for ( const { slug, count } of badges ) {
			if ( badgeMap.get( slug ) !== count ) {
				badgeMap.set( slug, count );
				dirty = true;
			}
		}
		if ( dirty ) {
			renderNav();
		}
	} catch {
		/* non-fatal */
	}
}

let _sseDelay = 5_000;
const SSE_MAX_DELAY = 5 * 60_000;

function connectSSE() {
	const u = new URL( `${ restUrl }/stream` );
	u.searchParams.set( '_wpnonce', nonce );
	const src = new EventSource( u.toString(), { withCredentials: true } );

	src.addEventListener( 'open', () => {
		_sseDelay = 5_000; // Reset backoff after a clean connection.
	} );

	src.addEventListener( 'badge', ( e ) => {
		try {
			const { slug, count } = JSON.parse( e.data );
			badgeMap.set( slug, count );
			renderNav();
		} catch { /* malformed SSE payload — skip */ }
	} );
	src.addEventListener( 'toast', ( e ) => {
		try {
			const { message, level } = JSON.parse( e.data );
			toasts.show( message, level );
		} catch { /* malformed SSE payload — skip */ }
	} );
	src.addEventListener( 'ware-installed', ( e ) => {
		try {
			const d = JSON.parse( e.data );
			wareMap.set( d.slug, d );
			renderNav();
			navigateTo( d.slug );
			toasts.show(
				sprintf( /* translators: %s: ware name */ __( '%s is ready', 'bazaar' ), d.name ?? d.slug ),
				'success',
				3000
			);
		} catch { /* malformed SSE payload — skip */ }
	} );
	src.addEventListener( 'ware-deleted', ( e ) => {
		try {
			const { slug } = JSON.parse( e.data );
			wareMap.delete( slug );
			iframes.destroy( slug );
			if ( activeSlug === slug ) {
				navigateTo( 'manage' );
			}
			renderNav();
		} catch { /* malformed SSE payload — skip */ }
	} );
	src.addEventListener( 'ware-toggled', ( e ) => {
		try {
			const { slug, enabled } = JSON.parse( e.data );
			const w = wareMap.get( slug );
			if ( w ) {
				w.enabled = enabled;
				if ( ! enabled && activeSlug === slug ) {
					navigateTo( 'manage' );
				}
			}
			renderNav();
		} catch { /* malformed SSE payload — skip */ }
	} );
	src.addEventListener( 'health', ( e ) => {
		try {
			const { slug, status } = JSON.parse( e.data );
			healthMap.set( slug, status );
			renderNav();
		} catch { /* malformed SSE payload — skip */ }
	} );

	src.onerror = () => {
		src.close();
		setTimeout( connectSSE, _sseDelay );
		_sseDelay = Math.min( _sseDelay * 2, SSE_MAX_DELAY );
	};
}

// ===========================================================================
// Shared data cache proxy
// ===========================================================================

const _dataCache = new Map();
const DATA_CACHE_MAX = 200;

async function cacheQuery( id, path, targetWindow ) {
	// Only proxy paths within the Bazaar namespace — prevents a ware from
	// using the shell's admin nonce to fetch arbitrary WordPress REST data.
	if ( typeof path !== 'string' || ! path.startsWith( '/bazaar/v1/' ) ) {
		return;
	}

	const cached = _dataCache.get( path );
	if ( cached && Date.now() - cached.ts < 60_000 ) {
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
	try {
		const r = await fetch(
			`${ restUrl.replace( /\/bazaar\/v1$/, '' ) }${ path }`,
			{ headers: { 'X-WP-Nonce': nonce } }
		);
		const d = await r.json();
		// Evict oldest entry when cache is full (simple FIFO).
		if ( _dataCache.size >= DATA_CACHE_MAX ) {
			_dataCache.delete( _dataCache.keys().next().value );
		}
		_dataCache.set( path, { data: d, ts: Date.now() } );
		try {
			targetWindow.postMessage(
				{ type: 'bazaar:query-response', id, data: d },
				window.location.origin
			);
		} catch {
			/* target window may have been closed */
		}
	} catch {
		/* non-fatal */
	}
}

// ===========================================================================
// postMessage hub
// ===========================================================================

window.addEventListener( 'message', ( event ) => {
	if ( event.origin !== window.location.origin ) {
		return;
	}
	const { type, ...p } = event.data ?? {};
	const fromSlug = slugForWindow( event.source );

	switch ( type ) {
		// Lifecycle
		case 'bazaar:ware-installed':
			if ( p.ware?.slug ) {
				wareMap.set( p.ware.slug, p.ware );
				renderNav();
				navigateTo( p.ware.slug );
				toasts.show(
					sprintf( /* translators: %s: ware name */ __( '%s is ready', 'bazaar' ), p.ware.name ?? p.ware.slug ),
					'success',
					3000
				);
			}
			break;
		case 'bazaar:ware-deleted':
			if ( p.slug ) {
				wareMap.delete( p.slug );
				iframes.destroy( p.slug );
				if ( activeSlug === p.slug ) {
					navigateTo( 'manage' );
				}
				renderNav();
			}
			break;
		case 'bazaar:ware-toggled':
			{
				const w = wareMap.get( p.slug );
				if ( w ) {
					w.enabled = p.enabled;
					if ( ! p.enabled && activeSlug === p.slug ) {
						navigateTo( 'manage' );
					}
				}
				renderNav();
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
				inspector.onBusLog( {
					ts: Date.now(),
					dir: 'emit',
					event: p.event,
					data: p.data,
				} );
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
		case 'bazaar:badge':
			if ( fromSlug ) {
				badgeMap.set( fromSlug, p.count ?? 0 );
				renderNav();
			}
			break;
		case 'bazaar:navigate':
			navigateTo( p.ware, p.route, p.secondary ?? false );
			break;

		// Data cache
		case 'bazaar:query':
			if ( p.id && p.path ) {
				cacheQuery( p.id, p.path, event.source );
			}
			break;

		// Clipboard
		case 'bazaar:copy':
			clipboard.copy( p.data, p.mime );
			break;
		case 'bazaar:paste':
			event.source.postMessage(
				{
					type: 'bazaar:paste-response',
					id: p.id,
					data: clipboard.paste( p.mime ),
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
						'X-WP-Nonce': nonce,
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

		// Inspector telemetry
		case 'bazaar:api-call':
			if ( fromSlug ) {
				inspector.onApiCall( { ...p, ts: Date.now() } );
			}
			break;
		case 'bazaar:bus-log':
			if ( fromSlug ) {
				inspector.onBusLog( { ...p, ts: Date.now() } );
			}
			break;
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

	const fsBtn = mkBtn( __( 'Fullscreen', 'bazaar' ), 'dashicons-fullscreen-alt', () => {
		toggleFullscreen( root );
		const isFs = root.classList.contains( 'bsh--fullscreen' );
		fsBtn.classList.toggle( 'bsh-toolbar__btn--active', isFs );
	} );

	mkBtn( __( 'Pop out', 'bazaar' ), 'dashicons-external', () => {
		if ( activeSlug && activeSlug !== 'manage' ) {
			const ware = wareMap.get( activeSlug );
			if ( ware ) {
				popOut( serveUrl( ware ), activeSlug );
			}
		}
	} );

	if ( globalDevMode ) {
	}
}() );

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
	// F → fullscreen (not when typing in an input/editable element).
	// Use a known element's ownerDocument to access activeElement rather than
	// reading it off the global document object.
	const _active = ( root?.ownerDocument ?? document ).activeElement;
	if (
		e.key === 'F' &&
		! e.metaKey &&
		! e.ctrlKey &&
		! [ 'INPUT', 'TEXTAREA', 'SELECT' ].includes( _active?.tagName ?? '' ) &&
		! _active?.isContentEditable
	) {
		toggleFullscreen( root );
		return;
	}
	// / → focus nav filter when visible and not already typing somewhere.
	const _activeEl = ( root?.ownerDocument ?? document ).activeElement;
	if (
		e.key === '/' &&
		! e.metaKey &&
		! e.ctrlKey &&
		filterWrap.classList.contains( 'bsh-nav__filter-wrap--active' ) &&
		! root.classList.contains( 'bsh--collapsed' ) &&
		! [ 'INPUT', 'TEXTAREA', 'SELECT' ].includes( _activeEl?.tagName ?? '' ) &&
		! _activeEl?.isContentEditable
	) {
		e.preventDefault();
		filterInput.focus();
		filterInput.select();
		return;
	}

	// Esc
	if ( e.key === 'Escape' ) {
		if ( palette.visible ) {
			palette.close();
		}
	}
} );

registerShortcuts( wareMap, navigateTo );

// ===========================================================================
// Nav resize
// ===========================================================================

const LS_NAV_WIDTH = 'bazaar_nav_width';
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
	// Clear filter when collapsing — it won't be visible anyway.
	if ( c && navFilterQuery ) {
		filterInput.value = '';
		navFilterQuery = '';
		applyNavFilter();
	}
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
pollBadges();
pollHealth();
connectSSE();
setInterval( pollBadges, 30_000 );
setInterval( pollHealth, 60_000 );

// HMR bridge — connect to Vite dev servers for all dev-mode wares.
for ( const ware of wareMap.values() ) {
	if ( ware.dev_url ) {
		connectHmr( ware.slug, ware.dev_url, ( slug ) => iframes.reload( slug ) );
	}
}

// Service worker — always registered for universal asset caching;
// also sends zero-trust permissions when relevant wares are installed.
( async function initServiceWorker() {
	if ( ! ( 'serviceWorker' in navigator ) ) {
		return;
	}

	try {
		const reg = await navigator.serviceWorker.register(
			swUrl ??
				`${ window.location.origin }/wp-json/bazaar/v1/sw`,
			{ scope: '/' }
		);

		// Send zero-trust permissions for wares that require network enforcement.
		const ztWares = [ ...wareMap.values() ].filter(
			( w ) => w.zero_trust && w.permissions?.network
		);
		if ( ! ztWares.length ) {
			return;
		}

		const sendInit = () => {
			const permissions = Object.fromEntries(
				ztWares.map( ( w ) => [ w.slug, w.permissions.network ] )
			);
			reg.active?.postMessage( {
				type: 'bazaar:zt-init',
				permissions,
				origin: window.location.origin,
			} );
		};

		if ( reg.active ) {
			sendInit();
		} else {
			reg.addEventListener( 'updatefound', () =>
				reg.installing?.addEventListener( 'statechange', () => {
					if ( reg.active ) {
						sendInit();
					}
				} )
			);
		}
	} catch {
		// SW registration failure is non-fatal.
	}
}() );

const dl = parseDeepLink();
const firstEnabled = sortedEnabled( wareMap )[ 0 ];
navigateTo( dl.ware ?? firstEnabled?.slug ?? 'manage', dl.route );
