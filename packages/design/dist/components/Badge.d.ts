import type { HTMLAttributes, ReactNode } from 'react';
export type BadgeVariant = 'default' | 'accent' | 'success' | 'warning' | 'danger';
export type BadgeSize = 'sm' | 'md';
export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
    variant?: BadgeVariant;
    size?: BadgeSize;
    children: ReactNode;
}
export declare function Badge({ variant, size, className, children, ...rest }: BadgeProps): import("react/jsx-runtime").JSX.Element;
//# sourceMappingURL=Badge.d.ts.map