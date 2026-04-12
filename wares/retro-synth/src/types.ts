export type Waveform = 'sine' | 'square' | 'sawtooth' | 'triangle';

export interface ADSR {
  attack:  number; // seconds
  decay:   number;
  sustain: number; // 0–1
  release: number;
}

export interface FilterParams {
  cutoff:    number; // Hz 20–20000
  resonance: number; // Q 0.1–20
}

export interface SynthParams {
  waveform: Waveform;
  adsr:     ADSR;
  volume:   number; // 0–1
  detune:   number; // cents -50..50
  filter:   FilterParams;
}

export interface SequencerStep {
  active: boolean;
  note:   string; // e.g. 'C4'
}

// MIDI note frequencies for C3–C4 (13 keys)
export const KEYBOARD_NOTES = [
  'C3','C#3','D3','D#3','E3','F3','F#3','G3','G#3','A3','A#3','B3','C4',
] as const;

export type Note = typeof KEYBOARD_NOTES[number];

// Computer keyboard → note mapping
export const KEY_MAP: Record<string, Note> = {
  a: 'C3', w: 'C#3', s: 'D3', e: 'D#3', d: 'E3',
  f: 'F3', t: 'F#3', g: 'G3', y: 'G#3', h: 'A3',
  u: 'A#3', j: 'B3', k: 'C4',
};

export function noteToFreq( note: string ): number {
  const NOTES = [ 'C','C#','D','D#','E','F','F#','G','G#','A','A#','B' ];
  const match = note.match( /^([A-G]#?)(\d)$/ );
  if ( ! match ) return 440;
  const semitone = NOTES.indexOf( match[1] );
  const octave   = parseInt( match[2], 10 );
  return 440 * Math.pow( 2, ( ( octave - 4 ) * 12 + semitone - 9 ) / 12 );
}

export const DEFAULT_PARAMS: SynthParams = {
  waveform: 'sawtooth',
  adsr: { attack: 0.01, decay: 0.1, sustain: 0.7, release: 0.3 },
  volume: 0.6,
  detune: 0,
  filter: { cutoff: 8000, resonance: 1 },
};

export const DEFAULT_STEPS: SequencerStep[] = Array.from( { length: 16 }, ( _, i ) => ( {
  active: [ 0, 4, 8, 12 ].includes( i ),
  note:   'C3',
} ) );
