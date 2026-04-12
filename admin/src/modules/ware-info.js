/**
 * Bazaar Shell — "About this ware" popover.
 *
 * Shows version, author, trust level, and active permissions for the current
 * ware. Triggered by the ⓘ toolbar button.
 */

import { __ } from '@wordpress/i18n';
import { esc } from '../shared/escape.js';

const TRUST_META = {
	verified: {
		icon: 'dashicons-shield',
		label: /* translators: trust level */ __( 'Verified', 'bazaar' ),
		cls: 'bsh-ware-info__trust--verified',
	},
	trusted: {
		icon: 'dashicons-shield-alt',
		label: /* translators: trust level */ __( 'Trusted', 'bazaar' ),
		cls: 'bsh-ware-info__trust--trusted',
	},
	standard: {
		icon: 'dashicons-unlock',
		label: /* translators: trust level */ __( 'Standard', 'bazaar' ),
		cls: 'bsh-ware-info__trust--standard',
	},
};

const PERM_LABELS = {
	posts: __( 'Posts', 'bazaar' ),
	users: __( 'Users', 'bazaar' ),
	options: __( 'Options', 'bazaar' ),
	media: __( 'Media', 'bazaar' ),
	comments: __( 'Comments', 'bazaar' ),
	plugins: __( 'Plugins', 'bazaar' ),
	themes: __( 'Themes', 'bazaar' ),
	analytics: __( 'Analytics', 'bazaar' ),
};

export class WareInfo {
	constructor() {
		this._el = null;
		this._open = false;

		document.addEventListener( 'click', ( e ) => {
			if ( this._open && this._el && ! this._el.contains( e.target ) ) {
				this.hide();
			}
		} );
		document.addEventListener( 'keydown', ( e ) => {
			if ( e.key === 'Escape' && this._open ) {
				this.hide();
			}
		} );
	}

	/**
	 * Show the popover for a ware, positioned below an anchor element.
	 *
	 * @param {Object}      ware   Ware index entry.
	 * @param {HTMLElement} anchor Element to position below.
	 */
	show( ware, anchor ) {
		if ( ! this._el ) {
			this._el = document.createElement( 'div' );
			this._el.className = 'bsh-ware-info';
			this._el.setAttribute( 'role', 'dialog' );
			this._el.setAttribute( 'aria-label', __( 'Ware information', 'bazaar' ) );
			this._el.hidden = true;
			document.body.appendChild( this._el );
		}

		this._el.innerHTML = '';
		this._open = true;

		const trust = TRUST_META[ ware.trust ?? 'standard' ] ?? TRUST_META.standard;

		// ── Name
		const nameEl = Object.assign( document.createElement( 'div' ), {
			className: 'bsh-ware-info__name',
			textContent: ware.menu_title ?? ware.name,
		} );

		// ── Version + author
		const meta = document.createElement( 'div' );
		meta.className = 'bsh-ware-info__meta';
		if ( ware.version ) {
			const v = Object.assign( document.createElement( 'span' ), {
				textContent: 'v' + ware.version,
			} );
			meta.appendChild( v );
		}
		if ( ware.author ) {
			const a = Object.assign( document.createElement( 'span' ), {
				textContent: ware.author,
			} );
			meta.appendChild( a );
		}

		// ── Trust badge
		const trustEl = document.createElement( 'div' );
		trustEl.className = `bsh-ware-info__trust ${ trust.cls }`;
		const trustIcon = document.createElement( 'span' );
		trustIcon.className = `dashicons ${ trust.icon }`;
		trustIcon.setAttribute( 'aria-hidden', 'true' );
		const trustLabel = document.createTextNode( ' ' + trust.label );
		trustEl.append( trustIcon, trustLabel );

		this._el.append( nameEl, meta, trustEl );

		// ── Permissions
		const perms = ware.permissions
			? Object.keys( ware.permissions ).filter( ( k ) => ware.permissions[ k ] )
			: [];
		if ( perms.length ) {
			const permTitle = Object.assign( document.createElement( 'div' ), {
				className: 'bsh-ware-info__section-title',
				textContent: __( 'Permissions', 'bazaar' ),
			} );
			const permList = document.createElement( 'ul' );
			permList.className = 'bsh-ware-info__perms';
			for ( const p of perms ) {
				const li = Object.assign( document.createElement( 'li' ), {
					textContent: PERM_LABELS[ p ] ?? p,
				} );
				permList.appendChild( li );
			}
			this._el.append( permTitle, permList );
		}

		// ── Description
		if ( ware.description ) {
			const desc = Object.assign( document.createElement( 'p' ), {
				className: 'bsh-ware-info__desc',
				textContent: ware.description,
			} );
			this._el.appendChild( desc );
		}

		// ── Homepage link
		if ( ware.homepage ) {
			const link = document.createElement( 'a' );
			link.className = 'bsh-ware-info__link';
			// Only allow http/https URLs.
			try {
				const parsed = new URL( ware.homepage );
				if ( parsed.protocol === 'https:' || parsed.protocol === 'http:' ) {
					link.href = ware.homepage;
					link.target = '_blank';
					link.rel = 'noopener noreferrer';
					link.textContent = __( 'Homepage', 'bazaar' );
					const ext = document.createElement( 'span' );
					ext.className = 'dashicons dashicons-external';
					ext.setAttribute( 'aria-hidden', 'true' );
					link.appendChild( ext );
					this._el.appendChild( link );
				}
			} catch { /* invalid URL — skip */ }
		}

		// ── Position below anchor
		this._el.hidden = false;
		if ( anchor ) {
			const rect = anchor.getBoundingClientRect();
			const vw = window.innerWidth;
			const W = 260;
			const left = Math.max( 8, Math.min( rect.left, vw - W - 8 ) );
			this._el.style.top = ( rect.bottom + 6 ) + 'px';
			this._el.style.left = left + 'px';
		}

		// Keep the esc reference for template literals in subtypes if needed.
		void esc;
	}

	hide() {
		this._open = false;
		if ( this._el ) {
			this._el.hidden = true;
		}
	}

	/**
	 * Toggle the popover. Call the same way as show().
	 * @param {Object}      ware
	 * @param {HTMLElement} anchor
	 */
	toggle( ware, anchor ) {
		if ( this._open ) {
			this.hide();
		} else {
			this.show( ware, anchor );
		}
	}
}
