import { useState, useCallback } from 'react';
import type { Page } from '../types.ts';

interface Props {
	pages:     Page[];
	activeId:  string | null;
	onSelect:  ( id: string ) => void;
	onNew:     ( parentId: string | null ) => void;
	onDelete:  ( id: string ) => void;
}

interface TreeNode {
	page:     Page;
	children: TreeNode[];
}

function buildTree( pages: Page[] ): TreeNode[] {
	const map = new Map<string, TreeNode>();
	const roots: TreeNode[] = [];

	for ( const page of pages ) {
		map.set( page.id, { page, children: [] } );
	}

	for ( const page of pages ) {
		const node = map.get( page.id )!;
		if ( page.parentId && map.has( page.parentId ) ) {
			map.get( page.parentId )!.children.push( node );
		} else {
			roots.push( node );
		}
	}

	return roots;
}

function PageNode( {
	node, depth, activeId, onSelect, onNew, onDelete,
}: {
	node: TreeNode;
	depth: number;
	activeId: string | null;
	onSelect:  ( id: string ) => void;
	onNew:     ( parentId: string | null ) => void;
	onDelete:  ( id: string ) => void;
} ) {
	const [ expanded, setExpanded ] = useState( true );
	const hasChildren               = node.children.length > 0;
	const isActive                  = node.page.id === activeId;

	return (
		<li className="tome-tree__item">
			<div
				className={ `tome-tree__row${ isActive ? ' tome-tree__row--active' : '' }` }
				style={ { paddingLeft: `${ 12 + depth * 16 }px` } }
			>
				{ hasChildren ? (
				<button
					className={ `tome-tree__toggle${ expanded ? ' tome-tree__toggle--open' : '' }` }
					onClick={ ( e ) => { e.stopPropagation(); setExpanded( v => ! v ); } }
					aria-label={ expanded ? 'Collapse' : 'Expand' }
					aria-expanded={ expanded }
				>
					›
				</button>
				) : (
					<span className="tome-tree__toggle-placeholder" />
				) }

				<button
					className="tome-tree__title"
					onClick={ () => onSelect( node.page.id ) }
				>
					{ node.page.title || 'Untitled' }
				</button>

				<div className="tome-tree__actions">
					<button
						className="tome-tree__action"
						onClick={ ( e ) => { e.stopPropagation(); onNew( node.page.id ); } }
						title="New child page"
					>
						+
					</button>
				<button
					className="tome-tree__action tome-tree__action--danger"
					onClick={ ( e ) => {
						e.stopPropagation();
						if ( window.confirm( `Delete "${ node.page.title || 'Untitled' }"? This cannot be undone.` ) ) {
							onDelete( node.page.id );
						}
					} }
					title="Delete page"
				>
					×
				</button>
				</div>
			</div>

			{ expanded && hasChildren && (
				<ul className="tome-tree__children">
					{ node.children.map( child => (
						<PageNode
							key={ child.page.id }
							node={ child }
							depth={ depth + 1 }
							activeId={ activeId }
							onSelect={ onSelect }
							onNew={ onNew }
							onDelete={ onDelete }
						/>
					) ) }
				</ul>
			) }
		</li>
	);
}

export default function Sidebar( { pages, activeId, onSelect, onNew, onDelete }: Props ) {
	const [ query, setQuery ] = useState( '' );

	const filtered = useCallback( () => {
		if ( ! query.trim() ) return pages;
		const q = query.toLowerCase();
		return pages.filter( p =>
			p.title.toLowerCase().includes( q ) ||
			p.content.toLowerCase().includes( q ),
		);
	}, [ pages, query ] );

	const displayPages = filtered();
	const tree         = buildTree( displayPages );

	return (
		<aside className="tome-sidebar">
			<div className="tome-sidebar__header">
				<span className="tome-sidebar__brand">Tome</span>
			</div>

			<div className="tome-sidebar__search">
				<input
					type="search"
					className="tome-sidebar__search-input"
					placeholder="Search…"
					value={ query }
					onChange={ e => setQuery( e.target.value ) }
					aria-label="Search pages"
				/>
			</div>

			<nav className="tome-sidebar__nav" aria-label="Pages">
				{ tree.length === 0 && (
					<p className="tome-sidebar__empty">
						{ query ? 'No results.' : 'No pages yet.' }
					</p>
				) }
				<ul className="tome-tree">
					{ tree.map( node => (
						<PageNode
							key={ node.page.id }
							node={ node }
							depth={ 0 }
							activeId={ activeId }
							onSelect={ onSelect }
							onNew={ onNew }
							onDelete={ onDelete }
						/>
					) ) }
				</ul>
			</nav>

			<div className="tome-sidebar__footer">
				<button
					className="tome-sidebar__new-btn"
					onClick={ () => onNew( null ) }
				>
					<span aria-hidden="true">+</span> New page
				</button>
			</div>
		</aside>
	);
}
