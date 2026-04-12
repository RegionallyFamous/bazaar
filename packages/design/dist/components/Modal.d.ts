import { type ReactNode } from 'react';
export type ModalSize = 'sm' | 'md' | 'lg';
export interface ModalProps {
    open: boolean;
    onClose: () => void;
    title?: string;
    size?: ModalSize;
    footer?: ReactNode;
    className?: string;
    children: ReactNode;
}
export declare function Modal({ open, onClose, title, size, footer, className, children, }: ModalProps): import("react/jsx-runtime").JSX.Element | null;
//# sourceMappingURL=Modal.d.ts.map