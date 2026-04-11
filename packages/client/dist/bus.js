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
/** @internal Tracks event → handler mappings for incoming events. */
const _handlers = new Map();
function _inShell() {
    return typeof window !== 'undefined' && window.parent !== window;
}
function _post(msg) {
    if (_inShell()) {
        window.parent.postMessage(msg, window.location.origin);
    }
}
// Listen for broadcast events from the shell.
if (typeof window !== 'undefined') {
    window.addEventListener('message', (event) => {
        if (event.source !== window.parent)
            return;
        if (event.origin !== window.location.origin)
            return;
        const { type, event: eventName, data } = (event.data ?? {});
        if (type === 'bazaar:event' && typeof eventName === 'string') {
            _handlers.get(eventName)?.forEach(h => h(data));
        }
        if (type === 'bazaar:route' && typeof data === 'string') {
            _handlers.get('__route__')?.forEach(h => h(data));
        }
    });
}
export const bzr = {
    on(event, handler) {
        if (!_handlers.has(event))
            _handlers.set(event, new Set());
        _handlers.get(event).add(handler);
        // Tell the shell we want to receive this event.
        _post({ type: 'bazaar:subscribe', event });
        return () => _handlers.get(event)?.delete(handler);
    },
    emit(event, data) {
        _post({ type: 'bazaar:emit', event, data });
    },
    navigate(ware, route) {
        _post({ type: 'bazaar:navigate', ware, route });
    },
    toast(message, level = 'info', duration = 4000) {
        _post({ type: 'bazaar:toast', message, level, duration });
    },
    badge(count) {
        _post({ type: 'bazaar:badge', count });
    },
};
/**
 * Hook into shell-initiated navigation (deep links / shell navigate calls).
 * The shell sends { type: 'bazaar:route', route: '/some/path' } to the ware.
 *
 * Usage with React Router:
 *   onShellRoute( route => navigate( route ) );
 */
export function onShellRoute(handler) {
    return bzr.on('__route__', handler);
}
//# sourceMappingURL=bus.js.map