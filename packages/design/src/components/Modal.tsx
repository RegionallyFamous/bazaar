import { useEffect, useCallback, type ReactNode } from 'react';

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
	const handleEsc = useCallback(
		( e: KeyboardEvent ) => { if ( e.key === 'Escape' ) onClose(); },
		[ onClose ],
	);

	useEffect( () => {
		if ( ! open ) return;
		document.addEventListener( 'keydown', handleEsc );
		return () => document.removeEventListener( 'keydown', handleEsc );
	}, [ open, handleEsc ] );

	if ( ! open ) return null;

	const modalClass = [
		'bw-modal',
		size !== 'md' && `bw-modal--${ size }`,
		className,
	].filter( Boolean ).join( ' ' );

	return (
		<div
			className="bw-modal-backdrop"
			onClick={ ( e ) => { if ( e.target === e.currentTarget ) onClose(); } }
			role="dialog"
			aria-modal
			aria-label={ title }
		>
			<div className={ modalClass }>
				{ title !== undefined && (
					<div className="bw-modal__header">
						<h2 className="bw-modal__title">{ title }</h2>
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
