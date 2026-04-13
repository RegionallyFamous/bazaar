import { useEffect, useCallback, useRef, type ReactNode } from 'react';

const FOCUSABLE = [
	'a[href]',
	'button:not([disabled])',
	'input:not([disabled])',
	'select:not([disabled])',
	'textarea:not([disabled])',
	'[tabindex]:not([tabindex="-1"])',
].join( ', ' );

export type ModalSize = 'sm' | 'md' | 'lg';

export interface ModalProps {
	open:       boolean;
	onClose:    () => void;
	title?:     string;
	size?:      ModalSize;
	footer?:    ReactNode;
	className?: string;
	children:   ReactNode;
}

export function Modal( {
	open,
	onClose,
	title,
	size      = 'md',
	footer,
	className = '',
	children,
}: ModalProps ) {
	const containerRef = useRef<HTMLDivElement>( null );
	const prevFocusRef = useRef<Element | null>( null );

	// Save and restore focus across open/close transitions.
	useEffect( () => {
		if ( open ) {
			prevFocusRef.current = document.activeElement;
			const first = containerRef.current?.querySelector<HTMLElement>( FOCUSABLE );
			( first ?? containerRef.current )?.focus();
		} else {
			( prevFocusRef.current as HTMLElement | null )?.focus();
		}
	}, [ open ] );

	// Trap Tab/Shift-Tab inside the modal and close on Escape.
	const handleKeyDown = useCallback( ( e: KeyboardEvent ) => {
		if ( e.key === 'Escape' ) {
			onClose();
			return;
		}
		if ( e.key !== 'Tab' ) return;
		const container = containerRef.current;
		if ( ! container ) return;
		const focusable = Array.from( container.querySelectorAll<HTMLElement>( FOCUSABLE ) );
		if ( focusable.length === 0 ) return;
		const first = focusable[ 0 ]!;
		const last  = focusable[ focusable.length - 1 ]!;
		if ( e.shiftKey && document.activeElement === first ) {
			e.preventDefault();
			last.focus();
		} else if ( ! e.shiftKey && document.activeElement === last ) {
			e.preventDefault();
			first.focus();
		}
	}, [ onClose ] );

	useEffect( () => {
		if ( ! open ) return;
		document.addEventListener( 'keydown', handleKeyDown );
		return () => document.removeEventListener( 'keydown', handleKeyDown );
	}, [ open, handleKeyDown ] );

	if ( ! open ) return null;

	const modalClass = [
		'bw-modal',
		size !== 'md' && `bw-modal--${ size }`,
		className,
	].filter( Boolean ).join( ' ' );

	const titleId = title ? 'bw-modal-title' : undefined;

	return (
		<div
			className="bw-modal-backdrop"
			onClick={ ( e ) => { if ( e.target === e.currentTarget ) onClose(); } }
		>
			<div
				ref={ containerRef }
				className={ modalClass }
				role="dialog"
				aria-modal
				aria-labelledby={ titleId }
				tabIndex={ -1 }
			>
				{ title !== undefined && (
					<div className="bw-modal__header">
						<h2 className="bw-modal__title" id={ titleId }>{ title }</h2>
						<button
							className="bw-modal__close"
							onClick={ onClose }
							aria-label="Close"
						>
							✕
						</button>
					</div>
				) }
				<div className="bw-modal__body">{ children }</div>
				{ footer && (
					<div className="bw-modal__footer">{ footer }</div>
				) }
			</div>
		</div>
	);
}
