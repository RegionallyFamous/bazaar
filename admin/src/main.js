/**
 * Bazaar admin page — gallery interactions, drag-drop upload, enable/disable/delete.
 */

import './main.css';
import apiFetch from '@wordpress/api-fetch';
import { __, sprintf } from '@wordpress/i18n';

// Bootstrapped from wp_localize_script in BazaarPage::enqueue_assets().
const { restUrl, nonce, inShell } = window.bazaarData ?? {};

// When the manage page is embedded inside the Bazaar Shell iframe, suppress
// the full WordPress admin chrome (sidebar, admin bar, footer) so only the
// page content is visible.
if (window !== window.top) {
	document.documentElement.classList.add('bazaar-in-shell');
}

/**
 * Notify the parent shell of a ware state change.
 * Only fires when the manage page is running inside the shell iframe.
 * @param {string} type Event type: 'bazaar:ware-installed' | 'bazaar:ware-deleted' | 'bazaar:ware-toggled'
 * @param {Object} data Payload.
 */
function notifyShell(type, data) {
	if (inShell && window.parent !== window) {
		window.parent.postMessage({ type, ...data }, window.location.origin);
	}
}

apiFetch.use(apiFetch.createNonceMiddleware(nonce));
apiFetch.use(apiFetch.createRootURLMiddleware(restUrl + '/'));

// ---------------------------------------------------------------------------
// DOM references
// ---------------------------------------------------------------------------

const dropzone = document.getElementById('bazaar-dropzone');
const fileInput = document.getElementById('bazaar-file-input');
const progress = document.getElementById('bazaar-upload-progress');
const progressBar = document.getElementById('bazaar-upload-bar');
const progressLabel = document.getElementById('bazaar-upload-label');
const errorBox = document.getElementById('bazaar-upload-error');
const successBox = document.getElementById('bazaar-upload-success');
const gallery = document.getElementById('bazaar-gallery');
const wareCount = document.getElementById('bazaar-ware-count');
const emptyState = document.getElementById('bazaar-empty-state');
const noResults = document.getElementById('bazaar-no-results');
const filtersBar = document.getElementById('bazaar-filters');
const filterTabs = document.getElementById('bazaar-filter-tabs');
const searchInput = document.getElementById('bazaar-search');

// Guard: the script is only enqueued on the Bazaar manage page, but bail
// cleanly if any critical element is absent to avoid cascading TypeErrors.
if (
	!dropzone ||
	!fileInput ||
	!gallery ||
	!progress ||
	!progressBar ||
	!progressLabel ||
	!errorBox ||
	!successBox
) {
	throw new Error('Bazaar: required DOM elements not found — aborting init.');
}

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------

/** @type {XMLHttpRequest|null} */
let currentUploadXhr = null;

/** @type {ReturnType<typeof setTimeout>|null} */
let successTimer = null;

/** Current status-filter selection: 'all' | 'enabled' | 'disabled'. */
let currentFilter = 'all';

/**
 * Tracks the card currently awaiting inline delete confirmation.
 * @type {{ card: HTMLElement, slug: string, btn: HTMLButtonElement, strip: HTMLElement, autoCancel: ReturnType<typeof setTimeout>, tickInterval: ReturnType<typeof setInterval> }|null}
 */
let confirmState = null;

// ---------------------------------------------------------------------------
// Upload notices
// ---------------------------------------------------------------------------

/** @param {string} msg */
function showError(msg) {
	errorBox.textContent = msg;
	errorBox.hidden = false;
	successBox.hidden = true;
	clearTimeout(successTimer);
	setTimeout(() => {
		errorBox.hidden = true;
	}, 8000);
}

/** @param {string} msg */
function showSuccess(msg) {
	successBox.textContent = msg;
	successBox.hidden = false;
	errorBox.hidden = true;
	clearTimeout(successTimer);
	successTimer = setTimeout(() => {
		successBox.hidden = true;
	}, 5000);
}

// ---------------------------------------------------------------------------
// Progress bar
// ---------------------------------------------------------------------------

/** @param {number} pct 0–100 */
function setProgress(pct) {
	progress.hidden = false;
	progressBar.classList.remove('bazaar-upload-progress__bar--indeterminate');
	progressBar.style.width = `${Math.min(100, pct)}%`;
}

/** Switch to a shimmer animation while the server processes the archive. */
function setProgressIndeterminate() {
	progress.hidden = false;
	progressBar.classList.add('bazaar-upload-progress__bar--indeterminate');
}

function resetProgress() {
	progress.hidden = true;
	progressBar.classList.remove('bazaar-upload-progress__bar--indeterminate');
	progressBar.style.width = '0%';
	progressLabel.textContent = __('Uploading…', 'bazaar');
}

// ---------------------------------------------------------------------------
// Upload — XHR for real upload-progress events
// ---------------------------------------------------------------------------

/**
 * Upload a .wp file via XHR so we get genuine upload-progress events.
 * Resolves with the parsed JSON response on HTTP 2xx; rejects otherwise.
 *
 * @param {File} file
 * @return {Promise<{message: string, ware: Object}>} Parsed response with a user-facing message and the new ware object.
 */
function xhrUpload(file) {
	return new Promise((resolve, reject) => {
		const xhr = new XMLHttpRequest();
		const url = (restUrl || '') + '/wares';

		xhr.upload.addEventListener('progress', (e) => {
			if (e.lengthComputable) {
				// Scale to 0–80 %; the remaining 20 % covers server-side install.
				setProgress(Math.round((e.loaded / e.total) * 80));
			}
		});

		// File fully transferred — switch to indeterminate while server unpacks.
		xhr.upload.addEventListener('load', () => {
			setProgressIndeterminate();
			progressLabel.textContent = __('Installing…', 'bazaar');
		});

		xhr.addEventListener('load', () => {
			let data;
			try {
				data = JSON.parse(xhr.responseText);
			} catch {
				reject(new Error(__('Invalid server response.', 'bazaar')));
				return;
			}
			if (xhr.status >= 200 && xhr.status < 300) {
				resolve(data);
			} else {
				reject(new Error(data?.message ?? `HTTP ${xhr.status}`));
			}
		});

		xhr.addEventListener('error', () =>
			reject(new Error(__('Network error. Please try again.', 'bazaar')))
		);

		// 'abort' is a sentinel we handle quietly; no user-visible error needed.
		xhr.addEventListener('abort', () => reject(new Error('abort')));

		xhr.open('POST', url);
		xhr.setRequestHeader('X-WP-Nonce', nonce || '');

		const formData = new FormData();
		formData.append('file', file);
		xhr.send(formData);

		currentUploadXhr = xhr;
	});
}

/**
 * Validate extension, show progress, upload, and handle response.
 *
 * @param {File} file
 */
async function handleUpload(file) {
	if (!file.name.endsWith('.wp')) {
		showError(__('Please select a file with a .wp extension.', 'bazaar'));
		return;
	}

	errorBox.hidden = true;
	successBox.hidden = true;
	setProgress(1);
	dropzone.classList.add('bazaar-dropzone--uploading');

	try {
		const response = await xhrUpload(file);
		setProgress(100);
		showSuccess(response.message);
		insertWareCard(response.ware);
		updateWareCount(1);
		notifyShell('bazaar:ware-installed', { ware: response.ware });
	} catch (err) {
		if (err.message !== 'abort') {
			showError(
				err.message || __('Upload failed. Please try again.', 'bazaar')
			);
		}
	} finally {
		resetProgress();
		dropzone.classList.remove('bazaar-dropzone--uploading');
		fileInput.value = '';
		currentUploadXhr = null;
	}
}

// ---------------------------------------------------------------------------
// Drag and drop
// ---------------------------------------------------------------------------

dropzone.addEventListener('click', () => fileInput.click());

dropzone.addEventListener('keydown', (e) => {
	if (e.key === 'Enter' || e.key === ' ') {
		e.preventDefault();
		fileInput.click();
	}
	if (e.key === 'Escape' && currentUploadXhr) {
		currentUploadXhr.abort();
	}
});

fileInput.addEventListener('change', () => {
	const file = fileInput.files?.[0];
	if (file) {
		handleUpload(file);
	}
	// Return focus to the dropzone so keyboard users don't lose their place.
	dropzone.focus();
});

dropzone.addEventListener('dragover', (e) => {
	e.preventDefault();
	dropzone.classList.add('bazaar-dropzone--hover');
});

dropzone.addEventListener('dragleave', (e) => {
	// Only remove the hover style when leaving the dropzone itself,
	// not when the pointer moves over a child element inside it.
	if (dropzone.contains(e.relatedTarget)) {
		return;
	}
	dropzone.classList.remove('bazaar-dropzone--hover');
});

dropzone.addEventListener('drop', (e) => {
	e.preventDefault();
	dropzone.classList.remove('bazaar-dropzone--hover');
	const file = e.dataTransfer?.files?.[0];
	if (file) {
		handleUpload(file);
	}
});

// ---------------------------------------------------------------------------
// Inline delete confirmation
// ---------------------------------------------------------------------------

/**
 * Show an inline confirmation strip on the card and start a 5-second
 * auto-cancel countdown.
 *
 * @param {HTMLElement}       card
 * @param {string}            slug
 * @param {HTMLButtonElement} btn
 */
function startConfirm(card, slug, btn) {
	cancelConfirm(); // dismiss any previous pending confirmation

	btn.disabled = true;

	const strip = document.createElement('div');
	strip.className = 'bazaar-card__confirm';
	strip.setAttribute('role', 'group');
	strip.setAttribute('aria-label', __('Confirm deletion', 'bazaar'));

	const text = document.createElement('span');
	text.className = 'bazaar-card__confirm-text';
	text.textContent = __('Delete forever?', 'bazaar');

	const countdown = document.createElement('span');
	countdown.className = 'bazaar-card__confirm-countdown';
	countdown.setAttribute('aria-hidden', 'true');

	const cancelBtn = document.createElement('button');
	cancelBtn.type = 'button';
	cancelBtn.className = 'button bazaar-card__confirm-cancel';
	cancelBtn.textContent = __('Cancel', 'bazaar');
	cancelBtn.addEventListener('click', cancelConfirm);

	const deleteBtn = document.createElement('button');
	deleteBtn.type = 'button';
	deleteBtn.className = 'button bazaar-card__confirm-delete';
	deleteBtn.textContent = __('Delete', 'bazaar');
	deleteBtn.addEventListener('click', () => executeDelete(slug, card));

	strip.append(text, countdown, cancelBtn, deleteBtn);
	card.append(strip);

	let secondsLeft = 5;
	countdown.textContent = `(${secondsLeft})`;

	const tickInterval = setInterval(() => {
		secondsLeft--;
		countdown.textContent = `(${secondsLeft})`;
	}, 1000);

	const autoCancel = setTimeout(() => {
		clearInterval(tickInterval);
		cancelConfirm();
	}, 5000);

	confirmState = { card, slug, btn, strip, autoCancel, tickInterval };
	cancelBtn.focus();
}

function cancelConfirm() {
	if (!confirmState) {
		return;
	}
	const { btn, strip, autoCancel, tickInterval } = confirmState;
	clearTimeout(autoCancel);
	clearInterval(tickInterval);
	strip.remove();
	btn.disabled = false;
	btn.focus();
	confirmState = null;
}

/**
 * Perform the DELETE request after the user confirmed.
 *
 * @param {string}      slug
 * @param {HTMLElement} card
 */
async function executeDelete(slug, card) {
	if (confirmState) {
		const { btn, strip, autoCancel, tickInterval } = confirmState;
		clearTimeout(autoCancel);
		clearInterval(tickInterval);
		strip.remove();
		btn.disabled = true;
		confirmState = null;
	}

	card.classList.add('bazaar-card--loading');

	try {
		await apiFetch({
			path: `/wares/${encodeURIComponent(slug)}`,
			method: 'DELETE',
		});
		animateRemoveCard(card);
		updateWareCount(-1);
		notifyShell('bazaar:ware-deleted', { slug });
	} catch (err) {
		card.classList.remove('bazaar-card--loading');
		const deleteBtn = card.querySelector('[data-action="delete"]');
		if (deleteBtn) {
			/** @type {HTMLButtonElement} */ (deleteBtn).disabled = false;
		}
		showError(err?.message ?? __('Could not delete ware.', 'bazaar'));
	}
}

// Pressing Escape always cancels a pending inline confirmation.
document.addEventListener('keydown', (e) => {
	if (e.key === 'Escape' && confirmState) {
		cancelConfirm();
	}
});

// ---------------------------------------------------------------------------
// Gallery actions — toggle + delete via event delegation
// ---------------------------------------------------------------------------

gallery.addEventListener('change', async (e) => {
	const input = e.target;
	if (!input.matches('.bazaar-toggle__input')) {
		return;
	}

	const slug = input.dataset.slug;
	const enabled = input.checked;
	const card = document.getElementById(`bazaar-card-${slug}`);
	const label = input.closest('.bazaar-toggle');

	input.disabled = true;
	label?.classList.add('bazaar-toggle--loading');
	card?.classList.add('bazaar-card--loading');

	try {
		await apiFetch({
			path: `/wares/${encodeURIComponent(slug)}`,
			method: 'PATCH',
			data: { enabled },
		});

		card?.classList.toggle('bazaar-card--disabled', !enabled);
		card?.setAttribute('data-status', enabled ? 'enabled' : 'disabled');
		notifyShell('bazaar:ware-toggled', { slug, enabled });

		if (label) {
			const msg = enabled
				? __('Disable ware', 'bazaar')
				: __('Enable ware', 'bazaar');
			label.title = msg;
			input.setAttribute('aria-label', msg);
		}

		// Re-apply filter in case this ware's new status should hide it.
		applyFilters();
	} catch (err) {
		input.checked = !enabled;
		showError(
			err?.message ?? __('Could not update ware status.', 'bazaar')
		);
	} finally {
		input.disabled = false;
		label?.classList.remove('bazaar-toggle--loading');
		card?.classList.remove('bazaar-card--loading');
	}
});

gallery.addEventListener('click', (e) => {
	const btn = e.target.closest('[data-action="delete"]');
	if (!btn) {
		return;
	}

	const slug = btn.dataset.slug;
	const card = document.getElementById(`bazaar-card-${slug}`);
	if (card && slug) {
		startConfirm(card, slug, /** @type {HTMLButtonElement} */ (btn));
	}
});

// ---------------------------------------------------------------------------
// Filter and search
// ---------------------------------------------------------------------------

function applyFilters() {
	const q = searchInput?.value.toLowerCase().trim() ?? '';
	let visible = 0;
	const allCards = gallery.querySelectorAll('.bazaar-card');

	allCards.forEach((card) => {
		const name = (card.dataset.name ?? '').toLowerCase();
		const status = card.dataset.status ?? 'enabled';
		const matchesSearch = !q || name.includes(q);
		const matchesStatus =
			currentFilter === 'all' || status === currentFilter;
		const show = matchesSearch && matchesStatus;

		card.hidden = !show;
		if (show) {
			visible++;
		}
	});

	if (noResults) {
		noResults.hidden = visible > 0 || allCards.length === 0;
	}
}

searchInput?.addEventListener('input', applyFilters);

filterTabs?.addEventListener('click', (e) => {
	const btn = e.target.closest('[data-filter]');
	if (!btn) {
		return;
	}

	currentFilter = btn.dataset.filter;

	filterTabs.querySelectorAll('[data-filter]').forEach((tab) => {
		const active = tab === btn;
		tab.classList.toggle('bazaar-filter-tab--active', active);
		tab.setAttribute('aria-selected', String(active));
	});

	applyFilters();
});

// ---------------------------------------------------------------------------
// DOM update helpers
// ---------------------------------------------------------------------------

/**
 * Inject a new ware card into the gallery from the REST response object.
 *
 * @param {Object} ware
 */
function insertWareCard(ware) {
	if (emptyState) {
		emptyState.hidden = true;
	}
	if (filtersBar) {
		filtersBar.hidden = false;
	}
	document.getElementById('bazaar-app')?.classList.remove('bazaar-page--empty');

	const isEnabled = ware.enabled !== false;
	const iconUrl = `${window.bazaarData?.restUrl ?? ''}/serve/${encodeURIComponent(ware.slug)}/${encodeURIComponent(ware.icon ?? 'icon.svg')}`;
	const toggleLabel = isEnabled
		? __('Disable ware', 'bazaar')
		: __('Enable ware', 'bazaar');
	const deleteConfirm = sprintf(
		/* translators: %s: ware name */
		__('Delete "%s"? This cannot be undone.', 'bazaar'),
		ware.name
	);
	const deleteLabel = sprintf(
		/* translators: %s: ware name */
		__('Delete %s', 'bazaar'),
		ware.name
	);

	const authorHtml = ware.author
		? `<span class="bazaar-card__author">${sprintf(/* translators: %s: author name */ __('by %s', 'bazaar'), escHtml(ware.author))}</span>`
		: '';
	const descHtml = ware.description
		? `<p class="bazaar-card__description">${escHtml(ware.description)}</p>`
		: '';

	const card = document.createElement('article');
	card.className =
		'bazaar-card' + (isEnabled ? '' : ' bazaar-card--disabled');
	card.id = `bazaar-card-${ware.slug}`;
	card.dataset.slug = ware.slug;
	card.dataset.name = ware.name;
	card.dataset.status = isEnabled ? 'enabled' : 'disabled';
	card.setAttribute('role', 'listitem');

	card.innerHTML = `
		<div class="bazaar-card__content">
			<div class="bazaar-card__icon-wrap">
				<img src="${escAttr(iconUrl)}" alt="" class="bazaar-card__icon" width="48" height="48"
					onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 20 20%22><rect width=%2220%22 height=%2220%22 rx=%222%22 fill=%22%23ddd%22/></svg>'">
			</div>
			<div class="bazaar-card__body">
				<h3 class="bazaar-card__name">${escHtml(ware.name)}</h3>
				<p class="bazaar-card__meta">
					<span class="bazaar-card__version">v${escHtml(ware.version)}</span>
					${authorHtml}
				</p>
				${descHtml}
			</div>
			<div class="bazaar-card__actions">
				<label class="bazaar-toggle" title="${escAttr(toggleLabel)}">
					<input type="checkbox" class="bazaar-toggle__input"
						data-slug="${escAttr(ware.slug)}" data-action="toggle"
						${isEnabled ? 'checked' : ''}
						aria-label="${escAttr(toggleLabel)}">
					<span class="bazaar-toggle__slider" aria-hidden="true"></span>
				</label>
				<button type="button" class="button bazaar-card__delete"
					data-slug="${escAttr(ware.slug)}" data-action="delete"
					data-confirm="${escAttr(deleteConfirm)}"
					aria-label="${escAttr(deleteLabel)}">
					<span class="dashicons dashicons-trash" aria-hidden="true"></span>
				</button>
			</div>
		</div>`;

	gallery.prepend(card);
	applyFilters();
}

/**
 * Fade and shrink a card, then remove it from the DOM.
 *
 * @param {HTMLElement} card
 */
function animateRemoveCard(card) {
	card.classList.add('bazaar-card--removing');
	card.addEventListener('animationend', () => card.remove(), { once: true });
}

/**
 * Increment or decrement the displayed ware count using the data-count attribute
 * rather than parsing the rendered text content.
 *
 * @param {number} delta +1 or -1
 */
function updateWareCount(delta) {
	if (!wareCount) {
		return;
	}
	const current = parseInt(wareCount.dataset.count ?? '0', 10);
	const next = Math.max(0, current + delta);
	wareCount.dataset.count = String(next);
	wareCount.textContent = `(${next})`;
	if (emptyState) {
		emptyState.hidden = next > 0;
	}
}

// ---------------------------------------------------------------------------
// Escape utilities
// ---------------------------------------------------------------------------

/**
 * Minimal HTML-escape for dynamic content injected via innerHTML.
 * @param {string} str Raw string to escape.
 */
function escHtml(str) {
	return String(str)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

/**
 * Attribute-context escape (same rules as HTML escape in practice).
 * @param {string} str Raw string to escape.
 */
function escAttr(str) {
	return escHtml(str);
}
