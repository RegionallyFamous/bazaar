import { jsx as _jsx } from "react/jsx-runtime";
export function Spinner({ size = 'md', label = 'Loading…', className = '', ...rest }) {
    const classes = [
        'bw-spinner',
        `bw-spinner--${size}`,
        className,
    ].filter(Boolean).join(' ');
    return (_jsx("span", { ...rest, className: classes, role: "status", "aria-label": label }));
}
//# sourceMappingURL=Spinner.js.map