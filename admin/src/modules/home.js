/**
 * Bazaar Shell — Home / dashboard screen.
 *
 * A built-in pseudo-ware (slug "home") rendered directly in the shell.
 * Wares can post a `bazaar:widget` message to surface a summary tile here.
 *
 * First-run flow
 * ──────────────
 * On first visit (localStorage key `bazaar.welcomed` absent) the screen
 * renders a welcome panel that fetches the core-apps catalog and presents
 * three featured apps with one-click install buttons. Once the user
 * installs an app or clicks "Skip", the flag is set and subsequent
 * visits show the normal home grid with a "Getting Started" progress card
 * until both milestones (install + open) are completed or dismissed.
 */

import { __, sprintf } from '@wordpress/i18n';

// ── localStorage keys ────────────────────────────────────────────────────────
const LS_WELCOMED = 'bazaar.welcomed';
const LS_GS_DONE = 'bazaar.gs.done';
const LS_GS_OPENED = 'bazaar.gs.opened';

// Slugs shown in the welcome screen, in order of prominence.
const FEATURED_SLUGS = [ 'mosaic', 'ledger', 'flow' ];

// Maximum number of ware cards rendered in the home grid at once.
// Installations beyond this cap are accessible via the Manage screen.
const MAX_HOME_GRID = 100;

export class HomeScreen {
	/**
	 * @param {{
	 *   wareMap:        Map<string, Object>,
	 *   navigateTo:     (slug: string) => void,
	 *   iconUrl:        (ware: Object) => string,
	 *   sortedEnabled:  (wareMap: Map) => Object[],
	 *   badgeMap:       Map<string, number>,
	 *   pinnedSet:      Set<string>,
	 *   restUrl:        string,
	 *   apiFetch:       (url: string, init?: Object) => Promise<Response>,
	 *   onWareInstalled:(ware: Object) => void,
	 * }} deps
	 */
	constructor( { wareMap, navigateTo, iconUrl, sortedEnabled, badgeMap, pinnedSet, restUrl, apiFetch, onWareInstalled } ) {
		this._deps = { wareMap, navigateTo, iconUrl, sortedEnabled, badgeMap, pinnedSet, restUrl, apiFetch, onWareInstalled };
		this._widgets = new Map(); // slug → { count?, label? }
		this._el = null;
	}

	/**
	 * Mount and render into the given panel element.
	 *
	 * @param {HTMLElement} panel Container element.
	 */
	mount( panel ) {
		this._el = panel;
		this._render();
	}

	/** Re-render after wareMap or badge changes. */
	refresh() {
		if ( this._el ) {
			this._render();
		}
	}

	/**
	 * Called by shell.js whenever the user navigates to a non-shell ware.
	 * Records the "opened an app" getting-started milestone.
	 *
	 * @param {string} slug
	 */
	recordOpen( slug ) {
		if ( slug === 'home' || slug === 'manage' ) {
			return;
		}
		if ( ! localStorage.getItem( LS_GS_OPENED ) ) {
			try {
				localStorage.setItem( LS_GS_OPENED, '1' );
			} catch {
				// Non-fatal: storage may be full or blocked in private mode.
			}
			// Re-render the home screen if it's currently visible so the step
			// checks off in real time when the user navigates back.
			this.refresh();
		}
	}

	/**
	 * Register or update a widget tile from a ware's `bazaar:widget` message.
	 *
	 * @param {string}                             slug
	 * @param {{ count?: number, label?: string }} data
	 */
	addWidget( slug, data ) {
		this._widgets.set( slug, data );
		this.refresh();
	}

	/**
	 * Surgically update badge counts on already-rendered pinned and grid cards.
	 *
	 * Called instead of refresh() when only badge counts change, avoiding a
	 * full DOM rebuild for every bazaar:badge postMessage.
	 *
	 * @param {Map<string, number>} badgeMap Current badge counts.
	 */
	patchBadges( badgeMap ) {
		if ( ! this._el ) {
			return;
		}

		/**
		 * Update or remove the badge <span> inside a button element.
		 *
		 * @param {HTMLElement} btn   Button that may contain a badge span.
		 * @param {string}      cls   Badge class name to query/create.
		 * @param {number}      count New badge count (0 = remove).
		 */
		const applyBadge = ( btn, cls, count ) => {
			let b = btn.querySelector( `.${ cls }` );
			if ( count > 0 ) {
				const text = count > 99 ? '99+' : String( count );
				if ( ! b ) {
					b = document.createElement( 'span' );
					b.className = cls;
					btn.appendChild( b );
				}
				b.textContent = text;
				b.setAttribute( 'aria-label', String( count ) + ' ' + __( 'notifications', 'bazaar' ) );
			} else if ( b ) {
				b.remove();
			}
		};

		this._el.querySelectorAll( '.bsh-home__pinned-item[data-slug]' ).forEach( ( btn ) => {
			applyBadge( btn, 'bsh-home__pinned-badge', badgeMap.get( btn.dataset.slug ) ?? 0 );
		} );

		this._el.querySelectorAll( '.bsh-home__card[data-slug]' ).forEach( ( card ) => {
			applyBadge( card, 'bsh-home__card-badge', badgeMap.get( card.dataset.slug ) ?? 0 );
		} );
	}

	// ── Private ─────────────────────────────────────────────────────────────

	_render() {
		const el = this._el;
		if ( ! el ) {
			return;
		}
		el.innerHTML = '';

		if ( ! localStorage.getItem( LS_WELCOMED ) ) {
			this._renderWelcome( el );
			return;
		}

		this._renderHome( el );
	}

	// ── Welcome screen ───────────────────────────────────────────────────────

	_renderWelcome( el ) {
		const { restUrl, apiFetch, navigateTo } = this._deps;

		const wrap = document.createElement( 'div' );
		wrap.className = 'bsh-welcome';

		// ── Hero
		const hero = document.createElement( 'div' );
		hero.className = 'bsh-welcome__hero';

		const title = Object.assign( document.createElement( 'h1' ), {
			className: 'bsh-welcome__title',
			textContent: __( 'Welcome to Bazaar', 'bazaar' ),
		} );
		const sub = Object.assign( document.createElement( 'p' ), {
			className: 'bsh-welcome__sub',
			textContent: __( 'Install apps from the catalog below — each one becomes a full-screen mini-app right here in your admin.', 'bazaar' ),
		} );
		hero.append( title, sub );

		// ── Featured apps grid (filled asynchronously)
		const section = document.createElement( 'div' );
		section.className = 'bsh-welcome__section';

		const sectionTitle = Object.assign( document.createElement( 'h2' ), {
			className: 'bsh-welcome__section-title',
			textContent: __( 'Featured apps', 'bazaar' ),
		} );
		section.appendChild( sectionTitle );

		const grid = document.createElement( 'div' );
		grid.className = 'bsh-welcome__grid';

		// Skeleton cards while we fetch
		for ( let i = 0; i < 3; i++ ) {
			const sk = document.createElement( 'div' );
			sk.className = 'bsh-welcome__card bsh-welcome__card--skeleton';
			sk.setAttribute( 'aria-hidden', 'true' );
			grid.appendChild( sk );
		}
		section.appendChild( grid );

		// ── Footer actions
		const footer = document.createElement( 'div' );
		footer.className = 'bsh-welcome__footer';

		const skipBtn = document.createElement( 'button' );
		skipBtn.type = 'button';
		skipBtn.className = 'bsh-welcome__skip';
		skipBtn.textContent = __( 'Skip setup, take me to the dashboard', 'bazaar' );
		skipBtn.addEventListener( 'click', () => {
			try {
				localStorage.setItem( LS_WELCOMED, '1' );
			} catch {
				// Non-fatal: storage may be full or blocked in private mode.
			}
			this._render();
		} );
		footer.appendChild( skipBtn );

		wrap.append( hero, section, footer );
		el.appendChild( wrap );

		// Fetch featured apps and replace skeletons
		( async () => {
			try {
				const r = await apiFetch( `${ restUrl }/core-apps` );
				if ( ! r.ok ) {
					return;
				}
				const apps = await r.json();
				if ( ! Array.isArray( apps ) ) {
					return;
				}

				// Pick the three featured slugs in order; fall back to first three.
				const featured = [
					...FEATURED_SLUGS
						.map( ( s ) => apps.find( ( a ) => a.slug === s ) )
						.filter( Boolean ),
					...apps.filter( ( a ) => ! FEATURED_SLUGS.includes( a.slug ) ),
				].slice( 0, 3 );

				grid.innerHTML = '';
				for ( const app of featured ) {
					grid.appendChild( this._renderWelcomeCard( app, restUrl, navigateTo ) );
				}
			} catch {
				// Network error or REST unavailable — show actionable error state.
				grid.innerHTML = '';

				const errWrap = document.createElement( 'div' );
				errWrap.className = 'bsh-welcome__fetch-error';

				const errMsg = Object.assign( document.createElement( 'p' ), {
					className: 'bsh-welcome__fetch-error-msg',
					textContent: __( 'Could not load featured apps.', 'bazaar' ),
				} );

				const retryBtn = document.createElement( 'button' );
				retryBtn.type = 'button';
				retryBtn.className = 'bsh-welcome__fetch-error-retry';
				retryBtn.textContent = __( 'Try again', 'bazaar' );
				retryBtn.addEventListener( 'click', () => this._renderWelcome( el ) );

				errWrap.append( errMsg, retryBtn );
				grid.appendChild( errWrap );
			}
		} )();
	}

	/**
	 * @param {Object}   app        Catalog entry.
	 * @param {string}   restUrl    Bazaar REST base URL.
	 * @param {Function} navigateTo Shell navigation callback.
	 * @return {HTMLElement} Rendered card element.
	 */
	_renderWelcomeCard( app, restUrl, navigateTo ) {
		const { wareMap, apiFetch, onWareInstalled } = this._deps;

		const isInstalled = wareMap.has( app.slug );

		const card = document.createElement( 'div' );
		card.className = 'bsh-welcome__card';

		// Icon
		const iconWrap = document.createElement( 'div' );
		iconWrap.className = 'bsh-welcome__card-icon-wrap';

		const initial = Object.assign( document.createElement( 'span' ), {
			className: 'bsh-welcome__card-initial',
			textContent: ( app.name ?? '?' ).charAt( 0 ).toUpperCase(),
			'aria-hidden': 'true',
		} );

		const img = document.createElement( 'img' );
		img.src = isInstalled
			? `${ restUrl }/serve/${ encodeURIComponent( app.slug ) }/icon.svg`
			: ( app.icon_url ?? '' );
		img.alt = '';
		img.className = 'bsh-welcome__card-icon';
		img.onerror = () => img.style.display = 'none';
		iconWrap.append( initial, img );

		// Meta
		const meta = document.createElement( 'div' );
		meta.className = 'bsh-welcome__card-meta';

		const name = Object.assign( document.createElement( 'h3' ), {
			className: 'bsh-welcome__card-name',
			textContent: app.name ?? '',
		} );
		const desc = Object.assign( document.createElement( 'p' ), {
			className: 'bsh-welcome__card-desc',
			textContent: app.description ?? '',
		} );
		meta.append( name, desc );

		// CTA
		const cta = document.createElement( 'button' );
		cta.type = 'button';
		cta.className = 'bsh-welcome__card-cta';

		if ( isInstalled ) {
			cta.textContent = __( 'Open', 'bazaar' );
			cta.addEventListener( 'click', () => {
				try {
					localStorage.setItem( LS_WELCOMED, '1' );
				} catch {
					// Non-fatal: storage may be full or blocked in private mode.
				}
				navigateTo( app.slug );
			} );
		} else {
			cta.textContent = __( 'Install', 'bazaar' );
			cta.addEventListener( 'click', async () => {
				if ( ! app.download_url ) {
					return;
				}
				cta.disabled = true;
				cta.textContent = __( 'Installing…', 'bazaar' );

				try {
					const r = await apiFetch( `${ restUrl }/core-apps/install`, {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify( { url: app.download_url } ),
					} );
					if ( ! r.ok ) {
						throw new Error( `HTTP ${ r.status }` );
					}
					const data = await r.json();

					// Mark welcomed first so subsequent renders show the normal home.
					localStorage.setItem( LS_WELCOMED, '1' );
					if ( data?.ware ) {
						// Register the ware with the shell directly (adds to wareMap,
						// renders nav, shows success toast, clears SW cache) then navigate.
						onWareInstalled( data.ware );
					} else {
						this._render();
					}
				} catch {
					cta.disabled = false;
					cta.textContent = __( 'Install', 'bazaar' );
				}
			} );
		}

		card.append( iconWrap, meta, cta );
		return card;
	}

	// ── Normal home ──────────────────────────────────────────────────────────

	_renderHome( el ) {
		const { wareMap, navigateTo, iconUrl, sortedEnabled, badgeMap, pinnedSet } = this._deps;
		const enabled = sortedEnabled( wareMap );

		// Getting Started card (shown until dismissed or all milestones complete)
		const gsEl = this._renderGettingStarted( wareMap );
		if ( gsEl ) {
			el.appendChild( gsEl );
		}

		if ( enabled.length === 0 ) {
			const empty = document.createElement( 'div' );
			empty.className = 'bsh-home__empty';

			const art = document.createElement( 'div' );
			art.className = 'bsh-home__empty-art';
			art.setAttribute( 'aria-hidden', 'true' );
			for ( let i = 0; i < 3; i++ ) {
				const ph = document.createElement( 'div' );
				ph.className = 'bsh-home__empty-ph';
				art.appendChild( ph );
			}

			const heading = Object.assign( document.createElement( 'h2' ), {
				className: 'bsh-home__empty-heading',
				textContent: __( 'Your workspace is empty', 'bazaar' ),
			} );

			const sub = Object.assign( document.createElement( 'p' ), {
				className: 'bsh-home__empty-sub',
				textContent: __( 'Install a ware to get started — each one is a self-contained mini-app that lives right here.', 'bazaar' ),
			} );

			const cta = document.createElement( 'button' );
			cta.type = 'button';
			cta.className = 'bsh-home__empty-cta';
			cta.textContent = __( 'Browse Wares', 'bazaar' );
			cta.addEventListener( 'click', () => navigateTo( 'manage' ) );

			empty.append( art, heading, sub, cta );
			el.appendChild( empty );
			return;
		}

		// ── Pinned quick-launch row
		const pinned = enabled.filter( ( w ) => pinnedSet?.has( w.slug ) );
		if ( pinned.length > 0 ) {
			const pinnedRow = document.createElement( 'div' );
			pinnedRow.className = 'bsh-home__pinned';

			const pinnedTitle = Object.assign( document.createElement( 'h2' ), {
				className: 'bsh-home__pinned-title',
				textContent: __( 'Pinned', 'bazaar' ),
			} );
			pinnedRow.appendChild( pinnedTitle );

			const pinnedList = document.createElement( 'div' );
			pinnedList.className = 'bsh-home__pinned-list';

			for ( const w of pinned ) {
				const btn = document.createElement( 'button' );
				btn.type = 'button';
				btn.className = 'bsh-home__pinned-item';
				btn.dataset.slug = w.slug;
				btn.setAttribute( 'aria-label', w.menu_title ?? w.name );

				const imgWrap = document.createElement( 'span' );
				imgWrap.className = 'bsh-home__pinned-icon-wrap';
				imgWrap.setAttribute( 'aria-hidden', 'true' );

				const img = document.createElement( 'img' );
				img.src = iconUrl( w );
				img.alt = '';
				img.className = 'bsh-home__pinned-icon';
				img.onerror = () =>
					img.replaceWith(
						Object.assign( document.createElement( 'span' ), {
							className: 'dashicons dashicons-admin-plugins bsh-home__pinned-icon-fallback',
						} )
					);
				imgWrap.appendChild( img );

				const lbl = Object.assign( document.createElement( 'span' ), {
					className: 'bsh-home__pinned-label',
					textContent: w.menu_title ?? w.name,
				} );

				const badge = badgeMap.get( w.slug );
				btn.append( imgWrap, lbl );

				if ( badge > 0 ) {
					const b = Object.assign( document.createElement( 'span' ), {
						className: 'bsh-home__pinned-badge',
						textContent: badge > 99 ? '99+' : String( badge ),
					} );
					b.setAttribute( 'aria-label', String( badge ) + ' ' + __( 'notifications', 'bazaar' ) );
					btn.appendChild( b );
				}

				btn.addEventListener( 'click', () => navigateTo( w.slug ) );
				pinnedList.appendChild( btn );
			}

			pinnedRow.appendChild( pinnedList );
			el.appendChild( pinnedRow );
		}

		// ── Widget tiles (populated via bazaar:widget postMessages)
		const activeWidgets = [ ...this._widgets.entries() ].filter(
			( [ slug ] ) => wareMap.get( slug )?.enabled
		);
		if ( activeWidgets.length > 0 ) {
			const widgetRow = document.createElement( 'div' );
			widgetRow.className = 'bsh-home__widgets';

			let widgetIdx = 0;
			for ( const [ slug, data ] of activeWidgets ) {
				const ware = wareMap.get( slug );
				const tile = document.createElement( 'button' );
				tile.type = 'button';
				tile.className = 'bsh-home__widget';
				tile.style.setProperty( '--i', String( widgetIdx++ ) );

				const wHdr = document.createElement( 'div' );
				wHdr.className = 'bsh-home__widget-header';

				if ( ware ) {
					const img = document.createElement( 'img' );
					img.src = iconUrl( ware );
					img.alt = '';
					img.className = 'bsh-home__widget-icon';
					img.onerror = () => img.remove();
					wHdr.appendChild( img );
				}
				const wName = Object.assign( document.createElement( 'span' ), {
					className: 'bsh-home__widget-name',
					textContent: ware?.menu_title ?? ware?.name ?? slug,
				} );
				wHdr.appendChild( wName );

				const wBody = document.createElement( 'div' );
				wBody.className = 'bsh-home__widget-body';

				if ( data.count !== null && data.count !== undefined ) {
					const count = Object.assign( document.createElement( 'span' ), {
						className: 'bsh-home__widget-count',
						textContent: data.count > 9_999 ? '9999+' : String( data.count ),
					} );
					wBody.appendChild( count );
				}
				if ( data.label ) {
					const lbl = Object.assign( document.createElement( 'span' ), {
						className: 'bsh-home__widget-label',
						textContent: data.label,
					} );
					wBody.appendChild( lbl );
				}

				const tileParts = [ ware?.menu_title ?? ware?.name ?? slug ];
				if ( data.count !== null && data.count !== undefined ) {
					tileParts.push( String( data.count > 9_999 ? '9999+' : data.count ) );
				}
				if ( data.label ) {
					tileParts.push( data.label );
				}
				tile.setAttribute( 'aria-label', tileParts.join( ' — ' ) );

				tile.append( wHdr, wBody );
				tile.addEventListener( 'click', () => navigateTo( slug ) );
				widgetRow.appendChild( tile );
			}
			el.appendChild( widgetRow );
		}

		// ── All wares grid
		const section = document.createElement( 'div' );
		section.className = 'bsh-home__section';

		const sectionTitle = Object.assign( document.createElement( 'h2' ), {
			className: 'bsh-home__section-title',
			textContent: __( 'All Wares', 'bazaar' ),
		} );
		section.appendChild( sectionTitle );

		const grid = document.createElement( 'div' );
		grid.className = 'bsh-home__grid';

		const visible = enabled.slice( 0, MAX_HOME_GRID );

		let cardIdx = 0;
		for ( const w of visible ) {
			const card = document.createElement( 'button' );
			card.type = 'button';
			card.className = 'bsh-home__card';
			card.dataset.slug = w.slug;
			card.setAttribute( 'aria-label', w.menu_title ?? w.name );
			card.style.setProperty( '--i', String( cardIdx++ ) );

			const iconWrap = document.createElement( 'span' );
			iconWrap.className = 'bsh-home__card-icon-wrap';
			iconWrap.setAttribute( 'aria-hidden', 'true' );

			const img = document.createElement( 'img' );
			img.src = iconUrl( w );
			img.alt = '';
			img.className = 'bsh-home__card-icon';
			img.onerror = () =>
				img.replaceWith(
					Object.assign( document.createElement( 'span' ), {
						className: 'dashicons dashicons-admin-plugins bsh-home__card-icon-fallback',
					} )
				);
			iconWrap.appendChild( img );

			const name = Object.assign( document.createElement( 'span' ), {
				className: 'bsh-home__card-name',
				textContent: w.menu_title ?? w.name,
			} );

			card.append( iconWrap, name );

			const badge = badgeMap.get( w.slug );
			if ( badge > 0 ) {
				const b = Object.assign( document.createElement( 'span' ), {
					className: 'bsh-home__card-badge',
					textContent: badge > 99 ? '99+' : String( badge ),
				} );
				b.setAttribute(
					'aria-label',
					String( badge ) + ' ' + __( 'notifications', 'bazaar' )
				);
				card.appendChild( b );
			}

			if ( w.description ) {
				const desc = Object.assign( document.createElement( 'span' ), {
					className: 'bsh-home__card-desc',
					textContent: w.description,
				} );
				card.appendChild( desc );
			}

			card.addEventListener( 'click', () => navigateTo( w.slug ) );
			grid.appendChild( card );
		}

		section.appendChild( grid );

		if ( enabled.length > MAX_HOME_GRID ) {
			const overflow = document.createElement( 'p' );
			overflow.className = 'bsh-home__overflow';
			const btn = document.createElement( 'button' );
			btn.type = 'button';
			btn.className = 'bsh-home__overflow-link';
			btn.textContent = sprintf(
				/* translators: %1$d: visible count, %2$d: total count */
				__( 'Showing %1$d of %2$d wares — Browse all', 'bazaar' ),
				MAX_HOME_GRID,
				enabled.length
			);
			btn.addEventListener( 'click', () => navigateTo( 'manage' ) );
			overflow.appendChild( btn );
			section.appendChild( overflow );
		}

		el.appendChild( section );
	}

	// ── Getting Started card ─────────────────────────────────────────────────

	/**
	 * Build the Getting Started card element, or return null if it should
	 * not be shown (already done / dismissed, or both milestones complete).
	 *
	 * @param {Map} wareMap Current ware registry map.
	 * @return {HTMLElement|null} Card element, or null when hidden.
	 */
	_renderGettingStarted( wareMap ) {
		if ( localStorage.getItem( LS_GS_DONE ) ) {
			return null;
		}

		const { navigateTo, sortedEnabled } = this._deps;
		const hasWare = sortedEnabled( wareMap ).length > 0;
		const hasOpened = !! localStorage.getItem( LS_GS_OPENED );

		// Auto-dismiss once all milestones are done.
		if ( hasWare && hasOpened ) {
			try {
				localStorage.setItem( LS_GS_DONE, '1' );
			} catch {
				// Non-fatal: storage may be full or blocked in private mode.
			}
			return null;
		}

		const card = document.createElement( 'div' );
		card.className = 'bsh-gs';

		// Header
		const hdr = document.createElement( 'div' );
		hdr.className = 'bsh-gs__header';

		const hdrTitle = Object.assign( document.createElement( 'span' ), {
			className: 'bsh-gs__title',
			textContent: __( 'Getting started', 'bazaar' ),
		} );

		const dismissBtn = document.createElement( 'button' );
		dismissBtn.type = 'button';
		dismissBtn.className = 'bsh-gs__dismiss';
		dismissBtn.setAttribute( 'aria-label', __( 'Dismiss getting started card', 'bazaar' ) );
		dismissBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M1 1l12 12M13 1L1 13" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/></svg>';
		dismissBtn.addEventListener( 'click', () => {
			try {
				localStorage.setItem( LS_GS_DONE, '1' );
			} catch {
				// Non-fatal: storage may be full or blocked in private mode.
			}
			card.classList.add( 'bsh-gs--fade-out' );
			card.addEventListener( 'animationend', () => card.remove(), { once: true } );
		} );

		hdr.append( hdrTitle, dismissBtn );

		// Steps list
		const steps = document.createElement( 'ul' );
		steps.className = 'bsh-gs__steps';

		const makeStep = ( done, label, actionLabel, onAction ) => {
			const li = document.createElement( 'li' );
			li.className = 'bsh-gs__step' + ( done ? ' bsh-gs__step--done' : '' );

			// Use inline SVG with explicit presentation attributes so fill/stroke
			// render correctly across all browsers without relying on CSS inheritance.
			const svgNS = 'http://www.w3.org/2000/svg';
			const check = document.createElementNS( svgNS, 'svg' );
			check.setAttribute( 'class', 'bsh-gs__step-icon' );
			check.setAttribute( 'viewBox', '0 0 20 20' );
			check.setAttribute( 'width', '20' );
			check.setAttribute( 'height', '20' );
			check.setAttribute( 'fill', 'none' );
			check.setAttribute( 'aria-hidden', 'true' );

			const circle = document.createElementNS( svgNS, 'circle' );
			circle.setAttribute( 'cx', '10' );
			circle.setAttribute( 'cy', '10' );
			circle.setAttribute( 'r', '8.5' );
			circle.setAttribute( 'fill', 'none' );
			circle.setAttribute( 'stroke', done ? 'var(--bsh-accent)' : 'var(--bsh-border)' );
			circle.setAttribute( 'stroke-width', '1.5' );
			check.appendChild( circle );

			if ( done ) {
				const tick = document.createElementNS( svgNS, 'path' );
				tick.setAttribute( 'd', 'M5.5 10l3 3 6-6' );
				tick.setAttribute( 'stroke', 'var(--bsh-accent)' );
				tick.setAttribute( 'stroke-width', '1.75' );
				tick.setAttribute( 'stroke-linecap', 'round' );
				tick.setAttribute( 'stroke-linejoin', 'round' );
				check.appendChild( tick );
			}

			const text = Object.assign( document.createElement( 'span' ), {
				className: 'bsh-gs__step-label',
				textContent: label,
			} );

			li.append( check, text );

			if ( ! done && actionLabel && onAction ) {
				const action = document.createElement( 'button' );
				action.type = 'button';
				action.className = 'bsh-gs__step-action';
				action.textContent = actionLabel;
				action.addEventListener( 'click', onAction );
				li.appendChild( action );
			}

			return li;
		};

		steps.appendChild( makeStep(
			hasWare,
			__( 'Install your first app', 'bazaar' ),
			__( 'Browse apps', 'bazaar' ),
			() => navigateTo( 'manage' )
		) );

		steps.appendChild( makeStep(
			hasOpened,
			__( 'Open an app', 'bazaar' ),
			hasWare ? __( 'Go to home', 'bazaar' ) : null,
			hasWare ? () => {
				// Navigate to the first enabled ware.
				const first = [ ...wareMap.values() ].find( ( w ) => w.enabled );
				if ( first ) {
					navigateTo( first.slug );
				}
			} : null
		) );

		// Progress bar
		const progress = document.createElement( 'div' );
		progress.className = 'bsh-gs__progress';
		const done = [ hasWare, hasOpened ].filter( Boolean ).length;
		const track = document.createElement( 'div' );
		track.className = 'bsh-gs__progress-track';
		const bar = document.createElement( 'div' );
		bar.className = 'bsh-gs__progress-bar';
		bar.style.width = `${ ( done / 2 ) * 100 }%`;
		track.appendChild( bar );
		const label = Object.assign( document.createElement( 'span' ), {
			className: 'bsh-gs__progress-label',
			/* translators: %1$d: completed steps, %2$d: total steps */
			textContent: sprintf( __( '%1$d / %2$d complete', 'bazaar' ), done, 2 ),
		} );
		progress.append( track, label );

		card.append( hdr, steps, progress );
		return card;
	}
}
