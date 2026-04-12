import { useEffect, useCallback } from 'react';
import { KEYBOARD_NOTES, KEY_MAP } from '../types.ts';
import type { Note }               from '../types.ts';

const BLACK_NOTES = new Set( [ 'C#3','D#3','F#3','G#3','A#3' ] );

interface Props {
  activeNotes: Set<string>;
  onNoteOn:    ( note: Note ) => void;
  onNoteOff:   ( note: Note ) => void;
}

export default function Keyboard( { activeNotes, onNoteOn, onNoteOff }: Props ) {
  const handleKeyDown = useCallback( ( e: KeyboardEvent ) => {
    if ( e.repeat ) return;
    const note = KEY_MAP[ e.key.toLowerCase() ];
    if ( note ) onNoteOn( note );
  }, [ onNoteOn ] );

  const handleKeyUp = useCallback( ( e: KeyboardEvent ) => {
    const note = KEY_MAP[ e.key.toLowerCase() ];
    if ( note ) onNoteOff( note );
  }, [ onNoteOff ] );

  useEffect( () => {
    window.addEventListener( 'keydown', handleKeyDown );
    window.addEventListener( 'keyup',   handleKeyUp );
    return () => {
      window.removeEventListener( 'keydown', handleKeyDown );
      window.removeEventListener( 'keyup',   handleKeyUp );
    };
  }, [ handleKeyDown, handleKeyUp ] );

  return (
    <div className="keyboard">
      <div className="keyboard__keys">
        { KEYBOARD_NOTES.map( note => {
          const isBlack  = BLACK_NOTES.has( note );
          const isActive = activeNotes.has( note );
          const keyChar  = Object.entries( KEY_MAP ).find( ( [ , n ] ) => n === note )?.[0] ?? '';
          return (
            <button
              key={ note }
              className={ `keyboard__key keyboard__key--${ isBlack ? 'black' : 'white' }${ isActive ? ' keyboard__key--active' : '' }` }
              onMouseDown={ e => { e.preventDefault(); onNoteOn( note as Note ); } }
              onMouseUp={ () => onNoteOff( note as Note ) }
              onMouseLeave={ () => { if ( activeNotes.has( note ) ) onNoteOff( note as Note ); } }
              onTouchStart={ e => { e.preventDefault(); onNoteOn( note as Note ); } }
              onTouchEnd={ () => onNoteOff( note as Note ) }
              aria-label={ note }
            >
              <span className="keyboard__hint">{ keyChar.toUpperCase() }</span>
            </button>
          );
        } ) }
      </div>
    </div>
  );
}
