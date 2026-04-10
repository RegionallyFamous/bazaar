/**
 * Bazaar Shell — Ware Inspector Panel (dev mode only).
 *
 * A slide-out drawer that shows live info about the active ware:
 *   - Context values (nonce age countdown, restUrl, slug, adminColor)
 *   - Recent REST calls (reported via bazaar:api-call postMessage)
 *   - Bus events emitted / received (reported via bazaar:bus-log postMessage)
 *   - Current badge count
 *   - Health check last result
 */

import { __ } from '@wordpress/i18n';

export class WareInspector {
	constructor() {
		this._visible = false;
		this._slug = null;
		this._ctx = {};

		/** @type {Array<{ts: number, method: string, path: string, status: number}>} */
		this._apiCalls = [];

		/** @type {Array<{ts: number, dir: 'emit'|'recv', event: string, data: unknown}>} */
		this._busLogs = [];

		this._nonceIssuedAt = Date.now();
		this._ticker = null;

		this._buildDOM();
	}

	_buildDOM() {
		this.panel = document.createElement('aside');
		this.panel.className = 'bsh-inspector';
		this.panel.setAttribute('aria-label', __('Ware Inspector', 'bazaar'));
		this.panel.hidden = true;

		const header = document.createElement('div');
		header.className = 'bsh-inspector__header';

		const title = document.createElement('span');
		title.className = 'bsh-inspector__title';
		title.textContent = __('Inspector', 'bazaar');

		const closeBtn = document.createElement('button');
		closeBtn.type = 'button';
		closeBtn.className = 'bsh-inspector__close';
		closeBtn.textContent = '✕';
		closeBtn.setAttribute('aria-label', __('Close inspector', 'bazaar'));
		closeBtn.addEventListener('click', () => this.hide());

		header.append(title, closeBtn);

		this.body = document.createElement('div');
		this.body.className = 'bsh-inspector__body';

		this.panel.append(header, this.body);
		document.body.appendChild(this.panel);
	}

	show(slug, ctx) {
		this._slug = slug;
		this._ctx = ctx;
		this._apiCalls = [];
		this._busLogs = [];
		this._nonceIssuedAt = Date.now();
		this._visible = true;
		this.panel.hidden = false;
		document.body.classList.add('bsh-inspector-open');
		this._startTick();
		this._render();
	}

	hide() {
		this._visible = false;
		this.panel.hidden = true;
		document.body.classList.remove('bsh-inspector-open');
		this._stopTick();
	}

	toggle(slug, ctx) {
		if (this._visible && this._slug === slug) {
			this.hide();
		} else {
			this.show(slug, ctx);
		}
	}

	/**
	 * Called from the shell's postMessage hub when a ware emits api-call or bus-log.
	 * @param {Object} entry
	 */
	onApiCall(entry) {
		this._apiCalls.unshift(entry);
		if (this._apiCalls.length > 20) {
			this._apiCalls.pop();
		}
		if (this._visible) {
			this._renderApiCalls();
		}
	}

	onBusLog(entry) {
		this._busLogs.unshift(entry);
		if (this._busLogs.length > 20) {
			this._busLogs.pop();
		}
		if (this._visible) {
			this._renderBusLogs();
		}
	}

	_startTick() {
		this._stopTick();
		this._ticker = setInterval(() => this._renderContext(), 1000);
	}
	_stopTick() {
		if (this._ticker) {
			clearInterval(this._ticker);
			this._ticker = null;
		}
	}

	_render() {
		this.body.innerHTML = '';

		this._ctxSection = this._section(__('Context', 'bazaar'));
		this._apiSection = this._section(__('REST Calls', 'bazaar'));
		this._busSection = this._section(__('Bus Events', 'bazaar'));

		this.body.append(
			this._ctxSection.el,
			this._apiSection.el,
			this._busSection.el
		);

		this._renderContext();
		this._renderApiCalls();
		this._renderBusLogs();
	}

	_section(title) {
		const el = document.createElement('details');
		el.open = true;
		el.className = 'bsh-inspector__section';
		const sum = document.createElement('summary');
		sum.textContent = title;
		const cnt = document.createElement('div');
		cnt.className = 'bsh-inspector__section-body';
		el.append(sum, cnt);
		return { el, cnt };
	}

	_renderContext() {
		const ctx = this._ctx;
		const ageSec = Math.floor((Date.now() - this._nonceIssuedAt) / 1000);
		const expIn = Math.max(0, 12 * 3600 - ageSec);
		const hh = String(Math.floor(expIn / 3600)).padStart(2, '0');
		const mm = String(Math.floor((expIn % 3600) / 60)).padStart(2, '0');
		const nonceColor = expIn < 600 ? 'bsh-inspector__val--warn' : '';

		this._ctxSection.cnt.innerHTML = `
			<dl class="bsh-inspector__dl">
				<div><dt>slug</dt>    <dd>${this._slug ?? '—'}</dd></div>
				<div><dt>nonce</dt>   <dd class="${nonceColor}">${(ctx.nonce ?? '').slice(0, 10)}… <small>(expires ${hh}h${mm}m)</small></dd></div>
				<div><dt>restUrl</dt> <dd>${ctx.restUrl ?? '—'}</dd></div>
				<div><dt>color</dt>   <dd>${ctx.adminColor ?? '—'}</dd></div>
				<div><dt>devMode</dt> <dd>${ctx.devUrl ? `<a href="${ctx.devUrl}" target="_blank">${ctx.devUrl}</a>` : 'off'}</dd></div>
			</dl>`;
	}

	_renderApiCalls() {
		if (!this._apiCalls.length) {
			this._apiSection.cnt.innerHTML =
				'<p class="bsh-inspector__empty">No calls yet.</p>';
			return;
		}
		this._apiSection.cnt.innerHTML =
			`<ul class="bsh-inspector__log">` +
			this._apiCalls
				.map((c) => {
					const ok = c.status >= 200 && c.status < 300;
					return (
						`<li class="${ok ? '' : 'bsh-inspector__log--error'}">` +
						`<code>[${c.method}]</code> ${c.path} ` +
						`<span class="bsh-inspector__status">${c.status}</span></li>`
					);
				})
				.join('') +
			`</ul>`;
	}

	_renderBusLogs() {
		if (!this._busLogs.length) {
			this._busSection.cnt.innerHTML =
				'<p class="bsh-inspector__empty">No events yet.</p>';
			return;
		}
		this._busSection.cnt.innerHTML =
			`<ul class="bsh-inspector__log">` +
			this._busLogs
				.map((e) => {
					const icon = e.dir === 'emit' ? '↑' : '↓';
					return `<li><code>${icon} ${e.event}</code></li>`;
				})
				.join('') +
			`</ul>`;
	}
}
