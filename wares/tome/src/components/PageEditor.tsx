import { useState, useEffect, useCallback, useRef } from 'react';
import type { Page } from '../types.ts';

interface Props {
	page:     Page;
	onSave:   ( updated: Pick<Page, 'title' | 'content'> ) => void;
	onCancel: () => void;
}

export default function PageEditor( { page, onSave, onCancel }: Props ) {
	const [ title,   setTitle   ] = useState( page.title );
	const [ content, setContent ] = useState( page.content );
	const textareaRef             = useRef<HTMLTextAreaElement>( null );

	useEffect( () => {
		setTitle( page.title );
		setContent( page.content );
	}, [ page.id, page.title, page.content ] );

	useEffect( () => {
		textareaRef.current?.focus();
	}, [ page.id ] );

	const handleKeyDown = useCallback( ( e: React.KeyboardEvent ) => {
		if ( ( e.metaKey || e.ctrlKey ) && e.key === 's' ) {
			e.preventDefault();
			onSave( { title, content } );
		}
		if ( e.key === 'Escape' ) {
			onCancel();
		}
	}, [ title, content, onSave, onCancel ] );

	return (
		<div className="tome-editor" onKeyDown={ handleKeyDown }>
			<div className="tome-editor__header">
				<input
					className="tome-editor__title"
					type="text"
					value={ title }
					onChange={ e => setTitle( e.target.value ) }
					placeholder="Page title"
					aria-label="Page title"
				/>
				<div className="tome-editor__actions">
					<button
						className="tome-editor__btn tome-editor__btn--save"
						onClick={ () => onSave( { title, content } ) }
					>
						Save
					</button>
					<button
						className="tome-editor__btn tome-editor__btn--cancel"
						onClick={ onCancel }
					>
						Cancel
					</button>
				</div>
			</div>

			<textarea
				ref={ textareaRef }
				className="tome-editor__body"
				value={ content }
				onChange={ e => setContent( e.target.value ) }
				placeholder="Write in markdown…"
				aria-label="Page content"
				spellCheck
			/>

			<p className="tome-editor__hint">
				⌘S to save · Esc to cancel · Markdown supported
			</p>
		</div>
	);
}
