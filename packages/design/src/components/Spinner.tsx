import type { HTMLAttributes } from 'react';

export type SpinnerSize = 'sm' | 'md' | 'lg';

export interface SpinnerProps extends HTMLAttributes<HTMLSpanElement> {
	size?:  SpinnerSize;
	label?: string;
}

export function Spinner( {
	size      = 'md',
	label     = 'Loading…',
	className = '',
	...rest
}: SpinnerProps ) {
	const classes = [
		'bw-spinner',
		`bw-spinner--${ size }`,
		className,
	].filter( Boolean ).join( ' ' );

	return (
		<span
			{ ...rest }
			className={ classes }
			role="status"
			aria-label={ label }
		/>
	);
}
