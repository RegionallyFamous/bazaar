import { useState, useCallback, useEffect } from 'react';
import type { Task }                        from '../types.ts';
import { loadTasks, saveTasks }             from '../hooks/useStore.ts';
import { bzr }                              from '@bazaar/client';

export default function TaskList() {
	const [ tasks, setTasks ]   = useState<Task[]>( [] );
	const [ input, setInput ]   = useState( '' );

	useEffect( () => {
		loadTasks()
			.then( setTasks )
			.catch( () => {
				bzr.toast( 'Could not load tasks. Please refresh.', 'error' );
			} );
	}, [] );

	const persist = useCallback( async ( next: Task[] ) => {
		setTasks( next );
		await saveTasks( next );
	}, [] );

	const addTask = useCallback( async () => {
		const text = input.trim();
		if ( ! text ) return;
		const next: Task[] = [
			...tasks,
			{ id: crypto.randomUUID(), text, done: false },
		];
		setInput( '' );
		await persist( next );
	}, [ input, tasks, persist ] );

	const toggleTask = useCallback( async ( id: string ) => {
		await persist( tasks.map( t => t.id === id ? { ...t, done: ! t.done } : t ) );
	}, [ tasks, persist ] );

	const removeTask = useCallback( async ( id: string ) => {
		await persist( tasks.filter( t => t.id !== id ) );
	}, [ tasks, persist ] );

	const clearDone = useCallback( async () => {
		if ( ! window.confirm( `Remove ${ done } completed task${ done !== 1 ? 's' : '' }?` ) ) return;
		await persist( tasks.filter( t => ! t.done ) );
	}, [ tasks, done, persist ] );

	const done  = tasks.filter( t => t.done ).length;
	const total = tasks.length;

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
