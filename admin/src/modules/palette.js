/**
 * Bazaar Shell — app launcher (Spotlight-style).
 *
 * Self-contained class that manages the overlay DOM, app list, keyboard nav,
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

/** Deterministic accent colour per ware slug. */
const MONOGRAM_COLORS = [
	'#6366f1', '#8b5cf6', '#ec4899', '#f43f5e',
	'#f97316', '#22c55e', '#14b8a6', '#0ea5e9', '#a855f7',
];

function monogramColor( slug ) {
	let h = 0;
	for ( let i = 0; i < slug.length; i++ ) {
		h += slug.charCodeAt( i );
	}
	return MONOGRAM_COLORS[ h % MONOGRAM_COLORS.length ];
}

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

		// ── Overlay ──────────────────────────────────────────────────────────
		this.overlay = Object.assign( document.createElement( 'div' ), {
			className: 'bsh-palette',
		} );
		this.overlay.setAttribute( 'role', 'dialog' );
		this.overlay.setAttribute( 'aria-label', __( 'App launcher', 'bazaar' ) );
		this.overlay.setAttribute( 'aria-modal', 'true' );
		this.overlay.hidden = true;

		// ── Search bar ───────────────────────────────────────────────────────
		const bar = document.createElement( 'div' );
		bar.className = 'bsh-palette__bar';

		const iconWrap = document.createElement( 'span' );
		iconWrap.className = 'bsh-palette__search-icon';
		iconWrap.setAttribute( 'aria-hidden', 'true' );
		iconWrap.innerHTML = '<svg viewBox="0 0 20 20" fill="none" width="18" height="18"><circle cx="8.5" cy="8.5" r="5" stroke="currentColor" stroke-width="1.6"/><path d="M13 13l3.5 3.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';

		this.input = Object.assign( document.createElement( 'input' ), {
			type: 'text',
			className: 'bsh-palette__input',
			placeholder: __( 'Search apps and actions\u2026', 'bazaar' ),
			autocomplete: 'off',
			spellcheck: false,
		} );

		bar.append( iconWrap, this.input );

		// ── Result list ──────────────────────────────────────────────────────
		this.list = Object.assign( document.createElement( 'ul' ), {
			className: 'bsh-palette__list',
		} );
		this.list.setAttribute( 'role', 'listbox' );

		// ── Inner card ───────────────────────────────────────────────────────
		const inner = document.createElement( 'div' );
		inner.className = 'bsh-palette__inner';
		inner.append( bar, this.list );
		this.overlay.appendChild( inner );
		document.body.appendChild( this.overlay );

		// ── Events ───────────────────────────────────────────────────────────
		this.input.addEventListener( 'input', () => {
			clearTimeout( this._searchTimer );
			this._searchTimer = setTimeout( () => {
				void this._render().catch( ( err ) => {
					// eslint-disable-next-line no-console
					console.error( '[Bazaar] Launcher render failed:', err );
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
			console.error( '[Bazaar] Launcher render failed:', err );
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

		const manageItem = {
			slug: 'manage',
			label: __( 'Manage Apps', 'bazaar' ),
			type: 'action',
		};

		const wareItems = this._sortedEnabled( this._wareMap ).map( ( w ) => ( {
			slug: w.slug,
			label: w.menu_title ?? w.name,
			type: 'ware',
		} ) );

		this.list.innerHTML = '';

		if ( q ) {
			// ── Filtered mode — flat list, no section chrome ──────────────────
			const all = [ manageItem, ...wareItems ];
			const filtered = all.filter(
				( i ) =>
					String( i.label ?? '' ).toLowerCase().includes( ql ) ||
					String( i.slug ?? '' ).includes( ql )
			);

			let items = filtered;
			if ( q.length >= FED_SEARCH_MIN_CHARS ) {
				const fedResults = await this._fedSearch( q );
				items = [ ...filtered, ...fedResults ];
			}

			this.items = items;
			this.sel = 0;

			if ( ! items.length ) {
				this._renderEmpty();
				return;
			}
			items.forEach( ( item, i ) => this._renderItem( item, i ) );
		} else {
			// ── Default mode — APPS section + divider + manage ────────────────
			this.items = [ ...wareItems, manageItem ];
			this.sel = 0;

			if ( wareItems.length ) {
				this._renderSectionHeader( __( 'Apps', 'bazaar' ) );
				wareItems.forEach( ( item, i ) => this._renderItem( item, i ) );
			}
			this._renderDivider();
			this._renderItem( manageItem, wareItems.length );
		}
	}

	_renderSectionHeader( label ) {
		const li = document.createElement( 'li' );
		li.className = 'bsh-palette__section';
		li.setAttribute( 'role', 'presentation' );
		li.textContent = label;
		this.list.appendChild( li );
	}

	_renderDivider() {
		const li = document.createElement( 'li' );
		li.className = 'bsh-palette__divider';
		li.setAttribute( 'role', 'presentation' );
		this.list.appendChild( li );
	}

	_renderEmpty() {
		const li = document.createElement( 'li' );
		li.className = 'bsh-palette__empty';
		li.textContent = __( 'No results.', 'bazaar' );
		this.list.appendChild( li );
	}

	_renderItem( item, i ) {
		const li = document.createElement( 'li' );
		li.className =
			'bsh-palette__item' + ( i === 0 ? ' bsh-palette__item--sel' : '' );
		li.setAttribute( 'role', 'option' );
		li.setAttribute( 'aria-selected', i === 0 ? 'true' : 'false' );
		li.dataset.slug = item.slug ?? '';

		// ── Icon ─────────────────────────────────────────────────────────────
		const icon = document.createElement( 'span' );
		if ( item.type === 'action' ) {
			icon.className = 'bsh-palette__icon-wrap bsh-palette__icon-wrap--action';
			icon.innerHTML = '<svg viewBox="0 0 20 20" fill="currentColor" width="15" height="15" aria-hidden="true"><path fill-rule="evenodd" clip-rule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z"/></svg>';
		} else if ( item.type === 'search' ) {
			icon.className = 'bsh-palette__icon-wrap bsh-palette__icon-wrap--search';
			icon.innerHTML = '<svg viewBox="0 0 20 20" fill="none" width="15" height="15" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5" stroke="currentColor" stroke-width="1.5"/><path d="M13 13l3.5 3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';
		} else {
			const color = monogramColor( item.slug );
			const letter = ( item.label || item.slug || '?' )[ 0 ].toUpperCase();
			icon.className = 'bsh-palette__icon-wrap bsh-palette__icon-wrap--mono';
			icon.style.setProperty( '--mono-bg', color );
			icon.textContent = esc( letter );
		}

		// ── Label + optional subtitle ─────────────────────────────────────────
		const text = document.createElement( 'span' );
		text.className = 'bsh-palette__text';
		text.innerHTML = `<span class="bsh-palette__lbl">${ esc( item.label ) }</span>`;
		if ( item.meta && item.type === 'search' ) {
			text.innerHTML += `<span class="bsh-palette__sub">${ esc( item.meta ) }</span>`;
		}

		// ── Chevron ───────────────────────────────────────────────────────────
		const chevron = document.createElement( 'span' );
		chevron.className = 'bsh-palette__chevron';
		chevron.setAttribute( 'aria-hidden', 'true' );
		chevron.textContent = '›';

		li.append( icon, text, chevron );

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
						meta: `${ ware.menu_title ?? ware.name } \u203a ${ item.type ?? 'result' }`,
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
