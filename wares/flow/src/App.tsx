import { useEffect, useCallback } from 'react';
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
			if ( e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement ) return;
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
				<span className="flow-header__title">Flow</span>
				<div className="flow-header__stats">
					<span className="flow-stat">
						<strong>{ timer.sessionsToday }</strong> today
					</span>
					<span className="flow-stat">
						<strong>{ timer.totalSessions }</strong> total
					</span>
				</div>
				<button
					className="flow-header__settings-btn"
					onClick={ () => timer.setShowSettings( s => ! s ) }
					title="Settings"
				>
					⚙
				</button>
			</header>

			{ /* ── Settings panel ── */ }
			{ timer.showSettings && (
				<div className="settings-panel">
					{ (
						[
							[ 'workMinutes',       'Focus',       1, 120 ],
							[ 'shortBreakMinutes', 'Short Break', 1, 30  ],
							[ 'longBreakMinutes',  'Long Break',  1, 60  ],
							[ 'sessionsUntilLong', 'Sessions until long break', 1, 10 ],
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
									onChange={ e => handleSettingChange( key, parseInt( e.target.value ) || DEFAULT_SETTINGS[ key ] ) }
								/>
								{ key !== 'sessionsUntilLong' && <span className="settings-unit">min</span> }
							</div>
						</label>
					) ) }
				</div>
			) }

			<main className="flow-main">
				{ /* ── Left panel: timer ── */ }
				<section className="timer-section">
					{ /* Mode tabs */ }
					<div className="mode-tabs">
						{ MODES.map( m => (
							<button
								key={ m }
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
						>
							↺
						</button>
						<button
							className="ctrl-btn ctrl-btn--primary"
							onClick={ timer.toggle }
							title="Start / Pause (Space)"
						>
							{ timer.running ? '▐▐' : '▶' }
						</button>
						<button
							className="ctrl-btn"
							onClick={ timer.skip }
							title="Skip (S)"
						>
							⏭
						</button>
					</div>

					<p className="timer-hint">
						Space to start · S to skip · R to reset
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
