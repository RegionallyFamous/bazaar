import type { SequencerStep } from '../types.ts';
import { KEYBOARD_NOTES }     from '../types.ts';

interface Props {
  steps:       SequencerStep[];
  activeStep:  number | null;
  bpm:         number;
  playing:     boolean;
  onToggleStep:  ( idx: number ) => void;
  onChangeNote:  ( idx: number, note: string ) => void;
  onBpmChange:   ( bpm: number ) => void;
  onPlayStop:    () => void;
}

export default function Sequencer( {
  steps, activeStep, bpm, playing,
  onToggleStep, onChangeNote, onBpmChange, onPlayStop,
}: Props ) {
  return (
    <div className="sequencer">
      <div className="sequencer__header">
        <span className="sequencer__title">SEQUENCER</span>
        <div className="sequencer__transport">
          <button
            className={ `sequencer__play${ playing ? ' sequencer__play--active' : '' }` }
            onClick={ onPlayStop }
            aria-label={ playing ? 'Stop sequencer' : 'Play sequencer' }
          >
            { playing ? '⏹' : '▶' }
          </button>
          <label className="sequencer__bpm-label">
            BPM
            <input
              type="number"
              className="sequencer__bpm"
              value={ bpm }
              min="20"
              max="300"
              onChange={ e => {
                const raw = Number( e.target.value );
                if ( isNaN( raw ) ) return;
                onBpmChange( Math.max( 20, Math.min( 300, raw ) ) );
              } }
            />
          </label>
        </div>
      </div>

      <div className="sequencer__grid">
        { steps.map( ( step, idx ) => (
          <div
            key={ idx }
            className={ `sequencer__step${ step.active ? ' sequencer__step--on' : '' }${ activeStep === idx ? ' sequencer__step--current' : '' }` }
          >
            <button
              className="sequencer__step-btn"
              onClick={ () => onToggleStep( idx ) }
              aria-label={ `Step ${ idx + 1 } ${ step.active ? 'on' : 'off' }` }
            />
            { step.active && (
              <select
                className="sequencer__note-select"
                value={ step.note }
                onChange={ e => onChangeNote( idx, e.target.value ) }
              >
                { KEYBOARD_NOTES.map( n => (
                  <option key={ n } value={ n }>{ n }</option>
                ) ) }
              </select>
            ) }
          </div>
        ) ) }
      </div>
    </div>
  );
}
