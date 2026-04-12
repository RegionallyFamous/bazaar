import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
export function Button({ variant = 'secondary', size = 'md', loading = false, iconOnly = false, disabled, className = '', children, ...rest }) {
    const classes = [
        'bw-btn',
        `bw-btn--${variant}`,
        size !== 'md' && `bw-btn--${size}`,
        loading && 'bw-btn--loading',
        iconOnly && 'bw-btn--icon-only',
        className,
    ].filter(Boolean).join(' ');
    return (_jsxs("button", { ...rest, className: classes, disabled: disabled || loading, "aria-busy": loading || undefined, children: [loading && _jsx("span", { className: "bw-btn__spinner", "aria-hidden": "true" }), children] }));
}
//# sourceMappingURL=Button.js.map