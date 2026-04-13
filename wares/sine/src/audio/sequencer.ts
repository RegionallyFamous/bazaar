import { engine }                from './engine.ts';
import type { SynthParams, SequencerStep } from '../types.ts';

type StepCallback = ( idx: number ) => void;

export class Sequencer {
  private steps:      SequencerStep[];
  private params:     SynthParams;
  private bpm:        number;
  private playing:    boolean = false;
  private stepIdx:    number  = 0;
  private timerId:    ReturnType<typeof setTimeout> | null = null;
  private onStep:     StepCallback;

  constructor( steps: SequencerStep[], params: SynthParams, bpm: number, onStep: StepCallback ) {
    this.steps  = steps;
    this.params = params;
    this.bpm    = bpm;
    this.onStep = onStep;
  }

  update( steps: SequencerStep[], params: SynthParams, bpm: number ) {
    this.steps  = steps;
    this.params = params;
    this.bpm    = bpm;
  }

  start() {
    if ( this.playing ) return;
    this.playing = true;
    engine.resume();
    this.tick();
  }

  stop() {
    this.playing = false;
    if ( this.timerId !== null ) {
      clearTimeout( this.timerId );
      this.timerId = null;
    }
    this.stepIdx = 0;
  }

  private tick() {
    if ( ! this.playing ) return;

    const safeBpm    = Math.max( 40, this.bpm );
    const step = this.steps[ this.stepIdx ];
    if ( step?.active ) {
      const stepDurSec = 60 / safeBpm / 2; // 8th-note steps
      engine.triggerNote( step.note, this.params, stepDurSec * 0.8 );
    }
    this.onStep( this.stepIdx );
    this.stepIdx = ( this.stepIdx + 1 ) % this.steps.length;

    const intervalMs = ( 60 / safeBpm / 2 ) * 1000;
    this.timerId = setTimeout( () => this.tick(), intervalMs );
  }
}
