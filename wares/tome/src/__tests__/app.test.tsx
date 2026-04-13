import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from '../App.tsx';

vi.mock( '@bazaar/client', () => ( {
	createWaredStore: vi.fn( () => ( {
		load: vi.fn().mockResolvedValue( undefined ),
		save: vi.fn().mockResolvedValue( undefined ),
	} ) ),
	bzr: {
		on:       vi.fn( () => vi.fn() ),
		emit:     vi.fn(),
		toast:    vi.fn(),
		navigate: vi.fn(),
	},
	getBazaarContext: vi.fn( () => { throw new Error( 'no context' ); } ),
} ) );

vi.mock( '@bazaar/design', () => ( {
	ErrorBoundary: ( { children }: { children: React.ReactNode } ) => <>{ children }</>,
	Toast:         () => null,
} ) );

vi.mock( 'marked', () => ( {
	marked: {
		setOptions: vi.fn(),
		use:        vi.fn(),
		parse:      vi.fn( () => '<p>content</p>' ),
	},
	Tokens: {},
} ) );

vi.mock( 'dompurify', () => ( {
	default: {
		sanitize: vi.fn( ( html: string ) => html ),
	},
} ) );

beforeEach( () => vi.clearAllMocks() );

describe( 'App', () => {
	it( 'renders without crashing', () => {
		const { container } = render( <App /> );
		expect( container ).toBeTruthy();
	} );

	it( 'shows the loading state initially', () => {
		const { container } = render( <App /> );
		// While the async loadPages() promise is pending, the loading spinner is shown
		expect( container.firstChild ).toBeTruthy();
	} );

	it( 'renders the Tome wrapper element after pages load', async () => {
		render( <App /> );
		// loadPages resolves to undefined → empty pages list → empty state screen
		const emptyHeading = await screen.findByText( 'Your wiki is empty' );
		expect( emptyHeading ).toBeInTheDocument();
	} );

	it( 'shows the New page CTA when there are no pages', async () => {
		render( <App /> );
		const cta = await screen.findByText( '+ New page' );
		expect( cta ).toBeInTheDocument();
	} );
} );
