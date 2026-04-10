/**
 * Bazaar admin page — gallery interactions, drag-drop upload, enable/disable/delete.
 */

import apiFetch from '@wordpress/api-fetch';
import { __, sprintf } from '@wordpress/i18n';

// Bootstrapped from wp_localize_script in BazaarPage::enqueue_assets().
const { restUrl, nonce } = window.bazaarData ?? {};

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

// ---------------------------------------------------------------------------
// Upload helpers
// ---------------------------------------------------------------------------

/**
 * @param {string} msg
 */
function showError(msg) {
	errorBox.textContent = msg;
	errorBox.hidden = false;
	successBox.hidden = true;
	progressBar.style.width = '0%';
	setTimeout(() => {
		errorBox.hidden = true;
	}, 8000);
}

/**
 * @param {string} msg
 */
function showSuccess(msg) {
	successBox.textContent = msg;
	successBox.hidden = false;
	errorBox.hidden = true;
}

function setProgress(pct) {
	progress.hidden = false;
	progressBar.style.width = `${Math.min(100, pct)}%`;
}

function resetProgress() {
	progress.hidden = true;
	progressBar.style.width = '0%';
	progressLabel.textContent = __('Uploading…', 'bazaar');
}

/**
 * Upload a .wp File to POST /bazaar/v1/wares.
 *
 * @param {File} file
 */
async function uploadWare(file) {
	errorBox.hidden = true;
	successBox.hidden = true;

	if (!file.name.endsWith('.wp')) {
		showError(__('Please select a file with a .wp extension.', 'bazaar'));
		return;
	}

	setProgress(10);
	dropzone.classList.add('bazaar-dropzone--uploading');

	const formData = new FormData();
	formData.append('file', file);

	try {
		setProgress(40);
		progressLabel.textContent = __('Validating and installing…', 'bazaar');

		const response = await apiFetch({
			path: '/wares',
			method: 'POST',
			body: formData,
		});

		setProgress(100);
		showSuccess(response.message);
		insertWareCard(response.ware);
		updateWareCount(1);
	} catch (err) {
		showError(
			err?.message ?? __('Upload failed. Please try again.', 'bazaar')
		);
	} finally {
		resetProgress();
		dropzone.classList.remove('bazaar-dropzone--uploading');
		fileInput.value = '';
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
});

fileInput.addEventListener('change', () => {
	const file = fileInput.files?.[0];
	if (file) {
		uploadWare(file);
	}
});

dropzone.addEventListener('dragover', (e) => {
	e.preventDefault();
	dropzone.classList.add('bazaar-dropzone--hover');
});

dropzone.addEventListener('dragleave', () => {
	dropzone.classList.remove('bazaar-dropzone--hover');
});

dropzone.addEventListener('drop', (e) => {
	e.preventDefault();
	dropzone.classList.remove('bazaar-dropzone--hover');
	const file = e.dataTransfer?.files?.[0];
	if (file) {
		uploadWare(file);
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

	input.disabled = true;

	try {
		await apiFetch({
			path: `/wares/${encodeURIComponent(slug)}`,
			method: 'PATCH',
			data: { enabled },
		});

		if (card) {
			card.classList.toggle('bazaar-card--disabled', !enabled);
		}
		const label = input.closest('.bazaar-toggle');
		if (label) {
			const msg = enabled
				? __('Disable ware', 'bazaar')
				: __('Enable ware', 'bazaar');
			label.title = msg;
			input.setAttribute('aria-label', msg);
		}
	} catch (err) {
		// Revert the checkbox state on failure.
		input.checked = !enabled;
		showError(
			err?.message ?? __('Could not update ware status.', 'bazaar')
		);
	} finally {
		input.disabled = false;
	}
});

gallery.addEventListener('click', async (e) => {
	const btn = e.target.closest('[data-action="delete"]');
	if (!btn) {
		return;
	}

	const slug = btn.dataset.slug;
	const confirmMsg = btn.dataset.confirm;

	// eslint-disable-next-line no-alert
	if (!window.confirm(confirmMsg)) {
		return;
	}

	btn.disabled = true;

	try {
		await apiFetch({
			path: `/wares/${encodeURIComponent(slug)}`,
			method: 'DELETE',
		});

		const card = document.getElementById(`bazaar-card-${slug}`);
		card?.remove();
		updateWareCount(-1);
	} catch (err) {
		showError(err?.message ?? __('Could not delete ware.', 'bazaar'));
		btn.disabled = false;
	}
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

	const iconUrl = `${window.bazaarData?.restUrl ?? ''}/serve/${encodeURIComponent(ware.slug)}/${encodeURIComponent(ware.icon ?? 'icon.svg')}`;

	const card = document.createElement('article');
	card.className = 'bazaar-card';
	card.id = `bazaar-card-${ware.slug}`;
	card.dataset.slug = ware.slug;
	card.setAttribute('role', 'listitem');

	const authorHtml = ware.author
		? `<span class="bazaar-card__author">${sprintf(/* translators: %s: author name */ __('by %s', 'bazaar'), escHtml(ware.author))}</span>`
		: '';

	const descHtml = ware.description
		? `<p class="bazaar-card__description">${escHtml(ware.description)}</p>`
		: '';

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

	card.innerHTML = `
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
			<label class="bazaar-toggle" title="${escAttr(__('Disable ware', 'bazaar'))}">
				<input type="checkbox" class="bazaar-toggle__input" data-slug="${escAttr(ware.slug)}" data-action="toggle" checked
					aria-label="${escAttr(__('Disable ware', 'bazaar'))}">
				<span class="bazaar-toggle__slider" aria-hidden="true"></span>
			</label>
			<button type="button" class="button bazaar-card__delete"
				data-slug="${escAttr(ware.slug)}" data-action="delete"
				data-confirm="${escAttr(deleteConfirm)}"
				aria-label="${escAttr(deleteLabel)}">
				<span class="dashicons dashicons-trash" aria-hidden="true"></span>
			</button>
		</div>
	`;

	gallery.prepend(card);
}

/**
 * @param {number} delta
 */
function updateWareCount(delta) {
	if (!wareCount) {
		return;
	}
	const current = parseInt(wareCount.textContent.replace(/\D/g, ''), 10) || 0;
	const next = Math.max(0, current + delta);
	wareCount.textContent = `(${next})`;
	if (emptyState) {
		emptyState.hidden = next > 0;
	}
}

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
 * Attribute-context escape.
 * @param {string} str Raw string to escape.
 */
function escAttr(str) {
	return escHtml(str);
}
