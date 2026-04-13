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
    on(event: string, handler: (data: unknown) => void): () => void;
    /** Broadcast an event to all subscribed wares. */
    emit(event: string, data?: unknown): void;
    /** Navigate the shell to a different ware (and optionally a sub-route). */
    navigate(ware: string, route?: string): void;
    /** Show a toast notification in the shell chrome. */
    toast(message: string, level?: Level, duration?: number): void;
    /** Update the badge count on this ware's nav item (0 to clear). */
    badge(count: number): void;
}
export declare const bzr: BazaarShellAPI;
/**
 * Hook into shell-initiated navigation (deep links / shell navigate calls).
 * The shell sends { type: 'bazaar:route', route: '/some/path' } to the ware.
 *
 * Usage with React Router:
 *   onShellRoute( route => navigate( route ) );
 */
export declare function onShellRoute(handler: (route: string) => void): () => void;
export {};
//# sourceMappingURL=bus.d.ts.map