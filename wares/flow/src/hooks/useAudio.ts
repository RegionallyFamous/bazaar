import { useRef, useCallback, useState, useEffect } from 'react';

export type SoundType = 'rain' | 'brown' | 'white';

interface SoundState {
	type:   SoundType;
	volume: number;
	active: boolean;
}

const BUFFER_SIZE = 2 * 44100; // 2 seconds, looped

function createNoiseBuffer( ctx: AudioContext, type: SoundType ): AudioBuffer {
	const buffer = ctx.createBuffer( 1, BUFFER_SIZE, ctx.sampleRate );
	const data   = buffer.getChannelData( 0 );

	if ( type === 'white' ) {
		for ( let i = 0; i < BUFFER_SIZE; i++ ) {
			data[ i ] = ( Math.random() * 2 ) - 1;
		}
	} else {
		// Brown noise: leaky integrator
		let last = 0;
		for ( let i = 0; i < BUFFER_SIZE; i++ ) {
			const white = ( Math.random() * 2 ) - 1;
			last        = ( last + 0.02 * white ) / 1.02;
			data[ i ]   = last * 3.5;
		}
	}

	if ( type === 'rain' ) {
		// Rain = brown noise + high-pass filter applied to buffer (simulate via mix)
		let last = 0;
		for ( let i = 0; i < BUFFER_SIZE; i++ ) {
			const white = ( Math.random() * 2 ) - 1;
			last        = ( last + 0.02 * white ) / 1.02;
			// Mix brown (low rumble) with white (high hiss)
			data[ i ] = last * 2 + ( ( Math.random() * 2 ) - 1 ) * 0.15;
		}
	}

	return buffer;
}

interface ActiveSound {
	source: AudioBufferSourceNode;
	gain:   GainNode;
}

export function useAudio() {
	const ctxRef = useRef<AudioContext | null>( null );
	const sounds = useRef<Map<SoundType, ActiveSound>>( new Map() );

	const [ state, setState ] = useState<Record<SoundType, SoundState>>( {
		rain:  { type: 'rain',  volume: 0.4, active: false },
		brown: { type: 'brown', volume: 0.4, active: false },
		white: { type: 'white', volume: 0.3, active: false },
	} );

	// Stop all sounds and close the AudioContext on unmount.
	useEffect( () => {
		return () => {
			sounds.current.forEach( s => {
				try { s.source.stop(); } catch { /* already stopped */ }
			} );
			sounds.current.clear();
			ctxRef.current?.close().catch( () => {} );
		};
	}, [] );

	function ensureCtx(): AudioContext {
		if ( ! ctxRef.current ) {
			ctxRef.current = new AudioContext();
		}
		if ( ctxRef.current.state === 'suspended' ) {
			ctxRef.current.resume().catch( () => {} );
		}
		return ctxRef.current;
	}

	// Audio I/O happens outside setState so the updater stays pure.
	const toggleSound = useCallback( ( type: SoundType ) => {
		const current   = state[ type ];
		const nowActive = ! current.active;

		if ( nowActive ) {
			const ctx    = ensureCtx();
			const buffer = createNoiseBuffer( ctx, type );
			const source = ctx.createBufferSource();
			source.buffer = buffer;
			source.loop   = true;

			const gain  = ctx.createGain();
			gain.gain.value = current.volume;

			source.connect( gain );
			gain.connect( ctx.destination );
			source.start();

			sounds.current.set( type, { source, gain } );
		} else {
			const active = sounds.current.get( type );
			if ( active ) {
				active.source.stop();
				sounds.current.delete( type );
			}
		}

		setState( prev => ( { ...prev, [ type ]: { ...prev[ type ], active: nowActive } } ) );
	}, [ state ] );

	const setVolume = useCallback( ( type: SoundType, volume: number ) => {
		setState( prev => {
			const active = sounds.current.get( type );
			if ( active ) {
				active.gain.gain.value = volume;
			}
			return { ...prev, [ type ]: { ...prev[ type ], volume } };
		} );
	}, [] );

	return { state, toggleSound, setVolume };
}
