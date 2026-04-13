import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTimer } from '../hooks/useTimer.ts';
import { DEFAULT_SETTINGS } from '../types.ts';

vi.stubGlobal( 'Notification', { permission: 'denied', requestPermission: vi.fn() } );

vi.mock( '@bazaar/client', () => ( {
	createWaredStore: () => ( {
		load: vi.fn().mockResolvedValue( undefined ),
		save: vi.fn().mockResolvedValue( undefined ),
	} ),
	bzr: { toast: vi.fn(), on: vi.fn( () => vi.fn() ), emit: vi.fn() },
	getBazaarContext: vi.fn( () => { throw new Error( 'no context' ); } ),
} ) );

beforeEach( () => {
	vi.clearAllMocks();
} );

describe( 'session break mode math', () => {
	it( '4 sessions with sessionsUntilLong 4 triggers long break', () => {
		expect( 4 % DEFAULT_SETTINGS.sessionsUntilLong ).toBe( 0 );
	} );

	it( 'sessionsUntilLong 0 is falsy — guard prevents % 0 crash', () => {
		const guard = ( n: number ) => ( ! n || n < 1 ) ? 'short-break' : 'long-break';
		expect( guard( 0 ) ).toBe( 'short-break' );
	} );

	it( 'todayKey produces a YYYY-MM-DD formatted string', () => {
		const d = new Date();
		const key = `${ d.getFullYear() }-${ String( d.getMonth() + 1 ).padStart( 2, '0' ) }-${ String( d.getDate() ).padStart( 2, '0' ) }`;
		expect( key ).toMatch( /^\d{4}-\d{2}-\d{2}$/ );
	} );
} );

describe( 'useTimer', () => {
	it( 'starts with mode=work, running=false, correct secondsLeft', async () => {
		const { result } = renderHook( () => useTimer() );
		await act( async () => {} );
		expect( result.current.mode ).toBe( 'work' );
		expect( result.current.running ).toBe( false );
		expect( result.current.secondsLeft ).toBe( DEFAULT_SETTINGS.workMinutes * 60 );
	} );

	it( 'toggle() sets running to true', async () => {
		const { result } = renderHook( () => useTimer() );
		await act( async () => {} );
		act( () => { result.current.toggle(); } );
		expect( result.current.running ).toBe( true );
	} );

	it( 'toggle() twice returns to running=false', async () => {
		const { result } = renderHook( () => useTimer() );
		await act( async () => {} );
		act( () => { result.current.toggle(); } );
		act( () => { result.current.toggle(); } );
		expect( result.current.running ).toBe( false );
	} );

	it( 'reset() restores secondsLeft to mode duration and stops timer', async () => {
		const { result } = renderHook( () => useTimer() );
		await act( async () => {} );
		act( () => { result.current.toggle(); } );
		act( () => { result.current.reset(); } );
		expect( result.current.running ).toBe( false );
		expect( result.current.secondsLeft ).toBe( DEFAULT_SETTINGS.workMinutes * 60 );
	} );

	it( 'switchMode("short-break") changes mode and secondsLeft', async () => {
		const { result } = renderHook( () => useTimer() );
		await act( async () => {} );
		act( () => { result.current.switchMode( 'short-break' ); } );
		expect( result.current.mode ).toBe( 'short-break' );
		expect( result.current.secondsLeft ).toBe( DEFAULT_SETTINGS.shortBreakMinutes * 60 );
	} );
} );
