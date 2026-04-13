import type { SynthParams } from '../types.ts';
import { noteToFreq }       from '../types.ts';

interface Voice {
  osc:     OscillatorNode;
  gain:    GainNode;
  started: boolean;
}

interface TriggerVoice {
  osc:  OscillatorNode;
  gain: GainNode;
}

export class SynthEngine {
  private ctx:            AudioContext | null = null;
  private filter:         BiquadFilterNode | null = null;
  private master:         GainNode | null = null;
  private voices:         Map<string, Voice> = new Map();
  private triggerVoices:  Map<string, TriggerVoice> = new Map();

  private getCtx(): AudioContext {
    if ( ! this.ctx ) {
      this.ctx    = new AudioContext();
      this.master = this.ctx.createGain();
      this.filter = this.ctx.createBiquadFilter();
      this.filter.type = 'lowpass';
      this.filter.connect( this.master );
      this.master.connect( this.ctx.destination );
    }
    return this.ctx;
  }

  applyParams( params: SynthParams ) {
    if ( ! this.ctx || ! this.master || ! this.filter ) return;
    this.master.gain.setTargetAtTime( params.volume, this.ctx.currentTime, 0.02 );
    this.filter.frequency.setTargetAtTime( params.filter.cutoff,    this.ctx.currentTime, 0.02 );
    this.filter.Q.setTargetAtTime(         params.filter.resonance, this.ctx.currentTime, 0.02 );
  }

  noteOn( note: string, params: SynthParams ) {
    const ctx = this.getCtx();
    if ( ctx.state === 'suspended' ) { void ctx.resume(); }

    // Release existing voice for the same note
    this.noteOff( note, params );

    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type            = params.waveform;
    osc.frequency.value = noteToFreq( note );
    osc.detune.value    = params.detune;

    const { attack, decay, sustain } = params.adsr;
    const now = ctx.currentTime;
    gain.gain.setValueAtTime( 0, now );
    gain.gain.linearRampToValueAtTime( 1, now + attack );
    gain.gain.linearRampToValueAtTime( sustain, now + attack + decay );

    osc.connect( gain );
    gain.connect( this.filter! );
    osc.start( now );

    this.voices.set( note, { osc, gain, started: true } );
  }

  noteOff( note: string, params: SynthParams ) {
    const v = this.voices.get( note );
    if ( ! v || ! this.ctx ) return;
    const { release } = params.adsr;
    const now = this.ctx.currentTime;
    v.gain.gain.cancelScheduledValues( now );
    v.gain.gain.setValueAtTime( v.gain.gain.value, now );
    v.gain.gain.linearRampToValueAtTime( 0, now + release );
    v.osc.stop( now + release + 0.05 );
    this.voices.delete( note );
  }

  triggerNote( note: string, params: SynthParams, durationSec = 0.12 ) {
    const ctx = this.getCtx();
    if ( ctx.state === 'suspended' ) { void ctx.resume(); }

    // Stop and disconnect any previous triggered voice for this pitch
    const existing = this.triggerVoices.get( note );
    if ( existing ) {
      try { existing.osc.stop(); } catch { /* already stopped */ }
      existing.osc.disconnect();
      existing.gain.disconnect();
      this.triggerVoices.delete( note );
    }

    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type            = params.waveform;
    osc.frequency.value = noteToFreq( note );
    osc.detune.value    = params.detune;

    const { attack, decay, sustain, release } = params.adsr;
    const now = ctx.currentTime;
    gain.gain.setValueAtTime( 0, now );
    gain.gain.linearRampToValueAtTime( 1, now + attack );
    gain.gain.linearRampToValueAtTime( sustain, now + attack + decay );
    const held = Math.max( attack + decay, durationSec );
    gain.gain.setValueAtTime( sustain, now + held );
    gain.gain.linearRampToValueAtTime( 0, now + held + release );

    osc.connect( gain );
    gain.connect( this.filter! );
    osc.start( now );
    osc.stop( now + held + release + 0.05 );

    this.triggerVoices.set( note, { osc, gain } );

    // Remove from map and disconnect after the note finishes
    const cleanupMs = ( held + release + 0.1 ) * 1000;
    setTimeout( () => {
      if ( this.triggerVoices.get( note )?.osc === osc ) {
        this.triggerVoices.delete( note );
      }
      osc.disconnect();
      gain.disconnect();
    }, cleanupMs );
  }

  resume() {
    if ( this.ctx?.state === 'suspended' ) { void this.ctx.resume(); }
  }

  get currentTime(): number {
    return this.ctx?.currentTime ?? 0;
  }
}

export const engine = new SynthEngine();
