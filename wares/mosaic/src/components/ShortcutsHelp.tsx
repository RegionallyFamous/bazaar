import { useEffect } from 'react';
import { __ }        from '@wordpress/i18n';

interface Props {
	open:    boolean;
	onClose: () => void;
}

function getShortcuts() {
	return [
		{ key: 'P',        description: __( 'Pencil tool', 'bazaar' ) },
		{ key: 'E',        description: __( 'Eraser tool', 'bazaar' ) },
		{ key: 'F',        description: __( 'Fill bucket tool', 'bazaar' ) },
		{ key: 'I',        description: __( 'Eyedropper tool', 'bazaar' ) },
		{ key: 'G',        description: __( 'Toggle grid', 'bazaar' ) },
		{ key: 'Ctrl + Z', description: __( 'Undo', 'bazaar' ) },
		{ key: 'Ctrl + Y', description: __( 'Redo', 'bazaar' ) },
		{ key: '?',        description: __( 'Show / hide shortcuts', 'bazaar' ) },
	];
}

export default function ShortcutsHelp( { open, onClose }: Props ) {
	useEffect( () => {
		if ( ! open ) return;
		function onKey( e: KeyboardEvent ) {
			if ( e.key === 'Escape' ) onClose();
		}
		window.addEventListener( 'keydown', onKey );
		return () => window.removeEventListener( 'keydown', onKey );
	}, [ open, onClose ] );

	if ( ! open ) return null;

	return (
		<div
			className="shortcuts-overlay"
			role="dialog"
			aria-modal
			aria-label={ __( 'Keyboard shortcuts', 'bazaar' ) }
			onClick={ ( e ) => { if ( e.target === e.currentTarget ) onClose(); } }
		>
			<div className="shortcuts-dialog">
				<div className="shortcuts-dialog__header">
					<h2 className="shortcuts-dialog__title">{ __( 'Keyboard Shortcuts', 'bazaar' ) }</h2>
					<button
						className="shortcuts-dialog__close"
						onClick={ onClose }
						aria-label={ __( 'Close shortcuts', 'bazaar' ) }
					>
						✕
					</button>
				</div>
				<table className="shortcuts-dialog__table">
					<tbody>
						{ getShortcuts().map( ( { key, description } ) => (
							<tr key={ key } className="shortcuts-dialog__row">
								<td className="shortcuts-dialog__key">
									<kbd>{ key }</kbd>
								</td>
								<td className="shortcuts-dialog__desc">{ description }</td>
							</tr>
						) ) }
					</tbody>
				</table>
			</div>
		</div>
	);
}
