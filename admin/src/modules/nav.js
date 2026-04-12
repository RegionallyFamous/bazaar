/**
 * Bazaar Shell — nav rail rendering + interactions.
 *
 * Features owned by this module:
 *   - Group headers (collapsible)
 *   - Drag-to-reorder (HTML5 DnD → localStorage + user-meta)
 *   - Pinned wares (⭐ per item → localStorage)
 *   - Recent wares queue (last 5, auto-populated)
 *   - Alt+1…9 keyboard shortcuts
 *   - Health-check status dots
 */

import { __, sprintf } from '@wordpress/i18n';
import { esc } from '../shared/escape.js';

// ─── Persistence helpers ───────────────────────────────────────────────────

const LS_ORDER = 'bazaar_nav_order';
const LS_PINNED = 'bazaar_nav_pinned';
const LS_RECENT = 'bazaar_nav_recent';

function lsGet( key, fallback ) {
	try {
		return JSON.parse( localStorage.getItem( key ) ) ?? fallback;
	} catch {
		return fallback;
	}
}
function lsSet( key, val ) {
	try {
		localStorage.setItem( key, JSON.stringify( val ) );
	} catch {
		/* non-fatal */
	}
}

// ─── State (module-level singletons) ──────────────────────────────────────

// Ensure every persisted value is the expected type; corrupt JSON could produce
// a non-array which would throw inside the Set constructor or array methods.
const _toArray = ( v ) => ( Array.isArray( v ) ? v : [] );

/** @type {string[]} - ordered list of slugs; absent slugs go after this list */
export const navOrder = _toArray( lsGet( LS_ORDER, [] ) );

/** @type {Set<string>} - pinned slugs */
export const pinnedSet = new Set( _toArray( lsGet( LS_PINNED, [] ) ) );

/** @type {string[]} - up to 5 recently-visited slugs, newest first */
export const recentList = _toArray( lsGet( LS_RECENT, [] ) );

// ─── Persistence writers ────────────────────────────────────────────────────

export function saveOrder() {
	lsSet( LS_ORDER, navOrder );
}
export function savePinned() {
	lsSet( LS_PINNED, [ ...pinnedSet ] );
}
export function saveRecent() {
	lsSet( LS_RECENT, recentList.slice( 0, 5 ) );
}

// ─── Recent queue ───────────────────────────────────────────────────────────

/**
 * Push a slug to the front of the recent queue (deduplicated, max 5).
 * @param {string} slug
 */
export function pushRecent( slug ) {
	if ( slug === 'manage' || slug === 'home' ) {
		return;
	}
	const idx = recentList.indexOf( slug );
	if ( idx !== -1 ) {
		recentList.splice( idx, 1 );
	}
	recentList.unshift( slug );
	while ( recentList.length > 5 ) {
		recentList.pop();
	}
	saveRecent();
}

// ─── Ordered ware list ──────────────────────────────────────────────────────

/**
 * Return enabled wares sorted by: pinned first, then navOrder, then name.
 * @param {Map<string, Object>} wareMap
 * @return {Object[]} Sorted array of enabled ware index entries.
 */
export function sortedEnabled( wareMap ) {
	const enabled = [ ...wareMap.values() ].filter( ( w ) => w.enabled );
	const orderIdx = ( s ) => {
		const i = navOrder.indexOf( s );
		return i === -1 ? Infinity : i;
	};
	return enabled.sort( ( a, b ) => {
		const ap = pinnedSet.has( a.slug ) ? 0 : 1;
		const bp = pinnedSet.has( b.slug ) ? 0 : 1;
		if ( ap !== bp ) {
			return ap - bp;
		}
		return (
			orderIdx( a.slug ) - orderIdx( b.slug ) || ( a.name ?? '' ).localeCompare( b.name ?? '' )
		);
	} );
}

// ─── Health dots ────────────────────────────────────────────────────────────

/** @type {Map<string, 'ok'|'warn'|'error'|'unknown'>} */
export const healthMap = new Map();

// ─── Sort cache ─────────────────────────────────────────────────────────────

/** Cached result of sortedEnabled(); null means stale and must be rebuilt. */
let _sortCache = null;

/**
 * Invalidate the sortedEnabled cache.
 * Call whenever wareMap, pinnedSet, or navOrder change structurally.
 */
export function invalidateSortCache() {
	_sortCache = null;
}

// ─── Targeted nav patching ───────────────────────────────────────────────────

/**
 * Update only the badge `<span>` elements on existing nav items.
 * Avoids a full nav rebuild when only notification counts change.
 *
 * @param {HTMLUListElement}   navList
 * @param {Map<string,number>} badgeMap
 */
export function patchNavBadges( navList, badgeMap ) {
	navList.querySelectorAll( '.bsh-nav__item[data-slug]' ).forEach( ( li ) => {
		const slug = li.dataset.slug;
		const count = badgeMap.get( slug ) ?? 0;
		const btn = li.querySelector( '.bsh-nav__btn' );
		if ( ! btn ) {
			return;
		}
		let badge = btn.querySelector( '.bsh-nav__badge' );
		if ( count > 0 ) {
			const text = count > 99 ? '99+' : String( count );
			if ( badge ) {
				badge.textContent = text;
				// translators: %d: number of notifications
				badge.setAttribute( 'aria-label', sprintf( __( '%d notifications', 'bazaar' ), count ) );
			} else {
				badge = Object.assign( document.createElement( 'span' ), {
					className: 'bsh-nav__badge',
					textContent: text,
				} );
				// translators: %d: number of notifications
				badge.setAttribute( 'aria-label', sprintf( __( '%d notifications', 'bazaar' ), count ) );
				btn.appendChild( badge );
			}
		} else if ( badge ) {
			badge.remove();
		}
	} );
}

/**
 * Update only the health-dot `<span>` elements on existing nav items.
 * Avoids a full nav rebuild when only health statuses change.
 *
 * @param {HTMLUListElement}   navList
 * @param {Map<string,string>} patchHealthMap
 */
export function patchNavHealth( navList, patchHealthMap ) {
	const labels = {
		ok: __( 'Healthy', 'bazaar' ),
		warn: __( 'Degraded', 'bazaar' ),
		error: __( 'Unhealthy', 'bazaar' ),
	};
	navList.querySelectorAll( '.bsh-nav__item[data-slug]' ).forEach( ( li ) => {
		const btn = li.querySelector( '.bsh-nav__btn' );
		if ( ! btn ) {
			return;
		}
		const slug = li.dataset.slug;
		const status = patchHealthMap.get( slug );
		let hd = btn.querySelector( '.bsh-nav__health' );
		if ( status && status !== 'unknown' ) {
			if ( hd ) {
				hd.className = `bsh-nav__health bsh-nav__health--${ status }`;
				hd.title = labels[ status ] ?? '';
			} else {
				hd = Object.assign( document.createElement( 'span' ), {
					className: `bsh-nav__health bsh-nav__health--${ status }`,
				} );
				hd.title = labels[ status ] ?? '';
				hd.setAttribute( 'aria-hidden', 'true' );
				btn.appendChild( hd );
			}
		} else if ( hd ) {
			hd.remove();
		}
	} );
}

// ─── DOM builders ───────────────────────────────────────────────────────────

function dashicon( cls ) {
	return Object.assign( document.createElement( 'span' ), {
		className: `dashicons ${ cls }`,
	} );
}

/**
 * Build a single nav item `<li>`.
 *
 * @param {string}                                                                                                      slug
 * @param {{label:string, icon?:string, di?:string, devMode?:boolean, badge?:number, grouped?:boolean, health?:string}} opts
 * @param {string|null}                                                                                                 activeSlug
 * @param {Map<string,number>}                                                                                          badgeMap
 * @return {HTMLLIElement} The constructed nav item element.
 */
export function buildItem(
	slug,
	{ label, icon, svgIcon, di, devMode, grouped },
	activeSlug,
	badgeMap
) {
	const li = document.createElement( 'li' );
	li.className = 'bsh-nav__item' + ( grouped ? ' bsh-nav__item--grouped' : '' );
	li.setAttribute( 'draggable', 'true' );
	li.dataset.slug = slug;

	const btn = document.createElement( 'button' );
	btn.type = 'button';
	btn.className =
		'bsh-nav__btn' + ( slug === activeSlug ? ' bsh-nav__btn--active' : '' );
	btn.dataset.slug = slug;
	btn.title = label;
	btn.setAttribute( 'aria-label', label );
	if ( slug === activeSlug ) {
		btn.setAttribute( 'aria-current', 'page' );
	}

	// ── icon
	const wrap = document.createElement( 'span' );
	wrap.className = 'bsh-nav__icon-wrap';
	wrap.setAttribute( 'aria-hidden', 'true' );
	if ( svgIcon ) {
		const tmp = document.createElement( 'span' );
		tmp.innerHTML = svgIcon;
		wrap.appendChild( tmp.firstChild );
	} else if ( icon ) {
		const img = Object.assign( document.createElement( 'img' ), {
			src: icon,
			alt: '',
			width: 20,
			height: 20,
		} );
		img.onerror = () =>
			img.replaceWith( dashicon( 'dashicons-admin-plugins' ) );
		wrap.appendChild( img );
	} else {
		wrap.appendChild( dashicon( di ?? 'dashicons-admin-plugins' ) );
	}

	// ── label
	const lbl = Object.assign( document.createElement( 'span' ), {
		className: 'bsh-nav__label',
		textContent: label,
	} );

	btn.append( wrap, lbl );

	// ── dev dot
	if ( devMode ) {
		btn.appendChild(
			Object.assign( document.createElement( 'span' ), {
				className: 'bsh-nav__dev-dot',
				title: __( 'Dev mode', 'bazaar' ),
			} )
		);
	}

	// ── health dot
	const health = healthMap.get( slug );
	if ( health && health !== 'unknown' ) {
		const hd = Object.assign( document.createElement( 'span' ), {
			className: `bsh-nav__health bsh-nav__health--${ health }`,
		} );
		hd.title =
			{
				ok: __( 'Healthy', 'bazaar' ),
				warn: __( 'Degraded', 'bazaar' ),
				error: __( 'Unhealthy', 'bazaar' ),
			}[ health ] ?? '';
		hd.setAttribute( 'aria-hidden', 'true' );
		btn.appendChild( hd );
	}

	// ── badge
	const badge = badgeMap.get( slug );
	if ( badge > 0 ) {
		const b = Object.assign( document.createElement( 'span' ), {
			className: 'bsh-nav__badge',
			textContent: badge > 99 ? '99+' : String( badge ),
		} );
		b.setAttribute(
			'aria-label',
			// translators: %d: number of notifications
			sprintf( __( '%d notifications', 'bazaar' ), badge )
		);
		btn.appendChild( b );
	}

	// ── pin button
	const pinBtn = document.createElement( 'button' );
	pinBtn.type = 'button';
	pinBtn.className =
		'bsh-nav__pin' + ( pinnedSet.has( slug ) ? ' bsh-nav__pin--active' : '' );
	pinBtn.setAttribute(
		'aria-label',
		pinnedSet.has( slug ) ? __( 'Unpin', 'bazaar' ) : __( 'Pin to top', 'bazaar' )
	);
	pinBtn.title = pinnedSet.has( slug )
		? __( 'Unpin', 'bazaar' )
		: __( 'Pin to top', 'bazaar' );
	pinBtn.innerHTML = '⭐';
	pinBtn.addEventListener( 'click', ( e ) => {
		e.stopPropagation();
		if ( pinnedSet.has( slug ) ) {
			pinnedSet.delete( slug );
		} else {
			pinnedSet.add( slug );
		}
		savePinned();
		pinBtn.classList.toggle( 'bsh-nav__pin--active', pinnedSet.has( slug ) );
		pinBtn.setAttribute(
			'aria-label',
			pinnedSet.has( slug )
				? __( 'Unpin', 'bazaar' )
				: __( 'Pin to top', 'bazaar' )
		);
		// Re-render nav from outside — fire a custom event the shell listens to.
		document.dispatchEvent( new CustomEvent( 'bazaar:nav-refresh' ) );
	} );

	// Footer items (manage, home) are permanent — no pin button needed.
	if ( slug !== 'manage' && slug !== 'home' ) {
		li.append( btn, pinBtn );
	} else {
		li.appendChild( btn );
	}
	return li;
}

export function buildGroupHeader( name ) {
	const li = document.createElement( 'li' );
	const btn = document.createElement( 'button' );
	btn.type = 'button';
	btn.className = 'bsh-nav__group-btn';
	btn.setAttribute( 'aria-expanded', 'true' );
	btn.dataset.group = name;
	btn.innerHTML =
		`<span class="bsh-nav__group-name">${ esc( name ) }</span>` +
		`<span class="dashicons dashicons-arrow-down-alt2 bsh-nav__group-arrow" aria-hidden="true"></span>`;
	btn.addEventListener( 'click', () => {
		const open = btn.getAttribute( 'aria-expanded' ) === 'true';
		btn.setAttribute( 'aria-expanded', open ? 'false' : 'true' );
		btn.querySelector( '.bsh-nav__group-arrow' )?.classList.toggle(
			'bsh-nav__group-arrow--closed',
			open
		);
		let s = li.nextElementSibling;
		while ( s?.classList.contains( 'bsh-nav__item--grouped' ) ) {
			s.hidden = open;
			s = s.nextElementSibling;
		}
	} );
	li.appendChild( btn );
	return li;
}

export function buildDivider() {
	const li = document.createElement( 'li' );
	li.className = 'bsh-nav__divider';
	li.setAttribute( 'role', 'separator' );
	return li;
}

export function buildSectionLabel( text ) {
	const li = document.createElement( 'li' );
	li.className = 'bsh-nav__section-label';
	li.textContent = text;
	li.setAttribute( 'role', 'presentation' );
	return li;
}

// ─── Drag-to-reorder ────────────────────────────────────────────────────────

let _dragSrc = null;

// Track which navList elements already have drag handlers so re-attaching on
// every renderNav() call doesn't stack duplicate listeners. WeakSet is used so
// each unique DOM element gets handlers exactly once with no cross-test state.
const _dragHandlerElements = new WeakSet();

/**
 * Attach HTML5 drag-and-drop handlers to all `.bsh-nav__item[data-slug]` in navList.
 * Safe to call on every renderNav() — installs handlers only once per element.
 * @param {HTMLUListElement} navList
 */
export function attachDragHandlers( navList ) {
	if ( _dragHandlerElements.has( navList ) ) {
		return;
	}
	_dragHandlerElements.add( navList );
	navList.addEventListener( 'dragstart', ( e ) => {
		const li = e.target.closest( '.bsh-nav__item[data-slug]' );
		if ( ! li ) {
			return;
		}
		_dragSrc = li;
		e.dataTransfer.effectAllowed = 'move';
		e.dataTransfer.setData( 'text/plain', li.dataset.slug );
		setTimeout( () => li.classList.add( 'bsh-nav__item--dragging' ), 0 );
	} );

	navList.addEventListener( 'dragover', ( e ) => {
		const li = e.target.closest( '.bsh-nav__item[data-slug]' );
		if ( ! li || li === _dragSrc ) {
			return;
		}
		e.preventDefault();
		e.dataTransfer.dropEffect = 'move';
		const rect = li.getBoundingClientRect();
		const after = e.clientY > rect.top + ( rect.height / 2 );
		li.classList.toggle( 'bsh-nav__item--drop-before', ! after );
		li.classList.toggle( 'bsh-nav__item--drop-after', after );
	} );

	navList.addEventListener( 'dragleave', ( e ) => {
		e.target
			.closest( '.bsh-nav__item' )
			?.classList.remove(
				'bsh-nav__item--drop-before',
				'bsh-nav__item--drop-after'
			);
	} );

	navList.addEventListener( 'drop', ( e ) => {
		const target = e.target.closest( '.bsh-nav__item[data-slug]' );
		if ( ! target || target === _dragSrc ) {
			return;
		}
		e.preventDefault();

		const srcSlug = _dragSrc?.dataset.slug;
		const targetSlug = target.dataset.slug;
		if ( ! srcSlug || ! targetSlug ) {
			return;
		}

		// Re-order the navOrder array.
		const after = target.classList.contains( 'bsh-nav__item--drop-after' );
		const srcIdx = navOrder.indexOf( srcSlug );
		if ( srcIdx !== -1 ) {
			navOrder.splice( srcIdx, 1 );
		}
		const tgtIdx = navOrder.indexOf( targetSlug );
		if ( tgtIdx === -1 ) {
			navOrder.push( targetSlug );
		} else {
			navOrder.splice( after ? tgtIdx + 1 : tgtIdx, 0, srcSlug );
		}
		saveOrder();

		target.classList.remove(
			'bsh-nav__item--drop-before',
			'bsh-nav__item--drop-after'
		);
		document.dispatchEvent( new CustomEvent( 'bazaar:nav-refresh' ) );
	} );

	navList.addEventListener( 'dragend', () => {
		navList
			.querySelectorAll( '.bsh-nav__item' )
			.forEach( ( el ) =>
				el.classList.remove(
					'bsh-nav__item--dragging',
					'bsh-nav__item--drop-before',
					'bsh-nav__item--drop-after'
				)
			);
		_dragSrc = null;
	} );
}

// ─── Alt+1-9 shortcut binding ────────────────────────────────────────────────

/**
 * Register Alt+1-9 to navigate to the nth enabled ware.
 * @param {Map<string, Object>}    wareMap
 * @param {(slug: string) => void} navigateTo
 */
export function registerShortcuts( wareMap, navigateTo ) {
	document.addEventListener( 'keydown', ( e ) => {
		if ( ! e.altKey || e.metaKey || e.ctrlKey || e.shiftKey ) {
			return;
		}
		const n = parseInt( e.key, 10 );
		if ( isNaN( n ) || n < 1 || n > 9 ) {
			return;
		}
		// Use cached sort result — only rebuilt when wareMap/pins/order change.
		_sortCache ??= sortedEnabled( wareMap );
		const target = _sortCache[ n - 1 ];
		if ( target ) {
			e.preventDefault();
			navigateTo( target.slug );
		}
	} );
}
