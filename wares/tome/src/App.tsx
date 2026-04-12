import { useState, useEffect, useCallback } from 'react';
import Sidebar    from './components/Sidebar.tsx';
import PageView   from './components/PageView.tsx';
import PageEditor from './components/PageEditor.tsx';
import { loadPages, savePages, newPage } from './store.ts';
import type { Page } from './types.ts';
import './App.css';

type Mode = 'view' | 'edit';

export default function App() {
	const [ pages,    setPages    ] = useState<Page[]>( [] );
	const [ activeId, setActiveId ] = useState<string | null>( null );
	const [ mode,     setMode     ] = useState<Mode>( 'view' );
	const [ loading,  setLoading  ] = useState( true );

	useEffect( () => {
		loadPages().then( loaded => {
			setPages( loaded );
			if ( loaded.length > 0 ) setActiveId( loaded[ 0 ].id );
			setLoading( false );
		} );
	}, [] );

	const activePage = pages.find( p => p.id === activeId ) ?? null;

	const handleSelect = useCallback( ( id: string ) => {
		setActiveId( id );
		setMode( 'view' );
	}, [] );

	const handleNew = useCallback( async ( parentId: string | null ) => {
		const page    = newPage( parentId );
		const updated = [ ...pages, page ];
		setPages( updated );
		setActiveId( page.id );
		setMode( 'edit' );
		await savePages( updated );
	}, [ pages ] );

	const handleDelete = useCallback( async ( id: string ) => {
		const updated = pages.filter( p => p.id !== id && p.parentId !== id );
		setPages( updated );
		if ( activeId === id ) {
			setActiveId( updated.length > 0 ? updated[ 0 ].id : null );
			setMode( 'view' );
		}
		await savePages( updated );
	}, [ pages, activeId ] );

	const handleSave = useCallback( async ( patch: Pick<Page, 'title' | 'content'> ) => {
		if ( ! activeId ) return;
		const updated = pages.map( p =>
			p.id === activeId
				? { ...p, ...patch, updatedAt: new Date().toISOString() }
				: p,
		);
		setPages( updated );
		setMode( 'view' );
		await savePages( updated );
	}, [ pages, activeId ] );

	useEffect( () => {
		const handler = ( e: KeyboardEvent ) => {
			const meta = e.metaKey || e.ctrlKey;
			if ( meta && e.key === 'n' ) { e.preventDefault(); void handleNew( null ); }
			if ( meta && e.key === 'e' && activePage && mode === 'view' ) { e.preventDefault(); setMode( 'edit' ); }
			if ( e.key === '/' && mode === 'view' && document.activeElement?.tagName !== 'INPUT' ) {
				e.preventDefault();
				document.querySelector<HTMLInputElement>( '.tome-sidebar__search-input' )?.focus();
			}
		};
		window.addEventListener( 'keydown', handler );
		return () => window.removeEventListener( 'keydown', handler );
	}, [ activePage, mode, handleNew ] );

	if ( loading ) {
		return (
			<div className="tome-loading">
				<span>Loading Tome…</span>
			</div>
		);
	}

	return (
		<div className="tome">
			<Sidebar
				pages={ pages }
				activeId={ activeId }
				onSelect={ handleSelect }
				onNew={ handleNew }
				onDelete={ handleDelete }
			/>

			<main className="tome-main">
				{ ! activePage && (
					<div className="tome-empty">
						<div className="tome-empty__inner">
							<p className="tome-empty__icon">📖</p>
							<h2 className="tome-empty__heading">Your wiki is empty</h2>
							<p className="tome-empty__sub">Create your first page to get started.</p>
							<button
								className="tome-empty__cta"
								onClick={ () => void handleNew( null ) }
							>
								+ New page
							</button>
						</div>
					</div>
				) }

				{ activePage && mode === 'view' && (
					<PageView
						page={ activePage }
						onEdit={ () => setMode( 'edit' ) }
					/>
				) }

				{ activePage && mode === 'edit' && (
					<PageEditor
						page={ activePage }
						onSave={ handleSave }
						onCancel={ () => setMode( 'view' ) }
					/>
				) }
			</main>
		</div>
	);
}
