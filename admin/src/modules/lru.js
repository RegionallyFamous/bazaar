/**
 * LRU iframe pool — extracted from shell.js so it can be imported by views.js.
 */

export class LruIframeManager {
	constructor( container, cap ) {
		this.container = container;
		this.cap = cap;
		/** @type {Map<string, HTMLIFrameElement>} */
		this.frames = new Map();
		this.order = [];
	}

	activate( slug, url ) {
		for ( const f of this.frames.values() ) {
			f.classList.remove( 'bsh-iframe--visible' );
			f.setAttribute( 'aria-hidden', 'true' );
		}

		if ( this.frames.has( slug ) ) {
			const f = this.frames.get( slug );
			this._show( f );
			this._touch( slug );
			return f;
		}

		if ( this.frames.size >= this.cap ) {
			const lru = this.order[ 0 ];
			this.frames.get( lru )?.remove();
			this.frames.delete( lru );
			this.order.shift();
		}

		const sandbox = this._sandboxAttr( slug );
		const f = document.createElement( 'iframe' );
		f.id = `bsh-frame-${ slug }`;
		f.className = 'bsh-iframe';
		// Only set the sandbox attribute when the subclass requests it.
		// Omitting it entirely on trusted first-party pages (e.g. manage)
		// avoids the browser warning about allow-scripts + allow-same-origin.
		if ( sandbox ) {
			f.setAttribute( 'sandbox', sandbox );
		}
		f.referrerPolicy = 'same-origin';
		f.title = slug;
		f.setAttribute( 'aria-hidden', 'true' );
		f.addEventListener( 'load', () => this._show( f ), { once: true } );
		f.src = url;
		this.container.appendChild( f );
		this.frames.set( slug, f );
		this._touch( slug );
		return f;
	}

	destroy( slug ) {
		this.frames.get( slug )?.remove();
		this.frames.delete( slug );
		this.order = this.order.filter( ( s ) => s !== slug );
	}

	reload( slug ) {
		const f = this.frames.get( slug );
		if ( f ) {
			const s = f.src;
			f.src = '';
			f.src = s;
		}
	}

	/** Override in subclasses or via wareMap lookup for trust-level sandbox. */
	_sandboxAttr( /* slug */ ) {
		return 'allow-scripts allow-forms allow-same-origin allow-popups allow-downloads';
	}

	_show( f ) {
		f.classList.add( 'bsh-iframe--visible' );
		f.removeAttribute( 'aria-hidden' );
	}
	_touch( s ) {
		this.order = this.order.filter( ( x ) => x !== s );
		this.order.push( s );
	}
}

/**
 * Trust-level–aware LRU manager.
 * Reads sandbox policy from the wareMap by slug.
 */
export class TrustAwareLruManager extends LruIframeManager {
	constructor( container, cap, wareMap ) {
		super( container, cap );
		this.wareMap = wareMap;
	}

	_sandboxAttr( slug ) {
		// The built-in manage page is a trusted first-party admin page.
		// No sandbox needed — omitting the attribute avoids the browser's
		// "allow-scripts + allow-same-origin can escape sandboxing" warning.
		if ( slug === 'manage' ) {
			return '';
		}

		const trust = this.wareMap.get( slug )?.trust ?? 'standard';
		switch ( trust ) {
			case 'verified':
				// Highest trust: full sandbox + OAuth popup-escape for SSO flows.
				return 'allow-scripts allow-forms allow-same-origin allow-popups allow-downloads allow-popups-to-escape-sandbox allow-modals';
			case 'trusted':
				// Elevated trust: full sandbox access with modals.
				return 'allow-scripts allow-forms allow-same-origin allow-popups allow-downloads allow-modals';
			case 'standard':
			default:
				// Standard trust: basic sandbox without modal or OAuth escape.
				return 'allow-scripts allow-forms allow-same-origin allow-popups allow-downloads';
		}
	}
}
