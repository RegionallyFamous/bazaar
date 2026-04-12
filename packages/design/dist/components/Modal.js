import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useCallback } from 'react';
export function Modal({ open, onClose, title, size = 'md', footer, className = '', children, }) {
    const handleEsc = useCallback((e) => { if (e.key === 'Escape')
        onClose(); }, [onClose]);
    useEffect(() => {
        if (!open)
            return;
        document.addEventListener('keydown', handleEsc);
        return () => document.removeEventListener('keydown', handleEsc);
    }, [open, handleEsc]);
    if (!open)
        return null;
    const modalClass = [
        'bw-modal',
        size !== 'md' && `bw-modal--${size}`,
        className,
    ].filter(Boolean).join(' ');
    return (_jsx("div", { className: "bw-modal-backdrop", onClick: (e) => { if (e.target === e.currentTarget)
            onClose(); }, role: "dialog", "aria-modal": true, "aria-label": title, children: _jsxs("div", { className: modalClass, children: [title !== undefined && (_jsxs("div", { className: "bw-modal__header", children: [_jsx("h2", { className: "bw-modal__title", children: title }), _jsx("button", { className: "bw-modal__close", onClick: onClose, "aria-label": "Close", children: "\u2715" })] })), _jsx("div", { className: "bw-modal__body", children: children }), footer && (_jsx("div", { className: "bw-modal__footer", children: footer }))] }) }));
}
//# sourceMappingURL=Modal.js.map