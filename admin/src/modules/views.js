/**
 * Bazaar Shell — view modes: split-view, fullscreen, pop-out.
 */

import { __ } from '@wordpress/i18n';
import { LruIframeManager } from './lru.js';

// ─── Fullscreen ─────────────────────────────────────────────────────────────

let _fsActive = false;

/**
 * Toggle fullscreen mode (hides nav rail + WP admin bar).
 * @param {HTMLElement} root Shell root element.
 */
export function toggleFullscreen( root ) {
	_fsActive = ! _fsActive;
	root.classList.toggle( 'bsh--fullscreen', _fsActive );
	document.body.classList.toggle( 'bsh-fullscreen-active', _fsActive );
}

export function isFullscreen() {
	return _fsActive;
}

// ─── Pop-out ────────────────────────────────────────────────────────────────

/**
 * Open a ware in a standalone browser window.
 * Reuses the same serve URL the iframe uses.
 *
 * @param {string} url  Fully qualified ware serve URL.
 * @param {string} slug Ware slug (used as the window name).
 */
export function popOut( url, slug ) {
	const w = 1280,
		h = 800;
	const left = Math.max( 0, ( screen.width - w ) / 2 );
	const top = Math.max( 0, ( screen.height - h ) / 2 );
	window.open(
		url,
		`bazaar_popout_${ slug }`,
		`width=${ w },height=${ h },left=${ left },top=${ top },resizable=yes,scrollbars=yes,toolbar=no,menubar=no`
	);
}

// ─── Split-view ─────────────────────────────────────────────────────────────

export class SplitView {
	/**
	 * @param {HTMLElement} mainEl The #bsh-main element.
	 * @param {number}      cap    LRU capacity for the secondary panel.
	 */
	constructor( mainEl, cap ) {
		this.main = mainEl;
		this.active = false;
		this.primary = null; // current primary LruManager (owned by Shell)
		this.secondLru = null; // secondary LruManager (owned here)

		this._panelA = null;
		this._panelB = null;
		this._divider = null;
		this._cap = cap;

		this._activeSecondary = null;
	}

	/**
	 * Enter split mode.
	 * @param {LruIframeManager} primaryLru The shell's existing iframe manager.
	 */
	enter( primaryLru ) {
		if ( this.active ) {
			return;
		}
		this.active = true;
		this.primary = primaryLru;

		this._panelA = document.createElement( 'div' );
		this._panelA.className = 'bsh-split__panel bsh-split__panel--a';

		this._divider = document.createElement( 'div' );
		this._divider.className = 'bsh-split__divider';
		this._divider.setAttribute( 'role', 'separator' );
		this._divider.setAttribute( 'aria-label', __( 'Resize panels', 'bazaar' ) );
		this._divider.setAttribute( 'tabindex', '0' );

		this._panelB = document.createElement( 'div' );
		this._panelB.className = 'bsh-split__panel bsh-split__panel--b';

		// Move existing iframes into panel A.
		while ( this.main.firstChild ) {
			this._panelA.appendChild( this.main.firstChild );
		}

		this.main.classList.add( 'bsh-main--split' );
		this.main.append( this._panelA, this._divider, this._panelB );

		// Wire up LRU for secondary panel.
		this.secondLru = new LruIframeManager( this._panelB, this._cap );

		// Re-home the primary LRU's container.
		primaryLru.container = this._panelA;

		this._attachDividerDrag();
	}

	/**
	 * Exit split mode.
	 * @param {LruIframeManager} primaryLru
	 */
	exit( primaryLru ) {
		if ( ! this.active ) {
			return;
		}
		this.active = false;

		// Move panel A contents back to main.
		this.main.classList.remove( 'bsh-main--split' );
		while ( this._panelA.firstChild ) {
			this.main.appendChild( this._panelA.firstChild );
		}
		this._panelA.remove();
		this._divider.remove();
		this._panelB.remove();

		// Destroy all secondary frames.
		if ( this.secondLru ) {
			for ( const slug of [ ...this.secondLru.frames.keys() ] ) {
				this.secondLru.destroy( slug );
			}
			this.secondLru = null;
		}
		this._activeSecondary = null;
		primaryLru.container = this.main;
	}

	/**
	 * Load a ware into the secondary panel.
	 * @param {string} slug
	 * @param {string} url
	 */
	activateSecondary( slug, url ) {
		if ( ! this.active || ! this.secondLru ) {
			return;
		}
		this._activeSecondary = slug;
		this.secondLru.activate( slug, url );
	}

	get secondarySlug() {
		return this._activeSecondary;
	}

	// ── Divider drag ────────────────────────────────────────────────────────

	_attachDividerDrag() {
		let startX, startAFlex;

		const onMove = ( e ) => {
			const dx = ( e.clientX ?? e.touches?.[ 0 ]?.clientX ) - startX;
			const total = this.main.offsetWidth;
			const pct = Math.max(
				20,
				Math.min( 80, ( ( ( startAFlex * total ) + dx ) / total ) * 100 )
			);
			this._panelA.style.flex = `0 0 ${ pct }%`;
			this._panelB.style.flex = `0 0 ${ 100 - pct }%`;
		};

		const onUp = () => {
			document.removeEventListener( 'mousemove', onMove );
			document.removeEventListener( 'mouseup', onUp );
			document.removeEventListener( 'touchmove', onMove );
			document.removeEventListener( 'touchend', onUp );
			document.body.style.userSelect = '';
		};

		this._divider.addEventListener( 'mousedown', ( e ) => {
			startX = e.clientX;
			startAFlex = this._panelA.offsetWidth / this.main.offsetWidth;
			document.body.style.userSelect = 'none';
			document.addEventListener( 'mousemove', onMove );
			document.addEventListener( 'mouseup', onUp );
		} );
	}
}
