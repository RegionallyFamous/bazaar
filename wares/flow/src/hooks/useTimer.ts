import { useState, useEffect, useCallback, useRef } from 'react';
import type { Mode, Settings, DayRecord }            from '../types.ts';
import { DEFAULT_SETTINGS }                          from '../types.ts';
import { loadSettings, saveSettings, loadHistory, saveHistory } from './useStore.ts';
import { bzr } from '@bazaar/client';

function todayKey(): string {
	const d = new Date();
	return `${ d.getFullYear() }-${ String( d.getMonth() + 1 ).padStart( 2, '0' ) }-${ String( d.getDate() ).padStart( 2, '0' ) }`;
}

function minutesToSeconds( m: number ): number {
	return m * 60;
}

function modeDuration( mode: Mode, settings: Settings ): number {
	switch ( mode ) {
		case 'work':        return minutesToSeconds( settings.workMinutes );
		case 'short-break': return minutesToSeconds( settings.shortBreakMinutes );
		case 'long-break':  return minutesToSeconds( settings.longBreakMinutes );
	}
}

// Guards against % 0 when sessionsUntilLong is invalid.
function nextBreakMode( sessionCount: number, settings: Settings ): Mode {
	if ( ! settings.sessionsUntilLong || settings.sessionsUntilLong < 1 ) return 'short-break';
	return sessionCount % settings.sessionsUntilLong === 0 ? 'long-break' : 'short-break';
}

export function useTimer() {
	const [ settings, setSettings ]           = useState<Settings>( DEFAULT_SETTINGS );
	const [ mode, setMode ]                   = useState<Mode>( 'work' );
	const [ secondsLeft, setSecondsLeft ]     = useState( minutesToSeconds( DEFAULT_SETTINGS.workMinutes ) );
	const [ running, setRunning ]             = useState( false );
	const [ sessionsToday, setSessionsToday ] = useState( 0 );
	const [ totalSessions, setTotalSessions ] = useState( 0 );
	const [ history, setHistory ]             = useState<DayRecord[]>( [] );
	const [ showSettings, setShowSettings ]   = useState( false );

	const sessionCountRef = useRef( 0 );  // sessions completed this cycle (for long-break logic)
	const intervalRef     = useRef<ReturnType<typeof setInterval> | null>( null );
	const modeRef         = useRef<Mode>( 'work' );   // always holds the current mode
	const historyRef      = useRef<DayRecord[]>( [] ); // always holds the latest history

	// Keep refs in sync so async callbacks always read the latest values.
	useEffect( () => { modeRef.current = mode; }, [ mode ] );
	useEffect( () => { historyRef.current = history; }, [ history ] );

	// Load persisted data on mount
	useEffect( () => {
		Promise.all( [ loadSettings(), loadHistory() ] ).then( ( [ s, h ] ) => {
			setSettings( s );
			setSecondsLeft( minutesToSeconds( s.workMinutes ) );
			setHistory( h );
			historyRef.current = h;
			const today = h.find( d => d.date === todayKey() );
			setSessionsToday( today?.sessions ?? 0 );
			setTotalSessions( h.reduce( ( sum, d ) => sum + d.sessions, 0 ) );
		} ).catch( () => {
			bzr.toast( 'Could not load saved data — using defaults', 'warning' );
		} );
	}, [] );

	// Persist first, then update UI so state always reflects what was saved.
	const recordSession = useCallback( async ( currentHistory: DayRecord[] ) => {
		const today   = todayKey();
		const updated = [ ...currentHistory ];
		const dayIdx  = updated.findIndex( d => d.date === today );
		if ( dayIdx >= 0 ) {
			updated[ dayIdx ] = { ...updated[ dayIdx ], sessions: updated[ dayIdx ].sessions + 1 };
		} else {
			updated.push( { date: today, sessions: 1 } );
		}
		try {
			await saveHistory( updated );
			setHistory( updated );
			const todayRecord = updated.find( d => d.date === today );
			setSessionsToday( todayRecord?.sessions ?? 1 );
			setTotalSessions( updated.reduce( ( s, d ) => s + d.sessions, 0 ) );
		} catch ( err ) {
			console.error( 'Failed to save session history:', err );
		}
		return updated;
	}, [] );

	// Determine next break mode, record the session, then advance UI.
	// setMode/setSecondsLeft run unconditionally so the timer never stays at 00:00.
	const completeSession = useCallback( async () => {
		sessionCountRef.current += 1;
		const nextMode = nextBreakMode( sessionCountRef.current, settings );
		try {
			await recordSession( historyRef.current );
			if ( 'Notification' in window && Notification.permission === 'granted' ) {
				new Notification( 'Focus session complete! 🎉', {
					body: 'Time for a break.',
					icon: './icon.svg',
				} );
			}
		} catch ( err ) {
			console.error( 'completeSession error:', err );
		}
		setMode( nextMode );
		setSecondsLeft( modeDuration( nextMode, settings ) );
		setRunning( false );
	}, [ settings, recordSession ] );

	// Advance to next break without recording a session or incrementing the counter.
	const skipSession = useCallback( () => {
		const nextMode = nextBreakMode( sessionCountRef.current, settings );
		setMode( nextMode );
		setSecondsLeft( modeDuration( nextMode, settings ) );
		setRunning( false );
	}, [ settings ] );

	// Tick
	useEffect( () => {
		if ( ! running ) {
			if ( intervalRef.current ) {
				clearInterval( intervalRef.current );
				intervalRef.current = null;
			}
			return;
		}

		intervalRef.current = setInterval( () => {
			setSecondsLeft( prev => {
				if ( prev <= 1 ) {
					clearInterval( intervalRef.current! );
					intervalRef.current = null;
					setRunning( false );
					if ( modeRef.current === 'work' ) {
						// Record the completed work session and advance to break.
						completeSession().catch( () => {
							bzr.toast( 'Session could not be saved.', 'warning' );
						} );
					} else {
						// Break expired — return to work without recording a session.
						setMode( 'work' );
						setSecondsLeft( modeDuration( 'work', settings ) );
					}
					return 0;
				}
				return prev - 1;
			} );
		}, 1000 );

		return () => {
			if ( intervalRef.current ) clearInterval( intervalRef.current );
		};
	}, [ running, completeSession ] );

	const toggle = useCallback( () => {
		if ( secondsLeft === 0 ) return;
		if ( ! running && 'Notification' in window && Notification.permission === 'default' ) {
			Notification.requestPermission().catch( () => {} );
		}
		setRunning( r => ! r );
	}, [ secondsLeft, running ] );

	const reset = useCallback( () => {
		setRunning( false );
		setSecondsLeft( modeDuration( mode, settings ) );
	}, [ mode, settings ] );

	const skip = useCallback( () => {
		setRunning( false );
		if ( mode === 'work' ) {
			skipSession();
		} else {
			setMode( 'work' );
			setSecondsLeft( modeDuration( 'work', settings ) );
		}
	}, [ mode, settings, skipSession ] );

	const switchMode = useCallback( ( m: Mode ) => {
		setRunning( false );
		setMode( m );
		setSecondsLeft( modeDuration( m, settings ) );
	}, [ settings ] );

	const updateSettings = useCallback( async ( next: Settings ) => {
		setSettings( next );
		await saveSettings( next );
		setRunning( false );
		setSecondsLeft( modeDuration( mode, next ) );
	}, [ mode ] );

	const totalSeconds = modeDuration( mode, settings );
	const progress     = totalSeconds > 0 ? 1 - ( secondsLeft / totalSeconds ) : 0;

	return {
		mode, secondsLeft, running, progress,
		sessionsToday, totalSessions, history,
		settings, showSettings,
		toggle, reset, skip, switchMode, updateSettings,
		setShowSettings,
	};
}
