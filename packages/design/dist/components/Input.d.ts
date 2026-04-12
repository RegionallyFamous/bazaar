import type { InputHTMLAttributes, TextareaHTMLAttributes, SelectHTMLAttributes } from 'react';
export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
    label?: string;
    hint?: string;
    error?: string;
    wrapClass?: string;
}
export declare function Input({ label, hint, error, wrapClass, className, ...rest }: InputProps): import("react/jsx-runtime").JSX.Element;
export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
    label?: string;
    hint?: string;
    error?: string;
    wrapClass?: string;
}
export declare function Textarea({ label, hint, error, wrapClass, className, ...rest }: TextareaProps): import("react/jsx-runtime").JSX.Element;
export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
    label?: string;
    hint?: string;
    error?: string;
    wrapClass?: string;
}
export declare function Select({ label, hint, error, wrapClass, className, ...rest }: SelectProps): import("react/jsx-runtime").JSX.Element;
//# sourceMappingURL=Input.d.ts.map