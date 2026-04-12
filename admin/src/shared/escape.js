/**
 * Shared HTML-escape helpers.
 *
 * Centralised here so shell.js, main.js, and nav.js all use the same
 * implementation and tests can import from one place.
 *
 * `esc` / `escHtml` / `escAttr` are intentionally separate named exports so
 * callers can document their intent at the call-site.
 */

/**
 * Escape a string for safe insertion as HTML body text or attribute value.
 * Escapes &, <, >, ", and ' (single quote).
 *
 * @param {unknown} s Value to escape — coerced to string.
 * @return {string} HTML-escaped string.
 */
export function escHtml( s ) {
	return String( s )
		.replace( /&/g, '&amp;' )
		.replace( /</g, '&lt;' )
		.replace( />/g, '&gt;' )
		.replace( /"/g, '&quot;' )
		.replace( /'/g, '&#39;' );
}

/**
 * Alias for `escHtml` — used in attribute-value context for clarity.
 *
 * @param {unknown} s Value to escape.
 * @return {string}
 */
export const escAttr = escHtml;

/**
 * Escape a string for insertion as HTML body text (no attribute quoting needed).
 * Escapes &, <, >, and " — omits the single-quote replacement for back-compat
 * with callers that use this inside innerHTML but not inside attribute strings.
 *
 * @param {unknown} s Value to escape.
 * @return {string} HTML-escaped string (body-text variant).
 */
export function esc( s ) {
	return String( s )
		.replace( /&/g, '&amp;' )
		.replace( /</g, '&lt;' )
		.replace( />/g, '&gt;' )
		.replace( /"/g, '&quot;' );
}
