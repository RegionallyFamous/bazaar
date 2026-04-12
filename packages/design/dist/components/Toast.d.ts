import { type ReactNode } from 'react';
export type ToastVariant = 'default' | 'success' | 'warning' | 'error';
export interface ToastItem {
    id: string;
    message: string;
    variant?: ToastVariant;
    leaving?: boolean;
}
type ShowToastFn = (message: string, variant?: ToastVariant, duration?: number) => void;
export interface ToastProviderProps {
    children: ReactNode;
}
export declare function ToastProvider({ children }: ToastProviderProps): import("react/jsx-runtime").JSX.Element;
/**
 * Returns a `showToast(message, variant?, duration?)` function.
 * Must be called inside a `<ToastProvider>`.
 */
export declare function useToast(): ShowToastFn;
export {};
//# sourceMappingURL=Toast.d.ts.map