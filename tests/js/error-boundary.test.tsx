/**
 * Tests for packages/design/src/components/ErrorBoundary.tsx
 *
 * Verifies:
 *   - Child render errors are caught and the fallback UI is shown
 *   - The error is forwarded to window.parent via postMessage
 *   - A custom `fallback` prop is rendered when provided
 *   - Calling reset() remounts the child
 */

import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { ErrorBoundary } from '../../packages/design/src/components/ErrorBoundary.tsx';

/** A component that throws during render when `shouldThrow` is true. */
function Bomb( { shouldThrow }: { shouldThrow: boolean } ) {
	if ( shouldThrow ) {
		throw new Error( 'Boom!' );
	}
	return <div>OK</div>;
}

/** Suppress React's console.error during tests that expect thrown errors. */
const noop = () => {};
let consoleError: typeof console.error;

beforeEach( () => {
	consoleError = console.error;
	console.error = noop;
} );

afterEach( () => {
	console.error = consoleError;
} );

// ─── Default fallback UI ──────────────────────────────────────────────────────

describe( 'ErrorBoundary — default fallback', () => {
	it( 'renders children when there is no error', () => {
		render(
			<ErrorBoundary>
				<Bomb shouldThrow={ false } />
			</ErrorBoundary>
		);
		expect( screen.getByText( 'OK' ) ).toBeInTheDocument();
	} );

	it( 'renders the default error card when a child throws', () => {
		render(
			<ErrorBoundary>
				<Bomb shouldThrow />
			</ErrorBoundary>
		);
		expect( screen.getByText( 'Something went wrong' ) ).toBeInTheDocument();
		expect( screen.getByText( 'Boom!' ) ).toBeInTheDocument();
	} );

	it( 'shows a Try again button in the default fallback', () => {
		render(
			<ErrorBoundary>
				<Bomb shouldThrow />
			</ErrorBoundary>
		);
		expect( screen.getByRole( 'button', { name: 'Try again' } ) ).toBeInTheDocument();
	} );
} );

// ─── Custom fallback prop ─────────────────────────────────────────────────────

describe( 'ErrorBoundary — custom fallback prop', () => {
	it( 'renders the custom fallback instead of the default card', () => {
		const CustomFallback = ( error: Error, reset: () => void ) => (
			<div>
				<p>Custom: { error.message }</p>
				<button onClick={ reset }>Retry</button>
			</div>
		);

		render(
			<ErrorBoundary fallback={ CustomFallback }>
				<Bomb shouldThrow />
			</ErrorBoundary>
		);

		expect( screen.getByText( 'Custom: Boom!' ) ).toBeInTheDocument();
		expect( screen.queryByText( 'Something went wrong' ) ).not.toBeInTheDocument();
	} );
} );

// ─── Reset / retry ────────────────────────────────────────────────────────────

describe( 'ErrorBoundary — reset()', () => {
	it( 'remounts the child after clicking Try again', () => {
		/**
		 * Use a stateful wrapper so we can change shouldThrow after the boundary resets.
		 * When reset() is called, the boundary re-renders children with the new value.
		 */
		let setThrowExternal: ( v: boolean ) => void;

		function Wrapper() {
			const [ shouldThrow, setShouldThrow ] = React.useState( true );
			setThrowExternal = setShouldThrow;
			return (
				<ErrorBoundary>
					<Bomb shouldThrow={ shouldThrow } />
				</ErrorBoundary>
			);
		}

		render( <Wrapper /> );
		expect( screen.getByText( 'Something went wrong' ) ).toBeInTheDocument();

		// Fix the child first, then reset the boundary.
		act( () => {
			setThrowExternal( false );
			screen.getByRole( 'button', { name: 'Try again' } ).click();
		} );

		expect( screen.getByText( 'OK' ) ).toBeInTheDocument();
	} );
} );

// ─── postMessage forwarding ───────────────────────────────────────────────────

describe( 'ErrorBoundary — postMessage forwarding', () => {
	it( 'sends bazaar:error postMessage to window.parent on render error', () => {
		// In jsdom window.parent === window, so we need to mock a distinct parent
		// object that componentDidCatch will detect as "inside an iframe".
		const mockParent = { postMessage: jest.fn() } as unknown as Window & typeof globalThis;
		const originalParent = Object.getOwnPropertyDescriptor( window, 'parent' );
		Object.defineProperty( window, 'parent', { value: mockParent, configurable: true } );

		try {
			render(
				<ErrorBoundary>
					<Bomb shouldThrow />
				</ErrorBoundary>
			);

			const calls = mockParent.postMessage.mock.calls;
			const errorCall = calls.find(
				( [ msg ]: [ Record<string, unknown> ] ) => msg?.type === 'bazaar:error'
			);
			expect( errorCall ).toBeDefined();
			const msg = errorCall[ 0 ] as Record<string, unknown>;
			expect( msg.message ).toBe( 'Boom!' );
		} finally {
			if ( originalParent ) {
				Object.defineProperty( window, 'parent', originalParent );
			}
		}
	} );
} );
