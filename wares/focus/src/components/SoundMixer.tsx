import { useAudio }      from '../hooks/useAudio.ts';
import type { SoundType } from '../hooks/useAudio.ts';

const SOUNDS: { type: SoundType; label: string; emoji: string }[] = [
	{ type: 'rain',  label: 'Rain',       emoji: '🌧' },
	{ type: 'brown', label: 'Brown Noise', emoji: '〰' },
	{ type: 'white', label: 'White Noise', emoji: '📻' },
];

export default function SoundMixer() {
	const { state, toggleSound, setVolume } = useAudio();

	return (
		<div className="mixer">
			<div className="mixer__title">Ambient Sounds</div>
			{ SOUNDS.map( s => {
				const sound = state[ s.type ];
				return (
					<div key={ s.type } className={ `mixer__row${ sound.active ? ' mixer__row--active' : '' }` }>
						<button
							className="mixer__toggle"
							onClick={ () => toggleSound( s.type ) }
							title={ sound.active ? `Stop ${ s.label }` : `Play ${ s.label }` }
						>
							<span className="mixer__emoji">{ s.emoji }</span>
							<span className="mixer__label">{ s.label }</span>
							<span className={ `mixer__dot${ sound.active ? ' mixer__dot--on' : '' }` } />
						</button>
						{ sound.active && (
							<input
								className="mixer__volume"
								type="range"
								min="0"
								max="1"
								step="0.05"
								value={ sound.volume }
								onChange={ e => setVolume( s.type, parseFloat( e.target.value ) ) }
								aria-label={ `${ s.label } volume` }
							/>
						) }
					</div>
				);
			} ) }
		</div>
	);
}
