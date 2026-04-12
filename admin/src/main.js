/**
 * Bazaar admin page — gallery interactions, drag-drop upload, enable/disable/delete.
 */

import './main.css';
import apiFetch from '@wordpress/api-fetch';
import { __, _n, sprintf } from '@wordpress/i18n';
import { escHtml, escAttr } from './shared/escape.js';
import { SEARCH_DEBOUNCE_MS, DELETE_CONFIRM_COUNTDOWN_S } from './shared/constants.js';
import { initUpload } from './modules/upload.js';
import { initCoreApps } from './modules/core-apps.js';

// Bootstrapped from wp_localize_script in BazaarPage::enqueue_assets().
const { restUrl, nonce, inShell } = window.bazaarData ?? {};

// Human-readable labels for the permission keys declared in ware manifests.
// Must stay in sync with the $perm_labels array in templates/bazaar-page.php.
const PERM_LABELS = {
	'read:posts': __( 'Read posts', 'bazaar' ),
	'write:posts': __( 'Write posts', 'bazaar' ),
	'delete:posts': __( 'Delete posts', 'bazaar' ),
	'read:users': __( 'Read users', 'bazaar' ),
	'write:users': __( 'Write users', 'bazaar' ),
	'read:options': __( 'Read options', 'bazaar' ),
	'write:options': __( 'Write options', 'bazaar' ),
	'read:media': __( 'Read media', 'bazaar' ),
	'write:media': __( 'Write media', 'bazaar' ),
	'read:comments': __( 'Read comments', 'bazaar' ),
	'write:comments': __( 'Write comments', 'bazaar' ),
	'moderate:comments': __( 'Moderate comments', 'bazaar' ),
	'manage:plugins': __( 'Manage plugins', 'bazaar' ),
	'manage:themes': __( 'Manage themes', 'bazaar' ),
	'read:analytics': __( 'Read analytics', 'bazaar' ),
};

// When the manage page is embedded inside the Bazaar Shell iframe, suppress
// the full WordPress admin chrome (sidebar, admin bar, footer) so only the
// page content is visible.
if ( window !== window.top ) {
	document.documentElement.classList.add( 'bazaar-in-shell' );
}

/**
 * Notify the parent shell of a ware state change.
 * Only fires when the manage page is running inside the shell iframe.
 * @param {string} type Event type: 'bazaar:ware-installed' | 'bazaar:ware-deleted' | 'bazaar:ware-toggled'
 * @param {Object} data Payload.
 */
function notifyShell( type, data ) {
	if ( inShell && window.parent !== window ) {
		window.parent.postMessage( { type, ...data }, window.location.origin );
	}
}

apiFetch.use( apiFetch.createNonceMiddleware( nonce ) );
apiFetch.use( apiFetch.createRootURLMiddleware( restUrl + '/' ) );

// ---------------------------------------------------------------------------
// DOM references
// ---------------------------------------------------------------------------

const dropzone = document.getElementById( 'bazaar-dropzone' );
const fileInput = document.getElementById( 'bazaar-file-input' );
const progress = document.getElementById( 'bazaar-upload-progress' );
const progressBar = document.getElementById( 'bazaar-upload-bar' );
const progressLabel = document.getElementById( 'bazaar-upload-label' );
const errorBox = document.getElementById( 'bazaar-upload-error' );
const successBox = document.getElementById( 'bazaar-upload-success' );
const gallery = document.getElementById( 'bazaar-gallery' );
const wareCount = document.getElementById( 'bazaar-ware-count' );
const emptyState = document.getElementById( 'bazaar-empty-state' );
const noResults = document.getElementById( 'bazaar-no-results' );
const filtersBar = document.getElementById( 'bazaar-filters' );
const filterTabs = document.getElementById( 'bazaar-filter-tabs' );
const searchInput = document.getElementById( 'bazaar-search' );

// Guard: the script is only enqueued on the Bazaar manage page, but bail
// cleanly if any critical element is absent to avoid cascading TypeErrors.
if (
	! dropzone ||
	! fileInput ||
	! gallery ||
	! progress ||
	! progressBar ||
	! progressLabel ||
	! errorBox ||
	! successBox
) {
	throw new Error( 'Bazaar: required DOM elements not found — aborting init.' );
}

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------

/** Current status-filter selection: 'all' | 'enabled' | 'disabled'. */
let currentFilter = 'all';

/**
 * Tracks the card currently awaiting inline delete confirmation.
 * @type {{ card: HTMLElement, slug: string, btn: HTMLButtonElement, strip: HTMLElement, autoCancel: ReturnType<typeof setTimeout>, tickInterval: ReturnType<typeof setInterval> }|null}
 */
let confirmState = null;

// ---------------------------------------------------------------------------
// Upload
// ---------------------------------------------------------------------------

const { showError } = initUpload( {
	dropzone,
	fileInput,
	progress,
	progressBar,
	progressLabel,
	errorBox,
	successBox,
	restUrl,
	nonce,
	onSuccess: ( ware ) => {
		insertWareCard( ware );
		updateWareCount( 1 );
		notifyShell( 'bazaar:ware-installed', { ware } );
	},
} );

// ---------------------------------------------------------------------------
// Inline delete confirmation
// ---------------------------------------------------------------------------

/**
 * Show an inline confirmation strip on the card and start a 5-second
 * auto-cancel countdown.
 *
 * @param {HTMLElement}       card
 * @param {string}            slug
 * @param {HTMLButtonElement} btn
 */
function startConfirm( card, slug, btn ) {
	cancelConfirm(); // dismiss any previous pending confirmation

	btn.disabled = true;

	const strip = document.createElement( 'div' );
	strip.className = 'bazaar-card__confirm';
	strip.setAttribute( 'role', 'group' );
	strip.setAttribute( 'aria-label', __( 'Confirm deletion', 'bazaar' ) );

	const text = document.createElement( 'span' );
	text.className = 'bazaar-card__confirm-text';
	text.textContent = __( 'Delete forever?', 'bazaar' );

	const countdown = document.createElement( 'span' );
	countdown.className = 'bazaar-card__confirm-countdown';
	countdown.setAttribute( 'aria-hidden', 'true' );

	const cancelBtn = document.createElement( 'button' );
	cancelBtn.type = 'button';
	cancelBtn.className = 'button bazaar-card__confirm-cancel';
	cancelBtn.textContent = __( 'Cancel', 'bazaar' );
	cancelBtn.addEventListener( 'click', cancelConfirm );

	const deleteBtn = document.createElement( 'button' );
	deleteBtn.type = 'button';
	deleteBtn.className = 'button bazaar-card__confirm-delete';
	deleteBtn.textContent = __( 'Delete', 'bazaar' );
	deleteBtn.addEventListener( 'click', () => executeDelete( slug, card ) );

	strip.append( text, countdown, cancelBtn, deleteBtn );
	card.append( strip );

	let secondsLeft = DELETE_CONFIRM_COUNTDOWN_S;
	countdown.textContent = `(${ secondsLeft })`;

	const tickInterval = setInterval( () => {
		secondsLeft--;
		countdown.textContent = `(${ secondsLeft })`;
	}, 1000 );

	const autoCancel = setTimeout( () => {
		clearInterval( tickInterval );
		cancelConfirm();
	}, DELETE_CONFIRM_COUNTDOWN_S * 1000 );

	confirmState = { card, slug, btn, strip, autoCancel, tickInterval };
	cancelBtn.focus();
}

function cancelConfirm() {
	if ( ! confirmState ) {
		return;
	}
	const { btn, strip, autoCancel, tickInterval } = confirmState;
	clearTimeout( autoCancel );
	clearInterval( tickInterval );
	strip.remove();
	btn.disabled = false;
	btn.focus();
	confirmState = null;
}

/**
 * Perform the DELETE request after the user confirmed.
 *
 * @param {string}      slug
 * @param {HTMLElement} card
 */
async function executeDelete( slug, card ) {
	if ( confirmState ) {
		const { btn, strip, autoCancel, tickInterval } = confirmState;
		clearTimeout( autoCancel );
		clearInterval( tickInterval );
		strip.remove();
		btn.disabled = true;
		confirmState = null;
	}

	card.classList.add( 'bazaar-card--loading' );

	try {
		await apiFetch( {
			path: `/wares/${ encodeURIComponent( slug ) }`,
			method: 'DELETE',
		} );
		animateRemoveCard( card );
		updateWareCount( -1 );
		notifyShell( 'bazaar:ware-deleted', { slug } );
	} catch ( err ) {
		card.classList.remove( 'bazaar-card--loading' );
		const deleteBtn = card.querySelector( '[data-action="delete"]' );
		if ( deleteBtn ) {
			/** @type {HTMLButtonElement} */ ( deleteBtn ).disabled = false;
		}
		showError( err?.message ?? __( 'Could not delete ware.', 'bazaar' ) );
	}
}

// Pressing Escape always cancels a pending inline confirmation.
document.addEventListener( 'keydown', ( e ) => {
	if ( e.key === 'Escape' && confirmState ) {
		cancelConfirm();
	}
} );

// ---------------------------------------------------------------------------
// Gallery actions — toggle + delete via event delegation
// ---------------------------------------------------------------------------

gallery.addEventListener( 'change', async ( e ) => {
	const input = e.target;
	if ( ! input.matches( '.bazaar-toggle__input' ) ) {
		return;
	}

	const slug = input.dataset.slug;
	const enabled = input.checked;
	const card = document.getElementById( `bazaar-card-${ slug }` );
	const label = input.closest( '.bazaar-toggle' );

	input.disabled = true;
	label?.classList.add( 'bazaar-toggle--loading' );
	card?.classList.add( 'bazaar-card--loading' );

	try {
		await apiFetch( {
			path: `/wares/${ encodeURIComponent( slug ) }`,
			method: 'PATCH',
			data: { enabled },
		} );

		card?.classList.toggle( 'bazaar-card--disabled', ! enabled );
		card?.setAttribute( 'data-status', enabled ? 'enabled' : 'disabled' );
		notifyShell( 'bazaar:ware-toggled', { slug, enabled } );

		if ( label ) {
			const msg = enabled
				? __( 'Disable ware', 'bazaar' )
				: __( 'Enable ware', 'bazaar' );
			label.title = msg;
			input.setAttribute( 'aria-label', msg );
		}

		// Re-apply filter in case this ware's new status should hide it.
		applyFilters();
	} catch ( err ) {
		input.checked = ! enabled;
		showError(
			err?.message ?? __( 'Could not update ware status.', 'bazaar' )
		);
	} finally {
		input.disabled = false;
		label?.classList.remove( 'bazaar-toggle--loading' );
		card?.classList.remove( 'bazaar-card--loading' );
	}
} );

gallery.addEventListener( 'click', ( e ) => {
	// Open ware in shell (only meaningful when embedded in the shell iframe).
	const openBtn = e.target.closest( '[data-action="open"]' );
	if ( openBtn?.dataset.slug ) {
		notifyShell( 'bazaar:navigate', { ware: openBtn.dataset.slug } );
		return;
	}

	const btn = e.target.closest( '[data-action="delete"]' );
	if ( ! btn ) {
		return;
	}

	const slug = btn.dataset.slug;
	const card = document.getElementById( `bazaar-card-${ slug }` );
	if ( card && slug ) {
		startConfirm( card, slug, /** @type {HTMLButtonElement} */ ( btn ) );
	}
} );

// ---------------------------------------------------------------------------
// Filter and search
// ---------------------------------------------------------------------------

function applyFilters() {
	const q = searchInput?.value.toLowerCase().trim() ?? '';
	let visible = 0;
	const allCards = gallery.querySelectorAll( '.bazaar-card' );

	allCards.forEach( ( card ) => {
		const name = ( card.dataset.name ?? '' ).toLowerCase();
		const status = card.dataset.status ?? 'enabled';
		const matchesSearch = ! q || name.includes( q );
		const matchesStatus =
			currentFilter === 'all' || status === currentFilter;
		const show = matchesSearch && matchesStatus;

		card.hidden = ! show;
		if ( show ) {
			visible++;
		}
	} );

	if ( noResults ) {
		noResults.hidden = visible > 0 || allCards.length === 0;
	}
}

let _searchTimer;
searchInput?.addEventListener( 'input', () => {
	clearTimeout( _searchTimer );
	_searchTimer = setTimeout( applyFilters, SEARCH_DEBOUNCE_MS );
} );

/**
 * Activate a filter tab: update state, ARIA attributes, and re-filter.
 *
 * @param {HTMLElement} btn The tab button to activate.
 */
function activateFilterTab( btn ) {
	currentFilter = btn.dataset.filter;

	filterTabs.querySelectorAll( '[data-filter]' ).forEach( ( tab ) => {
		const active = tab === btn;
		tab.classList.toggle( 'bazaar-filter-tab--active', active );
		tab.setAttribute( 'aria-selected', String( active ) );
		tab.setAttribute( 'tabindex', active ? '0' : '-1' );
	} );

	applyFilters();
}

filterTabs?.addEventListener( 'click', ( e ) => {
	const btn = e.target.closest( '[data-filter]' );
	if ( btn ) {
		activateFilterTab( btn );
	}
} );

// ARIA tabs keyboard pattern (WAI-ARIA 1.2 §3.22):
// Arrow Left/Right moves focus, Enter/Space activates, Home/End jump to ends.
filterTabs?.addEventListener( 'keydown', ( e ) => {
	if ( ! [ 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'Enter', ' ' ].includes( e.key ) ) {
		return;
	}

	const tabs = [ ...filterTabs.querySelectorAll( '[data-filter]' ) ];
	const focused = tabs.indexOf( e.currentTarget.ownerDocument.activeElement );
	if ( focused === -1 ) {
		return;
	}

	let next = focused;
	if ( e.key === 'ArrowRight' ) {
		next = ( focused + 1 ) % tabs.length;
	} else if ( e.key === 'ArrowLeft' ) {
		next = ( focused - 1 + tabs.length ) % tabs.length;
	} else if ( e.key === 'Home' ) {
		next = 0;
	} else if ( e.key === 'End' ) {
		next = tabs.length - 1;
	} else if ( e.key === 'Enter' || e.key === ' ' ) {
		activateFilterTab( tabs[ focused ] );
		e.preventDefault();
		return;
	}

	if ( next !== focused ) {
		e.preventDefault();
		tabs[ next ].focus();
	}
} );

// ---------------------------------------------------------------------------
// DOM update helpers
// ---------------------------------------------------------------------------

/**
 * Inject a new ware card into the gallery from the REST response object.
 *
 * @param {Object} ware
 */
function insertWareCard( ware ) {
	if ( emptyState ) {
		emptyState.hidden = true;
	}
	if ( filtersBar ) {
		filtersBar.hidden = false;
	}
	document.getElementById( 'bazaar-app' )?.classList.remove( 'bazaar-page--empty' );

	const isEnabled = ware.enabled !== false;
	const iconUrl = `${ window.bazaarData?.restUrl ?? '' }/serve/${ encodeURIComponent( ware.slug ) }/${ encodeURIComponent( ware.icon ?? 'icon.svg' ) }`;
	const toggleLabel = isEnabled
		? __( 'Disable ware', 'bazaar' )
		: __( 'Enable ware', 'bazaar' );
	const deleteConfirm = sprintf(
		/* translators: %s: ware name */
		__( 'Delete "%s"? This cannot be undone.', 'bazaar' ),
		ware.name
	);
	const deleteLabel = sprintf(
		/* translators: %s: ware name */
		__( 'Delete %s', 'bazaar' ),
		ware.name
	);

	const authorHtml = ware.author
		? `<span class="bazaar-card__author">${ sprintf( /* translators: %s: author name */ __( 'by %s', 'bazaar' ), escHtml( ware.author ) ) }</span>`
		: '';
	const descHtml = ware.description
		? `<p class="bazaar-card__description">${ escHtml( ware.description ) }</p>`
		: '';

	const permissions = Array.isArray( ware.permissions )
		? ware.permissions.filter( Boolean )
		: [];
	const permsHtml = permissions.length
		? `<details class="bazaar-card__perms">
			<summary class="bazaar-card__perms-summary">${ escHtml(
		sprintf(
			/* translators: %d: number of permissions requested */
			_n( '%d permission', '%d permissions', permissions.length, 'bazaar' ),
			permissions.length
		)
	) }</summary>
			<ul class="bazaar-card__perms-list">${ permissions.map( ( perm ) =>
		`<li class="bazaar-card__perm-item">` +
				`<span class="bazaar-card__perm-icon dashicons dashicons-yes-alt" aria-hidden="true"></span>` +
				escHtml( PERM_LABELS[ perm ] ?? perm ) +
				`</li>`
	).join( '' ) }</ul>
		</details>`
		: '';

	const card = document.createElement( 'article' );
	card.className =
		'bazaar-card' + ( isEnabled ? '' : ' bazaar-card--disabled' );
	card.id = `bazaar-card-${ ware.slug }`;
	card.dataset.slug = ware.slug;
	card.dataset.name = ware.name;
	card.dataset.status = isEnabled ? 'enabled' : 'disabled';
	card.setAttribute( 'role', 'listitem' );

	card.innerHTML = `
		<div class="bazaar-card__content">
			<div class="bazaar-card__icon-wrap">
				<img src="${ escAttr( iconUrl ) }" alt="" class="bazaar-card__icon" width="48" height="48" loading="lazy"
					onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 20 20%22><rect width=%2220%22 height=%2220%22 rx=%222%22 fill=%22%23ddd%22/></svg>'">
			</div>
			<div class="bazaar-card__body">
				<h3 class="bazaar-card__name">${ escHtml( ware.name ) }</h3>
				<p class="bazaar-card__meta">
					<span class="bazaar-card__version">v${ escHtml( ware.version ) }</span>
					${ authorHtml }
				</p>
				${ descHtml }
				${ permsHtml }
			</div>
		<div class="bazaar-card__actions">
			<button type="button" class="bazaar-card__open"
				data-slug="${ escAttr( ware.slug ) }" data-action="open"
				aria-label="${ escAttr( sprintf( /* translators: %s: ware name */ __( 'Open %s', 'bazaar' ), ware.name ) ) }"
				>${ __( 'Open', 'bazaar' ) }</button>
			<label class="bazaar-toggle" title="${ escAttr( toggleLabel ) }">
				<input type="checkbox" class="bazaar-toggle__input"
					data-slug="${ escAttr( ware.slug ) }" data-action="toggle"
					${ isEnabled ? 'checked' : '' }
					aria-label="${ escAttr( toggleLabel ) }">
				<span class="bazaar-toggle__slider" aria-hidden="true"></span>
			</label>
			<button type="button" class="bazaar-card__delete"
				data-slug="${ escAttr( ware.slug ) }" data-action="delete"
				data-confirm="${ escAttr( deleteConfirm ) }"
				aria-label="${ escAttr( deleteLabel ) }">
				<span class="dashicons dashicons-trash" aria-hidden="true"></span>
			</button>
		</div>
	</div>`;

	gallery.prepend( card );
	applyFilters();
}

/**
 * Fade and shrink a card, then remove it from the DOM.
 *
 * @param {HTMLElement} card
 */
function animateRemoveCard( card ) {
	card.classList.add( 'bazaar-card--removing' );
	card.addEventListener( 'animationend', () => card.remove(), { once: true } );
}

/**
 * Increment or decrement the displayed ware count using the data-count attribute
 * rather than parsing the rendered text content.
 *
 * @param {number} delta +1 or -1
 */
function updateWareCount( delta ) {
	if ( ! wareCount ) {
		return;
	}
	const current = parseInt( wareCount.dataset.count ?? '0', 10 );
	const next = Math.max( 0, current + delta );
	wareCount.dataset.count = String( next );
	wareCount.textContent = `(${ next })`;
	if ( emptyState ) {
		emptyState.hidden = next > 0;
	}
}

// ---------------------------------------------------------------------------
// Core Apps discovery
// ---------------------------------------------------------------------------

initCoreApps( {
	coreGrid: document.getElementById( 'bazaar-core-grid' ),
	gallery,
	apiFetch,
	restUrl,
	showError,
	insertWareCard,
	updateWareCount,
	notifyShell,
} );
