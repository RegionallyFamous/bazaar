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
		this.panel = document.createElement( 'aside' );
		this.panel.className = 'bsh-inspector';
		this.panel.setAttribute( 'aria-label', __( 'Ware Inspector', 'bazaar' ) );
		this.panel.hidden = true;

		const header = document.createElement( 'div' );
		header.className = 'bsh-inspector__header';

		const title = document.createElement( 'span' );
		title.className = 'bsh-inspector__title';
		title.textContent = __( 'Inspector', 'bazaar' );

		const closeBtn = document.createElement( 'button' );
		closeBtn.type = 'button';
		closeBtn.className = 'bsh-inspector__close';
		closeBtn.textContent = '\u2715';
		closeBtn.setAttribute( 'aria-label', __( 'Close inspector', 'bazaar' ) );
		closeBtn.addEventListener( 'click', () => this.hide() );

		header.append( title, closeBtn );

		this.body = document.createElement( 'div' );
		this.body.className = 'bsh-inspector__body';

		this.panel.append( header, this.body );
		document.body.appendChild( this.panel );
	}

	show( slug, ctx ) {
		this._slug = slug;
		this._ctx = ctx;
		this._apiCalls = [];
		this._busLogs = [];
		this._nonceIssuedAt = Date.now();
		this._visible = true;
		this.panel.hidden = false;
		document.body.classList.add( 'bsh-inspector-open' );
		this._startTick();
		this._render();
	}

	hide() {
		this._visible = false;
		this.panel.hidden = true;
		document.body.classList.remove( 'bsh-inspector-open' );
		this._stopTick();
	}

	toggle( slug, ctx ) {
		if ( this._visible && this._slug === slug ) {
			this.hide();
		} else {
			this.show( slug, ctx );
		}
	}

	/**
	 * Called from the shell's postMessage hub when a ware emits api-call or bus-log.
	 * @param {Object} entry
	 */
	onApiCall( entry ) {
		this._apiCalls.unshift( entry );
		if ( this._apiCalls.length > 20 ) {
			this._apiCalls.pop();
		}
		if ( this._visible ) {
			this._renderApiCalls();
		}
	}

	onBusLog( entry ) {
		this._busLogs.unshift( entry );
		if ( this._busLogs.length > 20 ) {
			this._busLogs.pop();
		}
		if ( this._visible ) {
			this._renderBusLogs();
		}
	}

	_startTick() {
		this._stopTick();
		this._ticker = setInterval( () => this._renderContext(), 1000 );
	}

	_stopTick() {
		if ( this._ticker ) {
			clearInterval( this._ticker );
			this._ticker = null;
		}
	}

	_render() {
		this.body.innerHTML = '';

		this._ctxSection = this._section( __( 'Context', 'bazaar' ) );
		this._apiSection = this._section( __( 'REST Calls', 'bazaar' ) );
		this._busSection = this._section( __( 'Bus Events', 'bazaar' ) );

		this.body.append(
			this._ctxSection.el,
			this._apiSection.el,
			this._busSection.el
		);

		this._renderContext();
		this._renderApiCalls();
		this._renderBusLogs();
	}

	_section( title ) {
		const el = document.createElement( 'details' );
		el.open = true;
		el.className = 'bsh-inspector__section';
		const sum = document.createElement( 'summary' );
		sum.textContent = title;
		const cnt = document.createElement( 'div' );
		cnt.className = 'bsh-inspector__section-body';
		el.append( sum, cnt );
		return { el, cnt };
	}

	_renderContext() {
		const ctx = this._ctx;
		const ageSec = Math.floor( ( Date.now() - this._nonceIssuedAt ) / 1000 );
		const expIn = Math.max( 0, ( 12 * 3600 ) - ageSec );
		const hh = String( Math.floor( expIn / 3600 ) ).padStart( 2, '0' );
		const mm = String( Math.floor( ( expIn % 3600 ) / 60 ) ).padStart( 2, '0' );
		const nonceColor = expIn < 600 ? 'bsh-inspector__val--warn' : '';

		const cnt = this._ctxSection.cnt;
		cnt.textContent = '';

		const dl = document.createElement( 'dl' );
		dl.className = 'bsh-inspector__dl';

		// All values are set via textContent — never interpolated into innerHTML.
		[
			[ 'slug', this._slug ?? '\u2014' ],
			[
				'nonce',
				`${ ( ctx.nonce ?? '' ).slice( 0, 10 ) }\u2026 (expires ${ hh }h${ mm }m)`,
				nonceColor,
			],
			[ 'restUrl', ctx.restUrl ?? '\u2014' ],
			[ 'color', ctx.adminColor ?? '\u2014' ],
		].forEach( ( [ key, val, cls ] ) => {
			const div = document.createElement( 'div' );
			const dt = document.createElement( 'dt' );
			dt.textContent = key;
			const dd = document.createElement( 'dd' );
			if ( cls ) {
				dd.className = cls;
			}
			dd.textContent = val;
			div.append( dt, dd );
			dl.appendChild( div );
		} );

		// devMode row — anchor href set only after URL scheme validation to
		// prevent javascript: / data: injection via a crafted dev_url.
		const devDiv = document.createElement( 'div' );
		const devDt = document.createElement( 'dt' );
		devDt.textContent = 'devMode';
		const devDd = document.createElement( 'dd' );
		if ( ctx.devUrl ) {
			try {
				const parsed = new URL( ctx.devUrl );
				if ( parsed.protocol === 'http:' || parsed.protocol === 'https:' ) {
					const a = document.createElement( 'a' );
					a.href = ctx.devUrl;
					a.target = '_blank';
					a.rel = 'noopener noreferrer';
					a.textContent = ctx.devUrl;
					devDd.appendChild( a );
				} else {
					devDd.textContent = ctx.devUrl;
				}
			} catch {
				devDd.textContent = ctx.devUrl;
			}
		} else {
			devDd.textContent = 'off';
		}
		devDiv.append( devDt, devDd );
		dl.appendChild( devDiv );

		cnt.appendChild( dl );
	}

	_renderApiCalls() {
		const cnt = this._apiSection.cnt;
		cnt.textContent = '';

		if ( ! this._apiCalls.length ) {
			const p = document.createElement( 'p' );
			p.className = 'bsh-inspector__empty';
			p.textContent = 'No calls yet.';
			cnt.appendChild( p );
			return;
		}

		const ul = document.createElement( 'ul' );
		ul.className = 'bsh-inspector__log';

		this._apiCalls.forEach( ( c ) => {
			const ok = c.status >= 200 && c.status < 300;
			const li = document.createElement( 'li' );
			if ( ! ok ) {
				li.className = 'bsh-inspector__log--error';
			}

			const code = document.createElement( 'code' );
			code.textContent = `[${ c.method }]`;

			const path = document.createTextNode( ` ${ c.path } ` );

			const status = document.createElement( 'span' );
			status.className = 'bsh-inspector__status';
			status.textContent = String( c.status );

			li.append( code, path, status );
			ul.appendChild( li );
		} );

		cnt.appendChild( ul );
	}

	_renderBusLogs() {
		const cnt = this._busSection.cnt;
		cnt.textContent = '';

		if ( ! this._busLogs.length ) {
			const p = document.createElement( 'p' );
			p.className = 'bsh-inspector__empty';
			p.textContent = 'No events yet.';
			cnt.appendChild( p );
			return;
		}

		const ul = document.createElement( 'ul' );
		ul.className = 'bsh-inspector__log';

		this._busLogs.forEach( ( e ) => {
			const li = document.createElement( 'li' );
			const code = document.createElement( 'code' );
			code.textContent = `${ e.dir === 'emit' ? '\u2191' : '\u2193' } ${ e.event }`;
			li.appendChild( code );
			ul.appendChild( li );
		} );

		cnt.appendChild( ul );
	}
}
