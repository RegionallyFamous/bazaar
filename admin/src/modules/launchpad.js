/**
 * Bazaar Shell — Launchpad overlay (visual grid app launcher).
 *
 * A more visual alternative to the command palette. Triggered by a toolbar
 * button; palette stays as the keyboard-first power-user path.
 */

import { __ } from '@wordpress/i18n';

const SEARCH_DEBOUNCE_MS = 120;

export class Launchpad {
	/**
	 * @param {{
	 *   wareMap:       Map<string, Object>,
	 *   navigateTo:    (slug: string) => void,
	 *   iconUrl:       (ware: Object) => string,
	 *   sortedEnabled: (wareMap: Map) => Object[],
	 * }} deps
	 */
	constructor( { wareMap, navigateTo, iconUrl, sortedEnabled } ) {
		this._deps = { wareMap, navigateTo, iconUrl, sortedEnabled };
		this._visible = false;
		this._query = '';
		this._closeGen = 0;
		this._el = this._build();

		document.addEventListener( 'keydown', ( e ) => {
			if ( this._visible && e.key === 'Escape' ) {
				this.close();
			}
		} );
	}

	get visible() {
		return this._visible;
	}

	open() {
		this._visible = true;
		this._query = '';
		this._input.value = '';
		this._el.hidden = false;
		this._renderGrid();
		requestAnimationFrame( () => {
			this._el.classList.add( 'bsh-launchpad--in' );
			this._input.focus();
		} );
	}

	close() {
		this._visible = false;
		this._el.classList.remove( 'bsh-launchpad--in' );
		const gen = ++this._closeGen;
		const apply = () => {
			if ( this._closeGen === gen ) {
				this._el.hidden = true;
			}
		};
		this._el.addEventListener( 'transitionend', apply, { once: true } );
		// Fallback: guarantee hidden even when transitions don't fire
		// (prefers-reduced-motion, display:none, test environments).
		setTimeout( apply, 300 );
	}

	// ── Private ─────────────────────────────────────────────────────────────

	_renderGrid() {
		const { sortedEnabled, wareMap, iconUrl, navigateTo } = this._deps;
		const q = this._query.toLowerCase();
		const wares = sortedEnabled( wareMap ).filter( ( w ) => {
			if ( ! q ) {
				return true;
			}
			const name = ( w.menu_title ?? w.name ?? '' ).toLowerCase();
			return name.includes( q ) || w.slug.toLowerCase().includes( q );
		} );

		this._grid.innerHTML = '';

		if ( wares.length === 0 ) {
			const empty = Object.assign( document.createElement( 'p' ), {
				className: 'bsh-launchpad__empty',
				textContent: __( 'No wares found', 'bazaar' ),
			} );
			this._grid.appendChild( empty );
			return;
		}

		let _itemIndex = 0;
		for ( const w of wares ) {
			const btn = document.createElement( 'button' );
			btn.type = 'button';
			btn.className = 'bsh-launchpad__item';
			btn.style.setProperty( '--i', String( _itemIndex++ ) );
			btn.setAttribute( 'aria-label', w.menu_title ?? w.name );

			const imgWrap = document.createElement( 'span' );
			imgWrap.className = 'bsh-launchpad__icon-wrap';
			imgWrap.setAttribute( 'aria-hidden', 'true' );

			const img = document.createElement( 'img' );
			img.src = iconUrl( w );
			img.alt = '';
			img.className = 'bsh-launchpad__icon';
			img.onerror = () => {
				img.replaceWith(
					Object.assign( document.createElement( 'span' ), {
						className: 'dashicons dashicons-admin-plugins bsh-launchpad__icon-fallback',
					} )
				);
			};
			imgWrap.appendChild( img );

			const label = Object.assign( document.createElement( 'span' ), {
				className: 'bsh-launchpad__label',
				textContent: w.menu_title ?? w.name,
			} );

			btn.append( imgWrap, label );
			btn.addEventListener( 'click', () => {
				this.close();
				navigateTo( w.slug );
			} );
			this._grid.appendChild( btn );
		}
	}

	_build() {
		const el = document.createElement( 'div' );
		el.className = 'bsh-launchpad';
		el.setAttribute( 'role', 'dialog' );
		el.setAttribute( 'aria-modal', 'true' );
		el.setAttribute( 'aria-label', __( 'Launchpad', 'bazaar' ) );
		el.hidden = true;

		const inner = document.createElement( 'div' );
		inner.className = 'bsh-launchpad__inner';

		// ── Search bar
		const searchWrap = document.createElement( 'div' );
		searchWrap.className = 'bsh-launchpad__search-wrap';

		const searchIcon = document.createElement( 'span' );
		searchIcon.className = 'dashicons dashicons-search bsh-launchpad__search-icon';
		searchIcon.setAttribute( 'aria-hidden', 'true' );

		const input = document.createElement( 'input' );
		input.type = 'search';
		input.className = 'bsh-launchpad__search';
		input.placeholder = __( 'Search wares…', 'bazaar' );
		input.setAttribute( 'aria-label', __( 'Search wares', 'bazaar' ) );
		input.autocomplete = 'off';
		this._input = input;

		let _debounce;
		input.addEventListener( 'input', () => {
			this._query = input.value;
			clearTimeout( _debounce );
			_debounce = setTimeout( () => this._renderGrid(), SEARCH_DEBOUNCE_MS );
		} );

		searchWrap.append( searchIcon, input );

		// ── Grid
		const grid = document.createElement( 'div' );
		grid.className = 'bsh-launchpad__grid';
		this._grid = grid;

		inner.append( searchWrap, grid );
		el.appendChild( inner );

		// Close on backdrop click.
		el.addEventListener( 'click', ( e ) => {
			if ( e.target === el ) {
				this.close();
			}
		} );

		document.body.appendChild( el );
		return el;
	}
}
