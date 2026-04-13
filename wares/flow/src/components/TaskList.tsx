import { useState, useCallback, useEffect } from 'react';
import { __, _n, sprintf }                 from '@wordpress/i18n';
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
				bzr.toast( __( 'Could not load tasks. Please refresh.', 'bazaar' ), 'error' );
			} );
	}, [] );

	const addTask = useCallback( () => {
		const text = input.trim();
		if ( ! text ) return;
		setInput( '' );
		setTasks( prev => {
			const next: Task[] = [ ...prev, { id: crypto.randomUUID(), text, done: false } ];
			saveTasks( next ).catch( () => bzr.toast( __( 'Could not save task.', 'bazaar' ), 'error' ) );
			return next;
		} );
	}, [ input ] );

	const toggleTask = useCallback( ( id: string ) => {
		setTasks( prev => {
			const next = prev.map( t => t.id === id ? { ...t, done: ! t.done } : t );
			saveTasks( next ).catch( () => bzr.toast( __( 'Could not save tasks.', 'bazaar' ), 'error' ) );
			return next;
		} );
	}, [] );

	const removeTask = useCallback( ( id: string ) => {
		setTasks( prev => {
			const next = prev.filter( t => t.id !== id );
			saveTasks( next ).catch( () => bzr.toast( __( 'Could not save tasks.', 'bazaar' ), 'error' ) );
			return next;
		} );
	}, [] );

	const done  = tasks.filter( t => t.done ).length;
	const total = tasks.length;

	const clearDone = useCallback( () => {
		if ( ! window.confirm( sprintf(
			/* translators: %d: number of completed tasks */
			_n( 'Remove %d completed task?', 'Remove %d completed tasks?', done, 'bazaar' ),
			done
		) ) ) return;
		setTasks( prev => {
			const next = prev.filter( t => ! t.done );
			saveTasks( next ).catch( () => bzr.toast( __( 'Could not save tasks.', 'bazaar' ), 'error' ) );
			return next;
		} );
	}, [ done ] );

	return (
		<div className="tasklist">
			<div className="tasklist__header">
				<span className="tasklist__title">{ __( 'Tasks', 'bazaar' ) }</span>
				{ done > 0 && (
					<button className="tasklist__clear" onClick={ clearDone }>
						{ sprintf(
							/* translators: %d: number of completed tasks */
							__( 'Clear done (%d)', 'bazaar' ),
							done
						) }
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
					placeholder={ __( 'Add a task for this session…', 'bazaar' ) }
					maxLength={ 100 }
				/>
				<button className="tasklist__add-btn" type="submit" aria-label={ __( 'Add task', 'bazaar' ) }>+</button>
			</form>

			{ tasks.length > 0 && (
				<ul className="tasklist__items">
					{ tasks.map( task => (
						<li key={ task.id } className={ `tasklist__item${ task.done ? ' tasklist__item--done' : '' }` }>
							<button
								className="tasklist__check"
								onClick={ () => toggleTask( task.id ) }
								aria-label={ task.done ? __( 'Mark undone', 'bazaar' ) : __( 'Mark done', 'bazaar' ) }
							>
								{ task.done ? '✓' : '○' }
							</button>
							<span className="tasklist__text">{ task.text }</span>
							<button
								className="tasklist__remove"
								onClick={ () => removeTask( task.id ) }
								aria-label={ __( 'Remove task', 'bazaar' ) }
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
