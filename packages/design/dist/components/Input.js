import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
function FieldWrapper({ label, hint, error, className = '', children }) {
    return (_jsxs("div", { className: `bw-field ${className}`.trim(), children: [label && _jsx("label", { className: "bw-label", children: label }), children, error && _jsx("span", { className: "bw-field__error", role: "alert", children: error }), !error && hint && _jsx("span", { className: "bw-field__hint", children: hint })] }));
}
export function Input({ label, hint, error, wrapClass, className = '', ...rest }) {
    const inputClass = [
        'bw-input',
        error && 'bw-input--error',
        className,
    ].filter(Boolean).join(' ');
    return (_jsx(FieldWrapper, { label: label, hint: hint, error: error, className: wrapClass, children: _jsx("input", { ...rest, className: inputClass, "aria-invalid": !!error || undefined }) }));
}
export function Textarea({ label, hint, error, wrapClass, className = '', ...rest }) {
    const textareaClass = [
        'bw-input',
        'bw-textarea',
        error && 'bw-input--error',
        className,
    ].filter(Boolean).join(' ');
    return (_jsx(FieldWrapper, { label: label, hint: hint, error: error, className: wrapClass, children: _jsx("textarea", { ...rest, className: textareaClass, "aria-invalid": !!error || undefined }) }));
}
export function Select({ label, hint, error, wrapClass, className = '', ...rest }) {
    const selectClass = [
        'bw-input',
        'bw-select',
        error && 'bw-input--error',
        className,
    ].filter(Boolean).join(' ');
    return (_jsx(FieldWrapper, { label: label, hint: hint, error: error, className: wrapClass, children: _jsx("select", { ...rest, className: selectClass, "aria-invalid": !!error || undefined }) }));
}
//# sourceMappingURL=Input.js.map