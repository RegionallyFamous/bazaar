import { useState, useCallback, useRef, useEffect } from 'react';
import type { SynthParams, SequencerStep } from './types.ts';
import { DEFAULT_PARAMS, DEFAULT_STEPS }   from './types.ts';
import type { Note }                       from './types.ts';
import { engine }                          from './audio/engine.ts';
import { Sequencer as SeqEngine }          from './audio/sequencer.ts';
import Keyboard                            from './components/Keyboard.tsx';
import SequencerGrid                       from './components/Sequencer.tsx';
import Knob                                from './components/Knob.tsx';
import './App.css';

const WAVEFORMS = [ 'sine', 'square', 'sawtooth', 'triangle' ] as const;

export default function App() {
  const [ params, setParams ]         = useState<SynthParams>( DEFAULT_PARAMS );
  const [ steps, setSteps ]           = useState<SequencerStep[]>( DEFAULT_STEPS );
  const [ bpm, setBpm ]               = useState( 120 );
  const [ playing, setPlaying ]       = useState( false );
  const [ activeStep, setActiveStep ] = useState<number | null>( null );
  const [ activeNotes, setActiveNotes ] = useState<Set<string>>( new Set() );

  const seqRef = useRef<SeqEngine | null>( null );

  // Keep sequencer up to date with latest state
  useEffect( () => {
    seqRef.current?.update( steps, params, bpm );
  }, [ steps, params, bpm ] );

  // Keep audio engine in sync with param changes
  useEffect( () => {
    engine.applyParams( params );
  }, [ params ] );

  // ── Keyboard ──────────────────────────────────────────────────────────────
  const onNoteOn = useCallback( ( note: Note ) => {
    engine.noteOn( note, params );
    setActiveNotes( prev => new Set( [ ...prev, note ] ) );
  }, [ params ] );

  const onNoteOff = useCallback( ( note: Note ) => {
    engine.noteOff( note, params );
    setActiveNotes( prev => { const n = new Set( prev ); n.delete( note ); return n; } );
  }, [ params ] );

  // ── Params helpers ────────────────────────────────────────────────────────
  function setParam<K extends keyof SynthParams>( key: K, val: SynthParams[ K ] ) {
    setParams( p => ( { ...p, [ key ]: val } ) );
  }

  function setAdsr( key: keyof SynthParams['adsr'], val: number ) {
    setParams( p => ( { ...p, adsr: { ...p.adsr, [ key ]: val } } ) );
  }

  function setFilter( key: keyof SynthParams['filter'], val: number ) {
    setParams( p => ( { ...p, filter: { ...p.filter, [ key ]: val } } ) );
  }

  // ── Sequencer ─────────────────────────────────────────────────────────────
  function togglePlayStop() {
    if ( playing ) {
      seqRef.current?.stop();
      setActiveStep( null );
      setPlaying( false );
    } else {
      if ( ! seqRef.current ) {
        seqRef.current = new SeqEngine( steps, params, bpm, setActiveStep );
      } else {
        seqRef.current.update( steps, params, bpm );
      }
      seqRef.current.start();
      setPlaying( true );
    }
  }

  function toggleStep( idx: number ) {
    setSteps( prev => prev.map( ( s, i ) => i === idx ? { ...s, active: ! s.active } : s ) );
  }

  function changeNote( idx: number, note: string ) {
    setSteps( prev => prev.map( ( s, i ) => i === idx ? { ...s, note } : s ) );
  }

  return (
    <div className="synth">
      { /* ── Title bar ──────────────────────────────────────────────────── */ }
      <header className="synth__header">
        <span className="synth__logo">⬡ SINE</span>
        <span className="synth__subtitle">WEB AUDIO API · ZERO DEPS</span>
      </header>

      { /* ── Top panel: oscillator + ADSR + Filter ───────────────────────── */ }
      <div className="synth__top">

        { /* Oscillator */ }
        <section className="synth__module synth__module--osc">
          <h2 className="synth__module-title">OSCILLATOR</h2>
          <div className="synth__wave-btns">
            { WAVEFORMS.map( w => (
              <button
                key={ w }
                className={ `synth__wave-btn${ params.waveform === w ? ' synth__wave-btn--active' : '' }` }
                onClick={ () => setParam( 'waveform', w ) }
                title={ w }
              >
                { w === 'sine'     && '∿' }
                { w === 'square'   && '⊓' }
                { w === 'sawtooth' && '⋀' }
                { w === 'triangle' && '△' }
                <span className="synth__wave-label">{ w }</span>
              </button>
            ) ) }
          </div>
          <div className="synth__knob-row">
            <Knob label="VOLUME" value={ params.volume } min={ 0 } max={ 1 } step={ 0.01 }
              format={ v => `${ Math.round( v * 100 ) }%` }
              onChange={ v => setParam( 'volume', v ) } />
            <Knob label="DETUNE" value={ params.detune } min={ -50 } max={ 50 } step={ 1 }
              unit=" ct" onChange={ v => setParam( 'detune', Math.round( v ) ) } />
          </div>
        </section>

        { /* ADSR */ }
        <section className="synth__module synth__module--adsr">
          <h2 className="synth__module-title">ENVELOPE</h2>
          <div className="synth__knob-row">
            <Knob label="ATK" value={ params.adsr.attack }  min={ 0.001 } max={ 2 }
              format={ v => `${ v.toFixed( 2 ) }s` } onChange={ v => setAdsr( 'attack',  v ) } />
            <Knob label="DEC" value={ params.adsr.decay }   min={ 0.001 } max={ 2 }
              format={ v => `${ v.toFixed( 2 ) }s` } onChange={ v => setAdsr( 'decay',   v ) } />
            <Knob label="SUS" value={ params.adsr.sustain } min={ 0 } max={ 1 }
              format={ v => `${ Math.round( v * 100 ) }%` } onChange={ v => setAdsr( 'sustain', v ) } />
            <Knob label="REL" value={ params.adsr.release } min={ 0.001 } max={ 3 }
              format={ v => `${ v.toFixed( 2 ) }s` } onChange={ v => setAdsr( 'release', v ) } />
          </div>
        </section>

        { /* Filter */ }
        <section className="synth__module synth__module--filter">
          <h2 className="synth__module-title">FILTER</h2>
          <div className="synth__knob-row">
            <Knob label="CUTOFF" value={ params.filter.cutoff } min={ 80 } max={ 18000 } step={ 10 }
              format={ v => v >= 1000 ? `${ ( v / 1000 ).toFixed( 1 ) }kHz` : `${ Math.round( v ) }Hz` }
              onChange={ v => setFilter( 'cutoff', v ) } />
            <Knob label="RESO" value={ params.filter.resonance } min={ 0.1 } max={ 20 } step={ 0.1 }
              format={ v => `Q${ v.toFixed( 1 ) }` }
              onChange={ v => setFilter( 'resonance', v ) } />
          </div>
        </section>
      </div>

      { /* ── Keyboard ────────────────────────────────────────────────────── */ }
      <Keyboard
        activeNotes={ activeNotes }
        onNoteOn={ onNoteOn }
        onNoteOff={ onNoteOff }
      />

      { /* ── Sequencer ───────────────────────────────────────────────────── */ }
      <SequencerGrid
        steps={ steps }
        activeStep={ activeStep }
        bpm={ bpm }
        playing={ playing }
        onToggleStep={ toggleStep }
        onChangeNote={ changeNote }
        onBpmChange={ setBpm }
        onPlayStop={ togglePlayStop }
      />
    </div>
  );
}
