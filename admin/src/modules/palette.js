/**
 * Bazaar Shell — command palette (spotlight search).
 *
 * Self-contained class that manages the overlay DOM, ware list, keyboard nav,
 * and federated per-ware search. Receives all external dependencies via its
 * constructor so it can be tested in isolation.
 */

import { __ } from '@wordpress/i18n';
import { esc } from '../shared/escape.js';
import {
	PALETTE_DEBOUNCE_MS,
	FED_SEARCH_MIN_CHARS,
	FED_SEARCH_TIMEOUT_MS,
} from '../shared/constants.js';

export class CommandPalette {
	/**
	 * @param {{
	 *   wareMap:       Map<string, Object>,
	 *   restUrl:       string,
	 *   nonce:         string,
	 *   sortedEnabled: (map: Map<string, Object>) => Object[],
	 *   onSelect:      (slug: string) => void,
	 *   openExternal:  (url: string) => void,
	 * }} deps
	 */
	constructor( { wareMap, restUrl, nonce, sortedEnabled, onSelect, openExternal } ) {
		this._wareMap = wareMap;
		this._restUrl = restUrl;
		this._nonce = nonce;
		this._sortedEnabled = sortedEnabled;
		this._openExternal = openExternal;

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
			}, PALETTE_DEBOUNCE_MS );
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
			...this._sortedEnabled( this._wareMap ).map( ( w ) => ( {
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
		if ( q.length >= FED_SEARCH_MIN_CHARS ) {
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
					this._openExternal( item.url );
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
		const tasks = [ ...this._wareMap.entries() ]
			.filter( ( [ , ware ] ) => ware.search_endpoint )
			.map( async ( [ slug, ware ] ) => {
				let signal;
				if ( AbortSignal.timeout ) {
					signal = AbortSignal.timeout( FED_SEARCH_TIMEOUT_MS );
				} else {
					const c = new AbortController();
					setTimeout( () => c.abort(), FED_SEARCH_TIMEOUT_MS );
					signal = c.signal;
				}
				try {
					const r = await fetch(
						`${ this._restUrl }/${ ware.search_endpoint }?q=${ encodeURIComponent( query ) }`,
						{ headers: { 'X-WP-Nonce': this._nonce }, signal }
					);
					if ( ! r.ok ) {
						return [];
					}
					const items = await r.json();
					if ( ! Array.isArray( items ) ) {
						return [];
					}
					return items.map( ( item ) => ( {
						slug: item.slug ?? slug,
						label: item.label ?? item.title ?? item.name,
						meta: `${ ware.menu_title ?? ware.name } › ${ item.type ?? 'result' }`,
						url: item.url,
						type: 'search',
						ware: slug,
					} ) );
				} catch {
					return [];
				}
			} );

		const settled = await Promise.allSettled( tasks );
		const results = [];
		for ( const r of settled ) {
			if ( r.status === 'fulfilled' ) {
				results.push( ...r.value );
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
					this._openExternal( item.url );
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
