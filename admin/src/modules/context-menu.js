/**
 * Bazaar Shell — right-click context menus on nav items.
 */

import { __ } from '@wordpress/i18n';
import { recentList, saveRecent, pinnedSet, savePinned } from './nav.js';

export class NavContextMenu {
	/**
	 * @param {{
	 *   navigateTo: (slug: string) => void,
	 *   popOut:     (url: string, slug: string) => void,
	 *   serveUrl:   (ware: Object) => string,
	 *   wareMap:    Map<string, Object>,
	 * }} deps
	 */
	constructor( { navigateTo, popOut, serveUrl, wareMap } ) {
		this._deps = { navigateTo, popOut, serveUrl, wareMap };
		this._el = this._build();
		this._attached = new WeakSet();

		document.addEventListener( 'click', () => this.hide() );
		document.addEventListener( 'keydown', ( e ) => {
			if ( e.key === 'Escape' ) {
				this.hide();
			}
		} );
	}

	/**
	 * Attach contextmenu listeners to a nav list element.
	 * Safe to call on every renderNav() — installs once per list element.
	 *
	 * @param {HTMLUListElement} navList
	 */
	attach( navList ) {
		if ( this._attached.has( navList ) ) {
			return;
		}
		this._attached.add( navList );
		navList.addEventListener( 'contextmenu', ( e ) => {
			const item = e.target.closest( '.bsh-nav__item[data-slug]' );
			if ( ! item ) {
				return;
			}
			e.preventDefault();
			this._show( item.dataset.slug, e.clientX, e.clientY );
		} );
	}

	hide() {
		this._el.hidden = true;
	}

	// ── Private ─────────────────────────────────────────────────────────────

	_show( slug, x, y ) {
		const { popOut, serveUrl, wareMap } = this._deps;
		const ware = wareMap.get( slug );

		this._el.innerHTML = '';

		const items = [];

		if ( ware ) {
			const isPinned = pinnedSet.has( slug );
			items.push( {
				icon: isPinned ? 'dashicons-star-filled' : 'dashicons-star-empty',
				label: isPinned ? __( 'Unpin', 'bazaar' ) : __( 'Pin to top', 'bazaar' ),
				action: () => {
					if ( isPinned ) {
						pinnedSet.delete( slug );
					} else {
						pinnedSet.add( slug );
					}
					savePinned();
					document.dispatchEvent( new CustomEvent( 'bazaar:nav-refresh' ) );
				},
			} );

			items.push( {
				icon: 'dashicons-external',
				label: __( 'Pop out', 'bazaar' ),
				action: () => popOut( serveUrl( ware ), slug ),
			} );
		}

		items.push( {
			icon: 'dashicons-update',
			label: __( 'Reload', 'bazaar' ),
			action: () => {
				document.dispatchEvent(
					new CustomEvent( 'bazaar:reload-ware', { detail: { slug } } )
				);
			},
		} );

		if ( recentList.includes( slug ) ) {
			items.push( {
				icon: 'dashicons-trash',
				label: __( 'Remove from Recent', 'bazaar' ),
				action: () => {
					const idx = recentList.indexOf( slug );
					if ( idx !== -1 ) {
						recentList.splice( idx, 1 );
						saveRecent();
						document.dispatchEvent( new CustomEvent( 'bazaar:nav-refresh' ) );
					}
				},
			} );
		}

		for ( const { icon, label, action } of items ) {
			const btn = document.createElement( 'button' );
			btn.type = 'button';
			btn.className = 'bsh-ctxmenu__item';
			btn.setAttribute( 'role', 'menuitem' );
			const i = document.createElement( 'span' );
			i.className = `dashicons ${ icon }`;
			i.setAttribute( 'aria-hidden', 'true' );
			const lbl = document.createElement( 'span' );
			lbl.textContent = label;
			btn.append( i, lbl );
			btn.addEventListener( 'click', ( e ) => {
				e.stopPropagation();
				this.hide();
				action();
			} );
			this._el.appendChild( btn );
		}

		// Position — keep within viewport.
		this._el.hidden = false;
		const vw = window.innerWidth;
		const vh = window.innerHeight;
		const rect = this._el.getBoundingClientRect();
		this._el.style.left = Math.min( x, vw - rect.width - 8 ) + 'px';
		this._el.style.top = Math.min( y, vh - rect.height - 8 ) + 'px';

		this._el.querySelector( '.bsh-ctxmenu__item' )?.focus();
	}

	_build() {
		const el = document.createElement( 'div' );
		el.className = 'bsh-ctxmenu';
		el.setAttribute( 'role', 'menu' );
		el.hidden = true;
		document.body.appendChild( el );
		return el;
	}
}
