import { useState, useEffect, useCallback, useRef } from 'react';
import type { Mode, Settings, DayRecord }            from '../types.ts';
import { DEFAULT_SETTINGS }                          from '../types.ts';
import { loadSettings, saveSettings, loadHistory, saveHistory } from './useStore.ts';

function todayKey(): string {
	return new Date().toISOString().split( 'T' )[ 0 ]!;
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

	// Load persisted data on mount
	useEffect( () => {
		Promise.all( [ loadSettings(), loadHistory() ] ).then( ( [ s, h ] ) => {
			setSettings( s );
			setSecondsLeft( minutesToSeconds( s.workMinutes ) );
			setHistory( h );
			const today = h.find( d => d.date === todayKey() );
			setSessionsToday( today?.sessions ?? 0 );
			setTotalSessions( h.reduce( ( sum, d ) => sum + d.sessions, 0 ) );
		} ).catch( () => {} );
	}, [] );

	const recordSession = useCallback( async ( currentHistory: DayRecord[] ) => {
		const today   = todayKey();
		const updated = [ ...currentHistory ];
		const dayIdx  = updated.findIndex( d => d.date === today );
		if ( dayIdx >= 0 ) {
			updated[ dayIdx ] = { ...updated[ dayIdx ], sessions: updated[ dayIdx ].sessions + 1 };
		} else {
			updated.push( { date: today, sessions: 1 } );
		}
		setHistory( updated );
		const todayRecord = updated.find( d => d.date === today );
		setSessionsToday( todayRecord?.sessions ?? 1 );
		setTotalSessions( updated.reduce( ( s, d ) => s + d.sessions, 0 ) );
		await saveHistory( updated );
		return updated;
	}, [] );

	const completeSession = useCallback( async () => {
		sessionCountRef.current += 1;
		const updatedHistory = await recordSession( history );

		// Notify
		if ( 'Notification' in window && Notification.permission === 'granted' ) {
			new Notification( 'Focus session complete! 🎉', {
				body: 'Time for a break.',
				icon: './icon.svg',
			} );
		}

		// Advance to break
		const nextMode: Mode = sessionCountRef.current % settings.sessionsUntilLong === 0
			? 'long-break'
			: 'short-break';
		setMode( nextMode );
		setSecondsLeft( modeDuration( nextMode, settings ) );
		setRunning( false );
		return updatedHistory;
	}, [ history, settings, recordSession ] );

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
					completeSession().catch( () => {} );
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
			completeSession().catch( () => {} );
		} else {
			setMode( 'work' );
			setSecondsLeft( modeDuration( 'work', settings ) );
		}
	}, [ mode, settings, completeSession ] );

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
