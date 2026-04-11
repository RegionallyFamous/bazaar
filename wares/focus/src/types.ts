export type Mode = 'work' | 'short-break' | 'long-break';

export interface Task {
	id:   string;
	text: string;
	done: boolean;
}

export interface Settings {
	workMinutes:       number;
	shortBreakMinutes: number;
	longBreakMinutes:  number;
	sessionsUntilLong: number;
}

export interface DayRecord {
	date:     string;   // YYYY-MM-DD
	sessions: number;
}

export const DEFAULT_SETTINGS: Settings = {
	workMinutes:       25,
	shortBreakMinutes: 5,
	longBreakMinutes:  15,
	sessionsUntilLong: 4,
};

export const MODE_LABEL: Record<Mode, string> = {
	'work':        'Focus',
	'short-break': 'Short Break',
	'long-break':  'Long Break',
};

export const MODE_COLOR: Record<Mode, string> = {
	'work':        '#f59e0b',
	'short-break': '#10b981',
	'long-break':  '#06b6d4',
};
