import type { HTMLAttributes, ReactNode } from 'react';

export type BadgeVariant = 'default' | 'accent' | 'success' | 'warning' | 'danger';
export type BadgeSize    = 'sm' | 'md';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
	variant?:  BadgeVariant;
	size?:     BadgeSize;
	children:  ReactNode;
}

export function Badge( {
	variant   = 'default',
	size      = 'md',
	className = '',
	children,
	...rest
}: BadgeProps ) {
	const classes = [
		'bw-badge',
		variant !== 'default' && `bw-badge--${ variant }`,
		size    === 'sm'      && 'bw-badge--sm',
		className,
	].filter( Boolean ).join( ' ' );

	return (
		<span { ...rest } className={ classes }>
			{ children }
		</span>
	);
}
