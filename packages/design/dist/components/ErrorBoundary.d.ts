import { Component, type ReactNode } from 'react';
export interface ErrorBoundaryProps {
    children: ReactNode;
    /**
     * Optional custom fallback renderer.  When provided it replaces the built-in
     * error card entirely, giving the ware full control over the error UI.
     */
    fallback?: (error: Error, reset: () => void) => ReactNode;
}
interface State {
    error: Error | null;
}
/**
 * React error boundary for Bazaar wares.
 *
 * - Catches uncaught render / lifecycle errors so the user sees a friendly
 *   card instead of a blank iframe.
 * - Forwards the error to the shell error overlay via postMessage so the shell
 *   can offer a "Reload ware" button (mirrors the WareServer global handler).
 * - Exposes an optional `fallback` prop for wares that need custom error UI.
 *
 * Usage:
 * ```tsx
 * import { ErrorBoundary } from '@bazaar/design';
 *
 * createRoot( el ).render(
 *   <StrictMode>
 *     <ErrorBoundary>
 *       <App />
 *     </ErrorBoundary>
 *   </StrictMode>
 * );
 * ```
 */
export declare class ErrorBoundary extends Component<ErrorBoundaryProps, State> {
    state: State;
    static getDerivedStateFromError(error: Error): State;
    componentDidCatch(error: Error): void;
    private reset;
    render(): ReactNode;
}
export {};
//# sourceMappingURL=ErrorBoundary.d.ts.map