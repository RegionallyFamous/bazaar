import { jsx as _jsx } from "react/jsx-runtime";
export function Badge({ variant = 'default', size = 'md', className = '', children, ...rest }) {
    const classes = [
        'bw-badge',
        variant !== 'default' && `bw-badge--${variant}`,
        size === 'sm' && 'bw-badge--sm',
        className,
    ].filter(Boolean).join(' ');
    return (_jsx("span", { ...rest, className: classes, children: children }));
}
//# sourceMappingURL=Badge.js.map