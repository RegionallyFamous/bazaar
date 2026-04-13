import { createWaredStore }               from '@bazaar/client';
import type { Settings, DayRecord, Task } from '../types.ts';
import { DEFAULT_SETTINGS }               from '../types.ts';

const store = createWaredStore( { slug: 'flow', lsPrefix: 'bzr-flow-', lsPrefixOld: 'bzr-focus-' } );

export async function loadSettings(): Promise<Settings> {
	return ( await store.load<Settings>( 'settings' ) ) ?? DEFAULT_SETTINGS;
}
export function saveSettings( s: Settings ): Promise<void> {
	return store.save( 'settings', s );
}

export async function loadHistory(): Promise<DayRecord[]> {
	return ( await store.load<DayRecord[]>( 'history' ) ) ?? [];
}
export function saveHistory( h: DayRecord[] ): Promise<void> {
	return store.save( 'history', h );
}

export async function loadTasks(): Promise<Task[]> {
	return ( await store.load<Task[]>( 'tasks' ) ) ?? [];
}
export function saveTasks( t: Task[] ): Promise<void> {
	return store.save( 'tasks', t );
}
