/**
 * Bazaar manage page — core apps catalog: display, install, open.
 *
 * Exports `initCoreApps` which fetches the catalog, renders cards, and wires
 * the install/open click handlers.
 */

import { __, _n, sprintf } from '@wordpress/i18n';
import { escHtml, escAttr } from '../shared/escape.js';

/**
 * Map a tag to the card accent colour.
 * Each category family shares a palette that distinguishes apps at a glance.
 *
 * @param {string[]} tags App tags from the registry.
 * @return {string} CSS hex colour for the card accent.
 */
function tagToAccent( tags ) {
	/** @type {Record<string, string>} */
	const MAP = {
		creative: '#f59e0b', art: '#f59e0b', editor: '#f59e0b', fun: '#ef4444',
		business: '#2563eb', invoicing: '#2563eb', billing: '#2563eb', pdf: '#2563eb',
		productivity: '#7c3aed', timer: '#7c3aed', focus: '#7c3aed', pomodoro: '#7c3aed',
	};
	for ( const tag of ( tags ?? [] ) ) {
		if ( MAP[ tag ] ) {
			return MAP[ tag ];
		}
	}
	return '#6b7280';
}

/**
 * Render a single core app card inside the core grid.
 *
 * @param {Object}  app         Catalog entry from /bazaar/v1/core-apps.
 * @param {boolean} isInstalled Whether this slug is already installed.
 * @param {string}  restUrl     REST base URL (for local icon lookup).
 * @return {HTMLElement} The rendered card element.
 */
function renderCoreCard( app, isInstalled, restUrl ) {
	const card = document.createElement( 'div' );
	card.className = 'bazaar-core-card';
	card.setAttribute( 'role', 'listitem' );
	card.dataset.slug = app.slug;

	const accent = tagToAccent( app.tags );
	card.style.setProperty( '--card-accent', accent );

	const initial = ( app.name || '?' ).charAt( 0 ).toUpperCase();

	// For installed wares use the local serve endpoint so the icon loads without
	// needing a published GitHub release. Remote icon_url is kept as the fallback.
	const resolvedIconUrl = isInstalled
		? `${ restUrl ?? '' }/serve/${ encodeURIComponent( app.slug ) }/icon.svg`
		: app.icon_url;

	const installedBadge = isInstalled
		? '<span class="bazaar-core-card__installed-badge">' + escHtml( __( '✓ Installed', 'bazaar' ) ) + '</span>'
		: '';

	// Installed apps get an "Open" button; uninstalled get an "Install" button.
	const ctaHtml = isInstalled
		? `<button
			type="button"
			class="button bazaar-core-card__cta bazaar-core-card__cta--open"
			data-core-slug="${ escAttr( app.slug ) }"
			aria-label="${ escAttr( sprintf( /* translators: %s: app name */ __( 'Open %s', 'bazaar' ), app.name ) ) }"
		>${ escHtml( __( 'Open', 'bazaar' ) ) }</button>`
		: `<button
			type="button"
			class="button bazaar-core-card__cta bazaar-core-card__cta--install"
			data-core-slug="${ escAttr( app.slug ) }"
			data-download-url="${ escAttr( app.download_url ) }"
			aria-label="${ escAttr( sprintf( /* translators: %s: app name */ __( 'Install %s', 'bazaar' ), app.name ) ) }"
		>${ escHtml( __( 'Install', 'bazaar' ) ) }</button>`;

	card.innerHTML = `
		${ installedBadge }
		<div class="bazaar-core-card__top">
			<div class="bazaar-core-card__icon-wrap">
				<span class="bazaar-core-card__initial" aria-hidden="true">${ escHtml( initial ) }</span>
				<img
					src="${ escAttr( resolvedIconUrl ) }"
					alt=""
					class="bazaar-core-card__icon"
					loading="lazy"
					onerror="this.style.display='none'"
				>
			</div>
			<div class="bazaar-core-card__info">
				<h3 class="bazaar-core-card__name">${ escHtml( app.name ) }</h3>
			<span class="bazaar-core-card__byline">v${ escHtml( app.version ?? '' ) } &middot; ${ escHtml( app.author ?? 'Bazaar' ) }</span>
		</div>
	</div>
	<p class="bazaar-core-card__desc">${ escHtml( app.description ?? '' ) }</p>
		${ ctaHtml }
	`;

	return card;
}

/**
 * Fetch and render the core apps catalog; wire install/open handlers.
 *
 * @param {Object}                               deps
 * @param {HTMLElement}                          deps.coreGrid        Core apps grid element.
 * @param {HTMLElement}                          deps.gallery         Main ware gallery for installed slug lookup.
 * @param {Function}                             deps.apiFetch        WordPress apiFetch instance.
 * @param {string}                               deps.restUrl         REST base URL.
 * @param {(msg: string) => void}                deps.showError       Display an error notice.
 * @param {(ware: Object) => void}               deps.insertWareCard  Insert a new ware card into the gallery.
 * @param {(delta: number) => void}              deps.updateWareCount Adjust the displayed ware count.
 * @param {(type: string, data: Object) => void} deps.notifyShell     Notify the parent shell iframe.
 */
export function initCoreApps( deps ) {
	const {
		coreGrid,
		gallery,
		apiFetch,
		restUrl,
		showError,
		insertWareCard,
		updateWareCount,
		notifyShell,
	} = deps;

	if ( ! coreGrid ) {
		return;
	}

	function getInstalledSlugs() {
		const slugs = new Set();
		gallery.querySelectorAll( '[data-slug]' ).forEach( ( el ) => {
			const s = el.dataset.slug;
			if ( s ) {
				slugs.add( s );
			}
		} );
		return slugs;
	}

	async function handleCoreInstall( btn ) {
		const slug = btn.dataset.coreSlug;
		const downloadUrl = btn.dataset.downloadUrl;

		if ( ! slug || ! downloadUrl ) {
			return;
		}

		btn.disabled = true;
		btn.textContent = __( 'Installing…', 'bazaar' );

		try {
			const response = await apiFetch( {
				path: '/core-apps/install',
				method: 'POST',
				data: { url: downloadUrl },
			} );

			btn.textContent = __( 'Open', 'bazaar' );
			btn.classList.remove( 'bazaar-core-card__cta--install' );
			btn.classList.add( 'bazaar-core-card__cta--open' );
			btn.disabled = false;
			btn.removeAttribute( 'data-download-url' );

			const cardEl = btn.closest( '.bazaar-core-card' );
			if ( cardEl && ! cardEl.querySelector( '.bazaar-core-card__installed-badge' ) ) {
				const badge = document.createElement( 'span' );
				badge.className = 'bazaar-core-card__installed-badge';
				badge.textContent = __( '✓ Installed', 'bazaar' );
				cardEl.prepend( badge );
			}

			if ( response?.ware ) {
				insertWareCard( response.ware );
				updateWareCount( 1 );
				notifyShell( 'bazaar:ware-installed', { ware: response.ware } );
			}
		} catch ( err ) {
			btn.disabled = false;
			btn.textContent = __( 'Install', 'bazaar' );
			// apiFetch attaches the WP_Error message. For 502 gateway errors the
			// remote asset download failed — surface that rather than a generic string.
			const msg = err?.message
				? err.message
				: __( 'Installation failed. Please try again.', 'bazaar' );
			showError( msg );
		}
	}

	function renderLoadError() {
		coreGrid.classList.remove( 'bazaar-core-grid--loading' );
		coreGrid.innerHTML = `
			<div class="bazaar-core-load-error">
				<p class="bazaar-core-load-error__msg">${ escHtml( __( 'Could not load the app catalog.', 'bazaar' ) ) }</p>
				<button type="button" class="bazaar-core-load-error__retry">${ escHtml( __( 'Try again', 'bazaar' ) ) }</button>
			</div>`;
		const retryBtn = coreGrid.querySelector( '.bazaar-core-load-error__retry' );
		retryBtn?.addEventListener( 'click', () => {
			coreGrid.innerHTML = '';
			loadCoreApps();
		} );
	}

	async function loadCoreApps() {
		let apps;
		// Guard against the grid becoming a permanent skeleton if the request
		// hangs indefinitely or returns a non-throwing 4xx response.
		const controller = new AbortController();
		const timeoutId = setTimeout( () => controller.abort(), 15_000 );
		try {
			apps = await apiFetch( { path: '/core-apps', signal: controller.signal } );
		} catch ( err ) {
			clearTimeout( timeoutId );
			renderLoadError();
			return;
		}
		clearTimeout( timeoutId );

		coreGrid.classList.remove( 'bazaar-core-grid--loading' );
		coreGrid.innerHTML = '';

		if ( ! Array.isArray( apps ) || apps.length === 0 ) {
			coreGrid.innerHTML = `<p class="bazaar-core-empty">${ escHtml( __( 'No apps available in the catalog right now.', 'bazaar' ) ) }</p>`;
			return;
		}

		const countBadge = document.getElementById( 'bazaar-core-count' );
		if ( countBadge ) {
			countBadge.textContent = sprintf(
				/* translators: %d: number of apps */
				_n( '%d app', '%d apps', apps.length, 'bazaar' ),
				apps.length
			);
		}

		const installed = getInstalledSlugs();
		apps.forEach( ( app ) => {
			coreGrid.appendChild( renderCoreCard( app, installed.has( app.slug ), restUrl ) );
		} );
	}

	coreGrid.addEventListener( 'click', ( e ) => {
		const installBtn = e.target.closest( '.bazaar-core-card__cta--install' );
		if ( installBtn ) {
			handleCoreInstall( /** @type {HTMLButtonElement} */ ( installBtn ) );
			return;
		}

		const openBtn = e.target.closest( '.bazaar-core-card__cta--open' );
		if ( openBtn?.dataset.coreSlug ) {
			notifyShell( 'bazaar:navigate', { ware: openBtn.dataset.coreSlug } );
		}
	} );

	loadCoreApps();
}
