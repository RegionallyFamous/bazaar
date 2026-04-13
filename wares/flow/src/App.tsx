import { useEffect, useCallback } from 'react';
import { __ }                     from '@wordpress/i18n';
import { useTimer }               from './hooks/useTimer.ts';
import Ring                       from './components/Ring.tsx';
import TaskList                   from './components/TaskList.tsx';
import SoundMixer                 from './components/SoundMixer.tsx';
import Heatmap                    from './components/Heatmap.tsx';
import type { Mode, Settings }    from './types.ts';
import { MODE_LABEL, MODE_COLOR, DEFAULT_SETTINGS } from './types.ts';
import './App.css';

const MODES: Mode[] = [ 'work', 'short-break', 'long-break' ];

export default function App() {
	const timer = useTimer();

	// Keyboard shortcuts
	useEffect( () => {
		function onKey( e: KeyboardEvent ) {
			const t = e.target;
			if (
				t instanceof HTMLInputElement ||
				t instanceof HTMLButtonElement ||
				t instanceof HTMLSelectElement ||
				t instanceof HTMLTextAreaElement ||
				( t instanceof HTMLElement && t.isContentEditable )
			) return;
			if ( e.key === ' ' )            { e.preventDefault(); timer.toggle(); }
			else if ( e.key === 's' || e.key === 'S' ) timer.skip();
			else if ( e.key === 'r' || e.key === 'R' ) timer.reset();
		}
		window.addEventListener( 'keydown', onKey );
		return () => window.removeEventListener( 'keydown', onKey );
	}, [ timer ] );

	const handleSettingChange = useCallback( async (
		key: keyof Settings,
		val: number,
	) => {
		await timer.updateSettings( { ...timer.settings, [ key ]: val } );
	}, [ timer ] );

	const color = MODE_COLOR[ timer.mode ];

	return (
		<div className="flow-app" style={ { '--mode-color': color } as React.CSSProperties }>
			{ /* ── Header ── */ }
			<header className="flow-header">
			<span className="flow-header__title">{ __( 'Flow', 'bazaar' ) }</span>
			<div className="flow-header__stats">
				<span className="flow-stat">
					<strong>{ timer.sessionsToday }</strong> { __( 'today', 'bazaar' ) }
				</span>
				<span className="flow-stat">
					<strong>{ timer.totalSessions }</strong> { __( 'total', 'bazaar' ) }
				</span>
			</div>
		<button
			className="flow-header__settings-btn"
			onClick={ () => timer.setShowSettings( s => ! s ) }
			title="Settings"
			aria-label="Settings"
			aria-expanded={ timer.showSettings }
			aria-controls="flow-settings-panel"
		>
			⚙
		</button>
			</header>

			{ /* ── Settings panel ── */ }
		{ timer.showSettings && (
		<div className="settings-panel" id="flow-settings-panel">
				{ (
					[
						[ 'workMinutes',       __( 'Focus', 'bazaar' ),                     1, 120 ],
						[ 'shortBreakMinutes', __( 'Short Break', 'bazaar' ),               1, 30  ],
						[ 'longBreakMinutes',  __( 'Long Break', 'bazaar' ),                1, 60  ],
						[ 'sessionsUntilLong', __( 'Sessions until long break', 'bazaar' ), 1, 10  ],
					] as [ keyof Settings, string, number, number ][]
				).map( ( [ key, label, min, max ] ) => (
						<label key={ key } className="settings-row">
							<span>{ label }</span>
							<div className="settings-row__control">
								<input
									className="settings-input"
									type="number"
									min={ min }
									max={ max }
									value={ timer.settings[ key ] }
									onChange={ e => {
									const parsed  = parseInt( e.target.value, 10 );
									const clamped = isNaN( parsed ) ? DEFAULT_SETTINGS[ key ] : Math.min( max, Math.max( min, parsed ) );
									handleSettingChange( key, clamped );
								} }
								/>
								{ key !== 'sessionsUntilLong' && <span className="settings-unit">{ __( 'min', 'bazaar' ) }</span> }
							</div>
						</label>
					) ) }
			</div>
			) }

			<main className="flow-main">
				{ /* ── Left panel: timer ── */ }
				<section className="timer-section">
					{ /* Mode tabs */ }
				<div className="mode-tabs" role="tablist">
					{ MODES.map( m => (
						<button
							key={ m }
							role="tab"
							aria-selected={ timer.mode === m }
							className={ `mode-tab${ timer.mode === m ? ' mode-tab--active' : '' }` }
							style={ timer.mode === m ? { color } : undefined }
							onClick={ () => timer.switchMode( m ) }
						>
							{ MODE_LABEL[ m ] }
						</button>
					) ) }
				</div>

					<Ring
						progress={ timer.progress }
						mode={ timer.mode }
						secondsLeft={ timer.secondsLeft }
						running={ timer.running }
						onToggle={ timer.toggle }
					/>

					<div className="timer-controls">
					<button
						className="ctrl-btn"
						onClick={ timer.reset }
						title="Reset (R)"
						aria-label="Reset timer"
					>
						↺
					</button>
					<button
						className="ctrl-btn ctrl-btn--primary"
						onClick={ timer.toggle }
						title="Start / Pause (Space)"
						aria-label={ timer.running ? 'Pause timer' : 'Start timer' }
					>
						{ timer.running ? '▐▐' : '▶' }
					</button>
					<button
						className="ctrl-btn"
						onClick={ timer.skip }
						title="Skip (S)"
						aria-label="Skip to next session"
					>
						⏭
					</button>
				</div>

				<p className="timer-hint">
					{ __( 'Space to start · S to skip · R to reset', 'bazaar' ) }
				</p>
				</section>

				{ /* ── Right panel ── */ }
				<aside className="side-panel">
					<TaskList />
					<SoundMixer />
				</aside>
			</main>

			<footer className="flow-footer">
				<Heatmap history={ timer.history } />
			</footer>
		</div>
	);
}
