/**
 * Bazaar Shell — Home / dashboard screen.
 *
 * A built-in pseudo-ware (slug "home") rendered directly in the shell.
 * Wares can post a `bazaar:widget` message to surface a summary tile here.
 */

import { __ } from '@wordpress/i18n';

export class HomeScreen {
	/**
	 * @param {{
	 *   wareMap:       Map<string, Object>,
	 *   navigateTo:    (slug: string) => void,
	 *   iconUrl:       (ware: Object) => string,
	 *   sortedEnabled: (wareMap: Map) => Object[],
	 *   badgeMap:      Map<string, number>,
	 *   pinnedSet:     Set<string>,
	 * }} deps
	 */
	constructor( { wareMap, navigateTo, iconUrl, sortedEnabled, badgeMap, pinnedSet } ) {
		this._deps = { wareMap, navigateTo, iconUrl, sortedEnabled, badgeMap, pinnedSet };
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
	 * Register or update a widget tile from a ware's `bazaar:widget` message.
	 *
	 * @param {string}                             slug
	 * @param {{ count?: number, label?: string }} data
	 */
	addWidget( slug, data ) {
		this._widgets.set( slug, data );
		this.refresh();
	}

	// ── Private ─────────────────────────────────────────────────────────────

	_render() {
		const { wareMap, navigateTo, iconUrl, sortedEnabled, badgeMap, pinnedSet } = this._deps;
		const el = this._el;
		if ( ! el ) {
			return;
		}
		el.innerHTML = '';

		const enabled = sortedEnabled( wareMap );

		// ── Header
		const hdr = document.createElement( 'div' );
		hdr.className = 'bsh-home__header';

		const h1 = Object.assign( document.createElement( 'h1' ), {
			className: 'bsh-home__title',
			textContent: __( 'Home', 'bazaar' ),
		} );
		hdr.appendChild( h1 );
		el.appendChild( hdr );

		if ( enabled.length === 0 ) {
			const empty = document.createElement( 'div' );
			empty.className = 'bsh-home__empty';
			const emptyIcon = document.createElement( 'span' );
			emptyIcon.className = 'dashicons dashicons-admin-plugins bsh-home__empty-icon';
			emptyIcon.setAttribute( 'aria-hidden', 'true' );
			const emptyMsg = Object.assign( document.createElement( 'p' ), {
				textContent: __( 'No wares installed yet.', 'bazaar' ),
			} );
			empty.append( emptyIcon, emptyMsg );
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

		let cardIdx = 0;
		for ( const w of enabled ) {
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
		el.appendChild( section );
	}
}
