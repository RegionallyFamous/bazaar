import { __, sprintf } from '@wordpress/i18n';
import { useAudio }    from '../hooks/useAudio.ts';
import type { SoundType } from '../hooks/useAudio.ts';

type SoundDef = { type: SoundType; label: string; emoji: string };

function getSounds(): SoundDef[] {
	return [
		{ type: 'rain',  label: __( 'Rain', 'bazaar' ),        emoji: '🌧' },
		{ type: 'brown', label: __( 'Brown Noise', 'bazaar' ),  emoji: '〰' },
		{ type: 'white', label: __( 'White Noise', 'bazaar' ),  emoji: '📻' },
	];
}

export default function SoundMixer() {
	const { state, toggleSound, setVolume } = useAudio();
	const SOUNDS = getSounds();

	return (
		<div className="mixer">
			<div className="mixer__title">{ __( 'Ambient Sounds', 'bazaar' ) }</div>
			{ SOUNDS.map( s => {
				const sound = state[ s.type ];
				return (
					<div key={ s.type } className={ `mixer__row${ sound.active ? ' mixer__row--active' : '' }` }>
						<button
							className="mixer__toggle"
							onClick={ () => toggleSound( s.type ) }
							title={ sound.active
								? sprintf( /* translators: %s: sound name */ __( 'Stop %s', 'bazaar' ), s.label )
								: sprintf( /* translators: %s: sound name */ __( 'Play %s', 'bazaar' ), s.label ) }
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
								aria-label={ sprintf(
									/* translators: %s: sound name */
									__( '%s volume', 'bazaar' ),
									s.label
								) }
							/>
						) }
					</div>
				);
			} ) }
		</div>
	);
}
