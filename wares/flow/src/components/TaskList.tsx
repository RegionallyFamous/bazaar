import { useState, useCallback, useEffect } from 'react';
import type { Task }                        from '../types.ts';
import { loadTasks, saveTasks }             from '../hooks/useStore.ts';
import { bzr }                              from '@bazaar/client';

export default function TaskList() {
	const [ tasks, setTasks ] = useState<Task[]>( [] );
	const [ input, setInput ] = useState( '' );

	useEffect( () => {
		loadTasks()
			.then( setTasks )
			.catch( () => {
				bzr.toast( 'Could not load tasks. Please refresh.', 'error' );
			} );
	}, [] );

	const addTask = useCallback( () => {
		const text = input.trim();
		if ( ! text ) return;
		setInput( '' );
		setTasks( prev => {
			const next: Task[] = [ ...prev, { id: crypto.randomUUID(), text, done: false } ];
			saveTasks( next ).catch( () => bzr.toast( 'Could not save task.', 'error' ) );
			return next;
		} );
	}, [ input ] );

	const toggleTask = useCallback( ( id: string ) => {
		setTasks( prev => {
			const next = prev.map( t => t.id === id ? { ...t, done: ! t.done } : t );
			saveTasks( next ).catch( () => bzr.toast( 'Could not save tasks.', 'error' ) );
			return next;
		} );
	}, [] );

	const removeTask = useCallback( ( id: string ) => {
		setTasks( prev => {
			const next = prev.filter( t => t.id !== id );
			saveTasks( next ).catch( () => bzr.toast( 'Could not save tasks.', 'error' ) );
			return next;
		} );
	}, [] );

	const done  = tasks.filter( t => t.done ).length;
	const total = tasks.length;

	const clearDone = useCallback( () => {
		if ( ! window.confirm( `Remove ${ done } completed task${ done !== 1 ? 's' : '' }?` ) ) return;
		setTasks( prev => {
			const next = prev.filter( t => ! t.done );
			saveTasks( next ).catch( () => bzr.toast( 'Could not save tasks.', 'error' ) );
			return next;
		} );
	}, [ done ] );

	return (
		<div className="tasklist">
			<div className="tasklist__header">
				<span className="tasklist__title">Tasks</span>
				{ done > 0 && (
					<button className="tasklist__clear" onClick={ clearDone }>
						Clear done ({ done })
					</button>
				) }
				{ total > 0 && (
					<span className="tasklist__progress">{ done }/{ total }</span>
				) }
			</div>

			<form
				className="tasklist__form"
				onSubmit={ e => { e.preventDefault(); addTask(); } }
			>
				<input
					className="tasklist__input"
					type="text"
					value={ input }
					onChange={ e => setInput( e.target.value ) }
					placeholder="Add a task for this session…"
					maxLength={ 100 }
				/>
				<button className="tasklist__add-btn" type="submit">+</button>
			</form>

			{ tasks.length > 0 && (
				<ul className="tasklist__items">
					{ tasks.map( task => (
						<li key={ task.id } className={ `tasklist__item${ task.done ? ' tasklist__item--done' : '' }` }>
							<button
								className="tasklist__check"
								onClick={ () => toggleTask( task.id ) }
								aria-label={ task.done ? 'Mark undone' : 'Mark done' }
							>
								{ task.done ? '✓' : '○' }
							</button>
							<span className="tasklist__text">{ task.text }</span>
							<button
								className="tasklist__remove"
								onClick={ () => removeTask( task.id ) }
								aria-label="Remove task"
							>
								✕
							</button>
						</li>
					) ) }
				</ul>
			) }
		</div>
	);
}
