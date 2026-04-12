import type { HTMLAttributes } from 'react';
export type SpinnerSize = 'sm' | 'md' | 'lg';
export interface SpinnerProps extends HTMLAttributes<HTMLSpanElement> {
    size?: SpinnerSize;
    label?: string;
}
export declare function Spinner({ size, label, className, ...rest }: SpinnerProps): import("react/jsx-runtime").JSX.Element;
//# sourceMappingURL=Spinner.d.ts.map