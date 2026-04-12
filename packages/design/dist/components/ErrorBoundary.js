import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Component } from 'react';
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
export class ErrorBoundary extends Component {
    constructor() {
        super(...arguments);
        this.state = { error: null };
        this.reset = () => {
            this.setState({ error: null });
        };
    }
    static getDerivedStateFromError(error) {
        return { error };
    }
    componentDidCatch(error) {
        // Forward to the shell error overlay (same protocol used by WareServer's
        // injected window.onerror handler, so the shell already knows how to handle it).
        if (typeof window !== 'undefined' && window.parent !== window) {
            try {
                window.parent.postMessage({ type: 'bazaar:error', message: error.message, stack: error.stack ?? '' }, window.location.origin);
            }
            catch {
                // Non-fatal: postMessage can fail if the parent is cross-origin.
            }
        }
    }
    render() {
        const { error } = this.state;
        if (!error)
            return this.props.children;
        if (this.props.fallback) {
            return this.props.fallback(error, this.reset);
        }
        return (_jsx("div", { style: styles.wrap, children: _jsxs("div", { style: styles.card, children: [_jsx("span", { style: styles.icon, "aria-hidden": "true", children: "\u26A0" }), _jsx("h2", { style: styles.title, children: "Something went wrong" }), _jsx("p", { style: styles.message, children: error.message }), _jsx("button", { style: styles.btn, onClick: this.reset, children: "Try again" })] }) }));
    }
}
/* Inline styles use CSS custom properties with safe fallbacks so the card
   renders correctly even before the design-system stylesheet loads. */
const styles = {
    wrap: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        background: 'var(--bw-bg, #f1f5f9)',
        fontFamily: 'system-ui, -apple-system, sans-serif',
    },
    card: {
        maxWidth: '420px',
        padding: '32px',
        background: 'var(--bw-surface, #fff)',
        border: '1px solid var(--bw-border, #e2e8f0)',
        borderRadius: 'var(--bw-radius, 8px)',
        boxShadow: 'var(--bw-shadow, 0 4px 16px rgba(0,0,0,.10))',
        textAlign: 'center',
    },
    icon: {
        fontSize: '32px',
        lineHeight: '1',
        display: 'block',
        marginBottom: '12px',
    },
    title: {
        margin: '0 0 8px',
        fontSize: '17px',
        fontWeight: 700,
        color: 'var(--bw-text, #0f172a)',
    },
    message: {
        margin: '0 0 20px',
        fontSize: '13px',
        color: 'var(--bw-text-muted, #475569)',
        wordBreak: 'break-word',
    },
    btn: {
        padding: '8px 20px',
        background: 'var(--bw-accent, #6366f1)',
        color: '#fff',
        border: 'none',
        borderRadius: 'var(--bw-radius-sm, 4px)',
        fontSize: '13px',
        fontWeight: 600,
        cursor: 'pointer',
    },
};
//# sourceMappingURL=ErrorBoundary.js.map