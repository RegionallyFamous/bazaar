/**
 * Bazaar Shell — Notification center.
 *
 * Collects every toast/notify event into a persistent slide-out drawer so
 * messages are never lost after they auto-dismiss.
 */

import { __, sprintf } from '@wordpress/i18n';

const LS_DND = 'bazaar_notif_dnd';
const LS_ITEMS = 'bazaar_notifications';
const MAX_ITEMS = 100;

export class NotificationCenter {
	/**
	 * @param {{ root: HTMLElement, toolbar: HTMLElement }} opts
	 */
	constructor( { root, toolbar } ) {
		this._items = this._loadItems();
		this._unread = 0;
		this._open = false;
		this._dnd = this._loadDnd();
		this._root = root;

		this._bellBtn = this._buildBell( toolbar );
		this._drawer = this._buildDrawer( root );

		// Close on outside click.
		document.addEventListener( 'click', ( e ) => {
			if (
				this._open &&
				! this._drawer.contains( e.target ) &&
				e.target !== this._bellBtn
			) {
				this.close();
			}
		} );
		document.addEventListener( 'keydown', ( e ) => {
			if ( e.key === 'Escape' && this._open ) {
				this.close();
			}
		} );
	}

	/** True when Do Not Disturb is active (toasts are suppressed). */
	get dnd() {
		return this._dnd;
	}

	/**
	 * Record a new notification.
	 * Returns true if the caller should suppress the visible toast (DnD mode).
	 *
	 * @param {string}      slug
	 * @param {string}      message
	 * @param {string}      [level]
	 * @param {Object|null} [ware]  Ware index entry for the source.
	 * @return {boolean} Whether to suppress the popup toast.
	 */
	add( slug, message, level = 'info', ware = null ) {
		this._items.unshift( {
			id: String( Date.now() ) + '-' + String( Math.random() ),
			slug,
			message,
			level,
			// Store the display name as a plain string — avoids serializing a
			// potentially-stale ware object reference into localStorage.
			wareName: ware?.menu_title ?? ware?.name ?? null,
			time: Date.now(),
		} );
		if ( this._items.length > MAX_ITEMS ) {
			this._items.pop();
		}
		this._saveItems();
		if ( ! this._open ) {
			this._unread++;
			this._updateBell();
		}
		this._renderList();
		return this._dnd;
	}

	open() {
		this._open = true;
		this._unread = 0;
		this._updateBell();
		this._root.classList.add( 'bsh--notif-open' );
		this._bellBtn.classList.add( 'bsh-toolbar__btn--active' );
		this._bellBtn.setAttribute( 'aria-expanded', 'true' );
		this._renderList();
	}

	close() {
		this._open = false;
		this._root.classList.remove( 'bsh--notif-open' );
		this._bellBtn.classList.remove( 'bsh-toolbar__btn--active' );
		this._bellBtn.setAttribute( 'aria-expanded', 'false' );
	}

	toggle() {
		if ( this._open ) {
			this.close();
		} else {
			this.open();
		}
	}

	// ── Private ────────────────────────────────────────────────────────────

	_loadDnd() {
		try {
			return localStorage.getItem( LS_DND ) === '1';
		} catch {
			return false;
		}
	}

	_saveDnd() {
		try {
			localStorage.setItem( LS_DND, this._dnd ? '1' : '0' );
		} catch { /* non-fatal */ }
	}

	_loadItems() {
		try {
			const raw = localStorage.getItem( LS_ITEMS );
			if ( ! raw ) {
				return [];
			}
			const parsed = JSON.parse( raw );
			// Validate: must be an array of plain objects with the required fields.
			if ( ! Array.isArray( parsed ) ) {
				return [];
			}
			return parsed.filter(
				( x ) =>
					x &&
					typeof x.id === 'string' &&
					typeof x.message === 'string' &&
					typeof x.time === 'number'
			);
		} catch {
			return [];
		}
	}

	_saveItems() {
		try {
			// Persist only the fields needed for display — skip any transient state.
			const toStore = this._items.map( ( { id, slug, message, level, wareName, time } ) => (
				{ id, slug, message, level, wareName, time }
			) );
			localStorage.setItem( LS_ITEMS, JSON.stringify( toStore ) );
		} catch { /* non-fatal — localStorage may be full or blocked */ }
	}

	_updateBell() {
		let badge = this._bellBtn.querySelector( '.bsh-bell__badge' );
		if ( this._unread > 0 ) {
			const text = this._unread > 99 ? '99+' : String( this._unread );
			if ( badge ) {
				badge.textContent = text;
				badge.hidden = false;
			} else {
				badge = Object.assign( document.createElement( 'span' ), {
					className: 'bsh-bell__badge',
					textContent: text,
				} );
				this._bellBtn.appendChild( badge );
			}
		} else if ( badge ) {
			badge.hidden = true;
		}
	}

	_buildBell( toolbar ) {
		const btn = document.createElement( 'button' );
		btn.type = 'button';
		btn.className = 'bsh-toolbar__btn bsh-toolbar__btn--bell';
		btn.setAttribute( 'aria-label', __( 'Notifications', 'bazaar' ) );
		btn.setAttribute( 'aria-expanded', 'false' );
		btn.title = __( 'Notifications', 'bazaar' );
		btn.innerHTML =
			'<svg class="bsh-bell__icon" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
			'<path d="M8 1.5A4.5 4.5 0 0 0 3.5 6v3.5L2 11h12l-1.5-1.5V6A4.5 4.5 0 0 0 8 1.5Z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>' +
			'<path d="M6.5 12.5a1.5 1.5 0 0 0 3 0" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>' +
			'</svg>';
		btn.addEventListener( 'click', ( e ) => {
			e.stopPropagation();
			this.toggle();
		} );
		toolbar.appendChild( btn );
		return btn;
	}

	_buildDrawer( root ) {
		const drawer = document.createElement( 'div' );
		drawer.className = 'bsh-notif-drawer';
		drawer.setAttribute( 'role', 'dialog' );
		drawer.setAttribute( 'aria-label', __( 'Notifications', 'bazaar' ) );

		// ── Header
		const header = document.createElement( 'div' );
		header.className = 'bsh-notif-drawer__header';

		const title = Object.assign( document.createElement( 'span' ), {
			className: 'bsh-notif-drawer__title',
			textContent: __( 'Notifications', 'bazaar' ),
		} );

		const actions = document.createElement( 'div' );
		actions.className = 'bsh-notif-drawer__actions';

		// Do Not Disturb toggle
		const dndBtn = document.createElement( 'button' );
		dndBtn.type = 'button';
		dndBtn.className = 'bsh-notif-drawer__dnd' + ( this._dnd ? ' bsh-notif-drawer__dnd--on' : '' );
		dndBtn.setAttribute( 'aria-label', __( 'Do Not Disturb', 'bazaar' ) );
		dndBtn.title = __( 'Do Not Disturb', 'bazaar' );
		dndBtn.innerHTML = '<span class="dashicons dashicons-minus" aria-hidden="true"></span>';
		dndBtn.addEventListener( 'click', () => {
			this._dnd = ! this._dnd;
			this._saveDnd();
			dndBtn.classList.toggle( 'bsh-notif-drawer__dnd--on', this._dnd );
		} );

		// Clear all
		const clearBtn = document.createElement( 'button' );
		clearBtn.type = 'button';
		clearBtn.className = 'bsh-notif-drawer__clear';
		clearBtn.setAttribute( 'aria-label', __( 'Clear all notifications', 'bazaar' ) );
		clearBtn.title = __( 'Clear all', 'bazaar' );
		clearBtn.textContent = __( 'Clear all', 'bazaar' );
		clearBtn.addEventListener( 'click', () => {
			this._items = [];
			this._unread = 0;
			this._saveItems();
			this._updateBell();
			this._renderList();
		} );

		// Close
		const closeBtn = document.createElement( 'button' );
		closeBtn.type = 'button';
		closeBtn.className = 'bsh-notif-drawer__close';
		closeBtn.setAttribute( 'aria-label', __( 'Close notifications', 'bazaar' ) );
		closeBtn.innerHTML = '<span class="dashicons dashicons-no-alt" aria-hidden="true"></span>';
		closeBtn.addEventListener( 'click', () => this.close() );

		actions.append( dndBtn, clearBtn, closeBtn );
		header.append( title, actions );

		// ── List
		const list = document.createElement( 'ul' );
		list.className = 'bsh-notif-drawer__list';
		list.setAttribute( 'aria-live', 'polite' );
		list.setAttribute( 'aria-label', __( 'Notification list', 'bazaar' ) );
		this._list = list;

		drawer.append( header, list );
		root.appendChild( drawer );
		return drawer;
	}

	_renderList() {
		if ( ! this._list ) {
			return;
		}
		this._list.innerHTML = '';

		if ( this._items.length === 0 ) {
			const empty = Object.assign( document.createElement( 'li' ), {
				className: 'bsh-notif-drawer__empty',
				textContent: __( 'No notifications yet', 'bazaar' ),
			} );
			this._list.appendChild( empty );
			return;
		}

		const ICONS = {
			success: 'dashicons-yes-alt',
			warning: 'dashicons-warning',
			error: 'dashicons-dismiss',
			info: 'dashicons-info',
		};

		for ( const item of this._items ) {
			const li = document.createElement( 'li' );
			li.className = `bsh-notif-drawer__item bsh-notif-drawer__item--${ item.level }`;

			const icon = Object.assign( document.createElement( 'span' ), {
				className: `bsh-notif-drawer__icon dashicons ${ ICONS[ item.level ] ?? 'dashicons-info' }`,
			} );
			icon.setAttribute( 'aria-hidden', 'true' );

			const body = document.createElement( 'div' );
			body.className = 'bsh-notif-drawer__body';

			const msg = Object.assign( document.createElement( 'p' ), {
				className: 'bsh-notif-drawer__msg',
				textContent: item.message,
			} );

			const mins = Math.round( ( Date.now() - item.time ) / 60_000 );
			const timeStr = mins < 1
				? __( 'Just now', 'bazaar' )
				: sprintf(
					/* translators: %d: minutes ago */
					__( '%dm ago', 'bazaar' ),
					mins
				);
			const wareName = item.wareName ?? null;
			const meta = Object.assign( document.createElement( 'span' ), {
				className: 'bsh-notif-drawer__meta',
				textContent: wareName ? `${ wareName } · ${ timeStr }` : timeStr,
			} );

			body.append( msg, meta );

			const dismiss = document.createElement( 'button' );
			dismiss.type = 'button';
			dismiss.className = 'bsh-notif-drawer__dismiss';
			dismiss.setAttribute( 'aria-label', __( 'Dismiss notification', 'bazaar' ) );
			dismiss.innerHTML = '<span class="dashicons dashicons-no-alt" aria-hidden="true"></span>';
			const itemId = item.id;
			dismiss.addEventListener( 'click', () => {
				this._items = this._items.filter( ( x ) => x.id !== itemId );
				this._saveItems();
				this._renderList();
			} );

			li.append( icon, body, dismiss );
			this._list.appendChild( li );
		}
	}
}
