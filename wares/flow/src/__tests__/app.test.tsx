import { describe, it, expect, vi } from 'vitest';
import { render, act } from '@testing-library/react';
import React from 'react';
import App from '../App.tsx';

vi.stubGlobal( 'Notification', { permission: 'denied', requestPermission: vi.fn() } );

vi.mock( '@bazaar/client', () => ( {
	createWaredStore: () => ( {
		load: vi.fn().mockResolvedValue( undefined ),
		save: vi.fn().mockResolvedValue( undefined ),
	} ),
	bzr: { toast: vi.fn(), on: vi.fn( () => vi.fn() ), emit: vi.fn(), navigate: vi.fn() },
	getBazaarContext: vi.fn( () => { throw new Error( 'no context' ); } ),
} ) );

vi.mock( '@bazaar/design', () => ( {
	ErrorBoundary: ( { children }: { children: React.ReactNode } ) => <>{ children }</>,
	Toast: () => null,
} ) );

describe( 'App', () => {
	it( 'renders without crashing', async () => {
		let container!: HTMLElement;
		await act( async () => {
			( { container } = render( <App /> ) );
		} );
		expect( container ).toBeTruthy();
	} );

	it( 'shows Focus mode label', async () => {
		let getByText!: ReturnType<typeof render>[ 'getByText' ];
		await act( async () => {
			( { getByText } = render( <App /> ) );
		} );
		expect( getByText( /focus/i ) ).toBeInTheDocument();
	} );
} );
