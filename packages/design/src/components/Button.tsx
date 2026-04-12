import type { ButtonHTMLAttributes, ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize    = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
	variant?:   ButtonVariant;
	size?:      ButtonSize;
	loading?:   boolean;
	iconOnly?:  boolean;
	children?:  ReactNode;
}

export function Button( {
	variant  = 'secondary',
	size     = 'md',
	loading  = false,
	iconOnly = false,
	disabled,
	className = '',
	children,
	...rest
}: ButtonProps ) {
	const classes = [
		'bw-btn',
		`bw-btn--${ variant }`,
		size !== 'md' && `bw-btn--${ size }`,
		loading   && 'bw-btn--loading',
		iconOnly  && 'bw-btn--icon-only',
		className,
	].filter( Boolean ).join( ' ' );

	return (
		<button
			{ ...rest }
			className={ classes }
			disabled={ disabled || loading }
			aria-busy={ loading || undefined }
		>
			{ loading && <span className="bw-btn__spinner" aria-hidden="true" /> }
			{ children }
		</button>
	);
}
