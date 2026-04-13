import { useState, useEffect, useCallback, useRef } from 'react';
import { __ }       from '@wordpress/i18n';
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
	const initialTitle            = useRef( page.title );
	const initialContent          = useRef( page.content );

	useEffect( () => {
		setTitle( page.title );
		setContent( page.content );
		initialTitle.current   = page.title;
		initialContent.current = page.content;
	}, [ page.id, page.title, page.content ] );

	useEffect( () => {
		textareaRef.current?.focus();
	}, [ page.id ] );

	const handleCancel = useCallback( () => {
		const isDirty = title !== initialTitle.current || content !== initialContent.current;
		if ( isDirty && ! window.confirm( __( 'Discard unsaved changes?', 'bazaar' ) ) ) return;
		onCancel();
	}, [ title, content, onCancel ] );

	const handleKeyDown = useCallback( ( e: React.KeyboardEvent ) => {
		if ( ( e.metaKey || e.ctrlKey ) && e.key === 's' ) {
			e.preventDefault();
			onSave( { title, content } );
		}
		if ( e.key === 'Escape' ) {
			handleCancel();
		}
	}, [ title, content, onSave, handleCancel ] );

	return (
		<div className="tome-editor" onKeyDown={ handleKeyDown }>
			<div className="tome-editor__header">
				<input
					className="tome-editor__title"
					type="text"
					value={ title }
					onChange={ e => setTitle( e.target.value ) }
					placeholder={ __( 'Page title', 'bazaar' ) }
					aria-label={ __( 'Page title', 'bazaar' ) }
				/>
				<div className="tome-editor__actions">
					<button
						className="tome-editor__btn tome-editor__btn--save"
						onClick={ () => onSave( { title, content } ) }
					>
						{ __( 'Save', 'bazaar' ) }
					</button>
					<button
						className="tome-editor__btn tome-editor__btn--cancel"
						onClick={ handleCancel }
					>
						{ __( 'Cancel', 'bazaar' ) }
					</button>
				</div>
			</div>

			<textarea
				ref={ textareaRef }
				className="tome-editor__body"
				value={ content }
				onChange={ e => setContent( e.target.value ) }
				placeholder={ __( 'Write in markdown…', 'bazaar' ) }
				aria-label={ __( 'Page content', 'bazaar' ) }
				spellCheck
			/>

			<p className="tome-editor__hint">
				{ __( '⌘S to save · Esc to cancel · Markdown supported', 'bazaar' ) }
			</p>
		</div>
	);
}
