/**
 * Bazaar Shell — view modes: fullscreen, pop-out.
 */

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
		`width=${ w },height=${ h },left=${ left },top=${ top },resizable=yes,scrollbars=yes,toolbar=no,menubar=no,noopener`
	);
}

