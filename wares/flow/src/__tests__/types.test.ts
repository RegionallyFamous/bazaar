import { describe, it, expect } from 'vitest';
import { DEFAULT_SETTINGS, MODE_LABEL } from '../types.ts';

describe( 'DEFAULT_SETTINGS', () => {
	it( 'has positive workMinutes', () => {
		expect( DEFAULT_SETTINGS.workMinutes ).toBeGreaterThan( 0 );
	} );

	it( 'has positive shortBreakMinutes', () => {
		expect( DEFAULT_SETTINGS.shortBreakMinutes ).toBeGreaterThan( 0 );
	} );

	it( 'has positive longBreakMinutes', () => {
		expect( DEFAULT_SETTINGS.longBreakMinutes ).toBeGreaterThan( 0 );
	} );

	it( 'has sessionsUntilLong > 0 to guard against % 0 bug', () => {
		expect( DEFAULT_SETTINGS.sessionsUntilLong ).toBeGreaterThan( 0 );
	} );
} );

describe( 'MODE_LABEL', () => {
	it( 'has an entry for work', () => {
		expect( MODE_LABEL[ 'work' ] ).toBeTruthy();
	} );

	it( 'has an entry for short-break', () => {
		expect( MODE_LABEL[ 'short-break' ] ).toBeTruthy();
	} );

	it( 'has an entry for long-break', () => {
		expect( MODE_LABEL[ 'long-break' ] ).toBeTruthy();
	} );

	it( 'covers all three modes', () => {
		const keys = Object.keys( MODE_LABEL );
		expect( keys ).toContain( 'work' );
		expect( keys ).toContain( 'short-break' );
		expect( keys ).toContain( 'long-break' );
	} );
} );
