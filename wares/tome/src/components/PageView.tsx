import { useMemo }        from 'react';
import { __, sprintf }   from '@wordpress/i18n';
import { marked, Tokens } from 'marked';
import DOMPurify           from 'dompurify';
import type { Page } from '../types.ts';

interface Props {
	page:    Page;
	onEdit:  () => void;
}

marked.setOptions( { gfm: true, breaks: true } );

marked.use( {
	renderer: {
		link( token: Tokens.Link ) {
			const { href, title, text } = token;
			const titleAttr             = title ? ` title="${ title }"` : '';
			if ( href?.startsWith( 'http' ) ) {
				return `<a href="${ href }"${ titleAttr } target="_blank" rel="noopener noreferrer">${ text }</a>`;
			}
			return `<a href="${ href }"${ titleAttr }>${ text }</a>`;
		},
	},
} );

export default function PageView( { page, onEdit }: Props ) {
	const html = useMemo( () => {
		const raw = marked.parse( page.content || '' ) as string;
		return DOMPurify.sanitize( raw );
	}, [ page.content ] );

	return (
		<div className="tome-view">
			<div className="tome-view__header">
				<h1 className="tome-view__title">{ page.title || __( 'Untitled', 'bazaar' ) }</h1>
				<button className="tome-view__edit-btn" onClick={ onEdit } title={ __( 'Edit page (⌘E)', 'bazaar' ) }>
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
						<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
						<path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
					</svg>
					{ __( 'Edit', 'bazaar' ) }
				</button>
			</div>

			{ page.content ? (
				<div
					className="tome-view__body"
					/* eslint-disable-next-line react/no-danger */
					dangerouslySetInnerHTML={ { __html: html } }
				/>
			) : (
				<div className="tome-view__empty">
					<p>{ __( 'This page is empty.', 'bazaar' ) }</p>
					<button className="tome-view__empty-cta" onClick={ onEdit }>
						{ __( 'Start writing', 'bazaar' ) }
					</button>
				</div>
			) }

			<p className="tome-view__meta">
				{ sprintf(
					/* translators: %s: formatted date */
					__( 'Last updated %s', 'bazaar' ),
					new Date( page.updatedAt ).toLocaleDateString( undefined, {
						year: 'numeric', month: 'long', day: 'numeric',
					} )
				) }
			</p>
		</div>
	);
}
