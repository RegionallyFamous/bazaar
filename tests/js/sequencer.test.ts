/**
 * Unit tests for the Sequencer BPM guard (wares/sine/src/audio/sequencer.ts).
 *
 * The guard Math.max(40, bpm) ensures that even a BPM of 0 produces a
 * positive interval — preventing setTimeout(fn, <=0) tight-loop crashes.
 */

// Mock the audio engine so tests don't touch Web Audio API.
jest.mock( '../../wares/sine/src/audio/engine.ts', () => ( {
	engine: {
		resume: jest.fn(),
		triggerNote: jest.fn(),
	},
} ) );

import { Sequencer } from '../../wares/sine/src/audio/sequencer';

// Minimal type stubs matching the ware's own types.
type Step = { active: boolean; note: string };
type Params = Record<string, unknown>;

function makeSteps( n = 4 ): Step[] {
	return Array.from( { length: n }, ( _, i ) => ( { active: i === 0, note: 'C4' } ) );
}

describe( 'Sequencer BPM guard', () => {
	beforeEach( () => {
		jest.useFakeTimers();
	} );

	afterEach( () => {
		jest.useRealTimers();
	} );

	it( 'does not schedule a zero or negative interval when bpm=0', () => {
		const onStep = jest.fn();
		const seq = new Sequencer( makeSteps(), {} as Params, 0, onStep );

		const delays: number[] = [];
		const spy = jest.spyOn( global, 'setTimeout' ).mockImplementation( ( fn, delay ) => {
			delays.push( delay as number );
			return 0 as unknown as ReturnType<typeof setTimeout>;
		} );

		seq.start();

		// Every scheduled delay must be strictly positive (BPM clamped to 40).
		expect( delays.length ).toBeGreaterThan( 0 );
		delays.forEach( ( d ) => {
			expect( d ).toBeGreaterThan( 0 );
		} );

		seq.stop();
		spy.mockRestore();
	} );

	it( 'clamps bpm=0 to safeBpm=40 and produces the correct interval', () => {
		const onStep = jest.fn();
		const seq = new Sequencer( makeSteps(), {} as Params, 0, onStep );

		const delays: number[] = [];
		const spy = jest.spyOn( global, 'setTimeout' ).mockImplementation( ( fn, delay ) => {
			delays.push( delay as number );
			return 0 as unknown as ReturnType<typeof setTimeout>;
		} );

		seq.start();

		// Expected: (60 / 40 / 2) * 1000 = 750 ms
		const expectedMs = ( 60 / 40 / 2 ) * 1000;
		expect( delays[ 0 ] ).toBe( expectedMs );

		seq.stop();
		spy.mockRestore();
	} );

	it( 'produces the correct interval for bpm=120', () => {
		const onStep = jest.fn();
		const seq = new Sequencer( makeSteps(), {} as Params, 120, onStep );

		const delays: number[] = [];
		const spy = jest.spyOn( global, 'setTimeout' ).mockImplementation( ( fn, delay ) => {
			delays.push( delay as number );
			return 0 as unknown as ReturnType<typeof setTimeout>;
		} );

		seq.start();

		// Expected: (60 / 120 / 2) * 1000 = 250 ms
		const expectedMs = ( 60 / 120 / 2 ) * 1000;
		expect( delays[ 0 ] ).toBe( expectedMs );

		seq.stop();
		spy.mockRestore();
	} );

	it( 'produces the correct interval for bpm=40 (boundary value)', () => {
		const onStep = jest.fn();
		const seq = new Sequencer( makeSteps(), {} as Params, 40, onStep );

		const delays: number[] = [];
		const spy = jest.spyOn( global, 'setTimeout' ).mockImplementation( ( fn, delay ) => {
			delays.push( delay as number );
			return 0 as unknown as ReturnType<typeof setTimeout>;
		} );

		seq.start();

		// At exactly bpm=40, safeBpm=40, interval should be 750ms.
		const expectedMs = ( 60 / 40 / 2 ) * 1000;
		expect( delays[ 0 ] ).toBe( expectedMs );

		seq.stop();
		spy.mockRestore();
	} );
} );
