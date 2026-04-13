/**
 * @bazaar/client — Inter-ware event bus.
 *
 * The Bazaar Shell acts as the message broker: wares subscribe to named events
 * and emit events to all other subscribed wares. Communication travels via
 * window.postMessage, brokered by the parent shell frame.
 *
 * Usage
 * ─────
 *   import { bzr } from '@bazaar/client';
 *
 *   // Subscribe
 *   const unsub = bzr.on( 'contact:selected', ( data ) => {
 *     console.log( 'Selected contact:', data );
 *   } );
 *   // Later: unsub(); to remove the handler.
 *
 *   // Emit (from a different ware)
 *   bzr.emit( 'contact:selected', { id: 42, name: 'Acme Corp' } );
 *
 *   // Navigate to another ware
 *   bzr.navigate( 'invoices', '/invoices/new?contact=42' );
 *
 *   // Show a shell toast
 *   bzr.toast( 'Saved!', 'success' );
 *
 *   // Update the nav badge on this ware's nav item
 *   bzr.badge( 3 );
 */

type Level = 'info' | 'success' | 'warning' | 'error';

export interface BazaarShellAPI {
  /** Subscribe to an inter-ware event. Returns an unsubscribe function. */
  on( event: string, handler: ( data: unknown ) => void ): () => void;
  /** Broadcast an event to all subscribed wares. */
  emit( event: string, data?: unknown ): void;
  /** Navigate the shell to a different ware (and optionally a sub-route). */
  navigate( ware: string, route?: string ): void;
  /** Show a toast notification in the shell chrome. */
  toast( message: string, level?: Level, duration?: number ): void;
  /** Update the badge count on this ware's nav item (0 to clear). */
  badge( count: number ): void;
}

/** @internal Tracks event → handler mappings for incoming events. */
const _handlers = new Map<string, Set<( data: unknown ) => void>>();

function _inShell(): boolean {
  return typeof window !== 'undefined' && window.parent !== window;
}

function _post( msg: unknown ): void {
  if ( _inShell() ) {
    window.parent.postMessage( msg, window.location.origin );
  }
}

// Listen for broadcast events from the shell.
if ( typeof window !== 'undefined' ) {
  window.addEventListener( 'message', ( event: MessageEvent ) => {
    if ( event.source !== window.parent ) return;
    if ( event.origin !== window.location.origin ) return;

    const { type, event: eventName, data } = ( event.data ?? {} ) as Record<string, unknown>;

    if ( type === 'bazaar:event' && typeof eventName === 'string' ) {
      _handlers.get( eventName )?.forEach( h => {
        try {
          h( data );
        } catch ( err ) {
          // One failing subscriber must not prevent others from receiving the event.
          console.error( '[bazaar] event subscriber error', err );
        }
      } );
    }

    if ( type === 'bazaar:route' && typeof data === 'string' ) {
      _handlers.get( '__route__' )?.forEach( h => {
        try {
          h( data );
        } catch ( err ) {
          console.error( '[bazaar] route subscriber error', err );
        }
      } );
    }
  } );
}

export const bzr: BazaarShellAPI = {
  on( event, handler ) {
    if ( ! _handlers.has( event ) ) _handlers.set( event, new Set() );
    _handlers.get( event )!.add( handler );
    // Tell the shell we want to receive this event.
    _post( { type: 'bazaar:subscribe', event } );
    return () => _handlers.get( event )?.delete( handler );
  },

  emit( event, data ) {
    _post( { type: 'bazaar:emit', event, data } );
  },

  navigate( ware, route ) {
    _post( { type: 'bazaar:navigate', ware, route } );
  },

  toast( message, level = 'info', duration = 4000 ) {
    _post( { type: 'bazaar:toast', message, level, duration } );
  },

  badge( count ) {
    _post( { type: 'bazaar:badge', count } );
  },
};

/**
 * Hook into shell-initiated navigation (deep links / shell navigate calls).
 * The shell sends { type: 'bazaar:route', route: '/some/path' } to the ware.
 *
 * Usage with React Router:
 *   onShellRoute( route => navigate( route ) );
 */
export function onShellRoute( handler: ( route: string ) => void ): () => void {
  return bzr.on( '__route__', handler as ( data: unknown ) => void );
}
