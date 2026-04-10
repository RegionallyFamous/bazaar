/**
 * Bazaar Shell — Error boundary overlay.
 *
 * When a ware crashes (unhandled error / rejection reported via postMessage),
 * the shell renders a friendly error card inside the ware's iframe slot instead
 * of showing a blank white frame.
 *
 * Wares report errors via:
 *   window.parent.postMessage({ type: 'bazaar:error', message, stack }, origin)
 *
 * The WareServer also injects a tiny inline script into every HTML entry point
 * that catches window.onerror and window.onunhandledrejection and forwards them
 * to the parent shell so errors are surfaced even without explicit ware-side code.
 */

import { __, sprintf } from '@wordpress/i18n';

/** @type {Map<string, HTMLElement>} slug → overlay element */
const _overlays = new Map();

/**
 * Show an error overlay on top of a ware's iframe.
 *
 * @param {string}                 slug     Ware slug.
 * @param {string}                 message  Error message.
 * @param {string|null}            stack    Optional stack trace.
 * @param {HTMLElement}            mainEl   The #bsh-main container.
 * @param {(slug: string) => void} onReload Callback when the user clicks "Reload".
 */
export function showError(slug, message, stack, mainEl, onReload) {
	// Dismiss any existing overlay for this slug.
	dismissError(slug);

	const overlay = document.createElement('div');
	overlay.className = 'bsh-error-overlay';
	overlay.dataset.slug = slug;
	overlay.setAttribute('role', 'alert');

	const icon = document.createElement('span');
	icon.className = 'bsh-error-overlay__icon';
	icon.textContent = '⚠';
	icon.setAttribute('aria-hidden', 'true');

	const title = document.createElement('h2');
	title.className = 'bsh-error-overlay__title';
	title.textContent = sprintf(
		// translators: %s: ware slug/name
		__('"%s" encountered an error', 'bazaar'),
		slug
	);

	const msg = document.createElement('p');
	msg.className = 'bsh-error-overlay__message';
	msg.textContent = message ?? __('Unknown error', 'bazaar');

	const actions = document.createElement('div');
	actions.className = 'bsh-error-overlay__actions';

	const reloadBtn = document.createElement('button');
	reloadBtn.type = 'button';
	reloadBtn.className =
		'bsh-error-overlay__btn bsh-error-overlay__btn--primary';
	reloadBtn.textContent = __('Reload ware', 'bazaar');
	reloadBtn.addEventListener('click', () => {
		dismissError(slug);
		onReload(slug);
	});

	const dismissBtn = document.createElement('button');
	dismissBtn.type = 'button';
	dismissBtn.className = 'bsh-error-overlay__btn';
	dismissBtn.textContent = __('Dismiss', 'bazaar');
	dismissBtn.addEventListener('click', () => dismissError(slug));

	actions.append(reloadBtn, dismissBtn);
	overlay.append(icon, title, msg, actions);

	if (stack) {
		const details = document.createElement('details');
		details.className = 'bsh-error-overlay__details';
		const summary = document.createElement('summary');
		summary.textContent = __('Stack trace', 'bazaar');
		const pre = document.createElement('pre');
		pre.className = 'bsh-error-overlay__stack';
		pre.textContent = stack;
		details.append(summary, pre);
		overlay.appendChild(details);
	}

	mainEl.appendChild(overlay);
	_overlays.set(slug, overlay);
}

/**
 * Remove the error overlay for a ware (e.g. after it reloads successfully).
 * @param {string} slug
 */
export function dismissError(slug) {
	_overlays.get(slug)?.remove();
	_overlays.delete(slug);
}

/** Remove all overlays (e.g. on full shell reset). */
export function dismissAll() {
	for (const el of _overlays.values()) {
		el.remove();
	}
	_overlays.clear();
}
