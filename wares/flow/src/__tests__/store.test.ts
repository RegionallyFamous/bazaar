import { vi, describe, it, expect, beforeEach } from 'vitest';

const memStore = new Map<string, unknown>();

vi.mock( '@bazaar/client', () => ( {
	createWaredStore: () => ( {
		async load<T>( key: string ): Promise<T | undefined> {
			return memStore.get( key ) as T | undefined;
		},
		async save( key: string, value: unknown ): Promise<void> {
			memStore.set( key, value );
		},
	} ),
	bzr: { toast: vi.fn(), on: vi.fn( () => vi.fn() ), emit: vi.fn() },
	getBazaarContext: vi.fn( () => { throw new Error( 'no context' ); } ),
} ) );

import { loadSettings, saveSettings, loadHistory, saveHistory, loadTasks, saveTasks } from '../hooks/useStore.ts';
import { DEFAULT_SETTINGS } from '../types.ts';

beforeEach( () => memStore.clear() );

describe( 'loadSettings', () => {
	it( 'returns DEFAULT_SETTINGS when store is empty', async () => {
		const settings = await loadSettings();
		expect( settings ).toEqual( DEFAULT_SETTINGS );
	} );

	it( 'returns saved settings after saveSettings', async () => {
		const custom = { workMinutes: 30, shortBreakMinutes: 10, longBreakMinutes: 20, sessionsUntilLong: 3 };
		await saveSettings( custom );
		const loaded = await loadSettings();
		expect( loaded ).toEqual( custom );
	} );

	it( 'replaces previous value on subsequent saves', async () => {
		await saveSettings( { ...DEFAULT_SETTINGS, workMinutes: 30 } );
		await saveSettings( { ...DEFAULT_SETTINGS, workMinutes: 45 } );
		const loaded = await loadSettings();
		expect( loaded.workMinutes ).toBe( 45 );
	} );
} );

describe( 'loadHistory', () => {
	it( 'returns [] when store is empty', async () => {
		const history = await loadHistory();
		expect( history ).toEqual( [] );
	} );

	it( 'returns saved history after saveHistory', async () => {
		const record = [ { date: '2024-01-01', sessions: 3 } ];
		await saveHistory( record );
		const loaded = await loadHistory();
		expect( loaded ).toEqual( record );
	} );

	it( 'replaces previous value on subsequent saves', async () => {
		await saveHistory( [ { date: '2024-01-01', sessions: 1 } ] );
		await saveHistory( [ { date: '2024-01-02', sessions: 5 } ] );
		const loaded = await loadHistory();
		expect( loaded ).toHaveLength( 1 );
		expect( loaded[ 0 ]?.date ).toBe( '2024-01-02' );
	} );
} );

describe( 'loadTasks', () => {
	it( 'returns [] when store is empty', async () => {
		const tasks = await loadTasks();
		expect( tasks ).toEqual( [] );
	} );

	it( 'returns saved tasks after saveTasks', async () => {
		const tasks = [ { id: '1', text: 'test', done: false } ];
		await saveTasks( tasks );
		const loaded = await loadTasks();
		expect( loaded ).toEqual( tasks );
	} );

	it( 'replaces previous value on subsequent saves', async () => {
		await saveTasks( [ { id: '1', text: 'first', done: false } ] );
		await saveTasks( [ { id: '2', text: 'second', done: true } ] );
		const loaded = await loadTasks();
		expect( loaded ).toHaveLength( 1 );
		expect( loaded[ 0 ]?.id ).toBe( '2' );
	} );
} );
