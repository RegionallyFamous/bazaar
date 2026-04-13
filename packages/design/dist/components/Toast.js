import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { createContext, useCallback, useContext, useEffect, useReducer, useRef, } from 'react';
function reducer(state, action) {
    switch (action.type) {
        case 'add':
            return [...state, action.payload];
        case 'leave':
            return state.map(t => t.id === action.id ? { ...t, leaving: true } : t);
        case 'remove':
            return state.filter(t => t.id !== action.id);
        default:
            return state;
    }
}
const ToastContext = createContext(() => { });
export function ToastProvider({ children }) {
    const [toasts, dispatch] = useReducer(reducer, []);
    const counter = useRef(0);
    // Track all active timer IDs so they can be cleared on unmount.
    const timersRef = useRef([]);
    useEffect(() => {
        return () => {
            timersRef.current.forEach(clearTimeout);
            timersRef.current = [];
        };
    }, []);
    const showToast = useCallback((message, variant = 'default', duration = 3500) => {
        const id = `toast-${++counter.current}`;
        dispatch({ type: 'add', payload: { id, message, variant } });
        const leaveTimer = setTimeout(() => {
            dispatch({ type: 'leave', id });
            const removeTimer = setTimeout(() => dispatch({ type: 'remove', id }), 200);
            timersRef.current.push(removeTimer);
        }, duration);
        timersRef.current.push(leaveTimer);
    }, []);
    return (_jsxs(ToastContext.Provider, { value: showToast, children: [children, _jsx("div", { className: "bw-toasts", "aria-live": "polite", "aria-atomic": "true", children: toasts.map(toast => (_jsx("div", { className: [
                        'bw-toast',
                        toast.variant && toast.variant !== 'default' && `bw-toast--${toast.variant}`,
                        toast.leaving && 'bw-toast--out',
                    ].filter(Boolean).join(' '), children: _jsx("span", { className: "bw-toast__msg", children: toast.message }) }, toast.id))) })] }));
}
// ── Hook ──────────────────────────────────────────────────────────────────
/**
 * Returns a `showToast(message, variant?, duration?)` function.
 * Must be called inside a `<ToastProvider>`.
 */
export function useToast() {
    return useContext(ToastContext);
}
//# sourceMappingURL=Toast.js.map