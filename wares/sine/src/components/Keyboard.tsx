import { useEffect, useCallback } from 'react';
import { KEYBOARD_NOTES, KEY_MAP } from '../types.ts';
import type { Note }               from '../types.ts';

// White and black note definitions with their left-offset in white-key units
const WHITE_NOTES = [ 'C3','D3','E3','F3','G3','A3','B3','C4' ] as const;
const BLACK_DEFS  = [
  { note: 'C#3', offset: 1 },
  { note: 'D#3', offset: 2 },
  { note: 'F#3', offset: 4 },
  { note: 'G#3', offset: 5 },
  { note: 'A#3', offset: 6 },
] as const;

const WHITE_W = 44; // px
const BLACK_W = 26; // px
const BLACK_H = 60; // px — out of 100px white height

interface Props {
  activeNotes: Set<string>;
  onNoteOn:    ( note: Note ) => void;
  onNoteOff:   ( note: Note ) => void;
}

export default function Keyboard( { activeNotes, onNoteOn, onNoteOff }: Props ) {
  const handleKeyDown = useCallback( ( e: KeyboardEvent ) => {
    if ( e.repeat ) return;
    const active = document.activeElement;
    if (
      active instanceof HTMLInputElement ||
      active instanceof HTMLSelectElement ||
      active instanceof HTMLTextAreaElement ||
      ( active as HTMLElement )?.isContentEditable
    ) return;
    const note = KEY_MAP[ e.key.toLowerCase() ];
    if ( note ) onNoteOn( note );
  }, [ onNoteOn ] );

  const handleKeyUp = useCallback( ( e: KeyboardEvent ) => {
    const active = document.activeElement;
    if (
      active instanceof HTMLInputElement ||
      active instanceof HTMLSelectElement ||
      active instanceof HTMLTextAreaElement ||
      ( active as HTMLElement )?.isContentEditable
    ) return;
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

  const totalWidth = WHITE_NOTES.length * WHITE_W;

  return (
    <div className="keyboard">
      <div className="keyboard__keys" style={ { width: totalWidth, position: 'relative' } }>

        { /* White keys */ }
        { WHITE_NOTES.map( ( note, i ) => {
          const isActive = activeNotes.has( note );
          const keyChar  = Object.entries( KEY_MAP ).find( ( [ , n ] ) => n === note )?.[0] ?? '';
          return (
            <button
              key={ note }
              className={ `keyboard__key keyboard__key--white${ isActive ? ' keyboard__key--active' : '' }` }
              style={ { left: i * WHITE_W } }
              onMouseDown={ e => { e.preventDefault(); onNoteOn( note as Note ); } }
              onMouseUp={ () => onNoteOff( note as Note ) }
              onMouseLeave={ e => { if ( e.buttons > 0 ) onNoteOff( note as Note ); } }
              onTouchStart={ e => { e.preventDefault(); onNoteOn( note as Note ); } }
              onTouchEnd={ () => onNoteOff( note as Note ) }
              onTouchCancel={ e => { e.preventDefault(); onNoteOff( note as Note ); } }
              aria-label={ note }
            >
              <span className="keyboard__hint">{ keyChar.toUpperCase() }</span>
            </button>
          );
        } ) }

        { /* Black keys — absolutely positioned on top */ }
        { BLACK_DEFS.map( ( { note, offset } ) => {
          const isActive = activeNotes.has( note );
          const keyChar  = Object.entries( KEY_MAP ).find( ( [ , n ] ) => n === note )?.[0] ?? '';
          const left     = offset * WHITE_W - BLACK_W / 2;
          return (
            <button
              key={ note }
              className={ `keyboard__key keyboard__key--black${ isActive ? ' keyboard__key--active' : '' }` }
              style={ { left, width: BLACK_W, height: BLACK_H, position: 'absolute', top: 0, zIndex: 2 } }
              onMouseDown={ e => { e.preventDefault(); onNoteOn( note as Note ); } }
              onMouseUp={ () => onNoteOff( note as Note ) }
              onMouseLeave={ e => { if ( e.buttons > 0 ) onNoteOff( note as Note ); } }
              onTouchStart={ e => { e.preventDefault(); onNoteOn( note as Note ); } }
              onTouchEnd={ () => onNoteOff( note as Note ) }
              onTouchCancel={ e => { e.preventDefault(); onNoteOff( note as Note ); } }
              aria-label={ note }
            >
              <span className="keyboard__hint keyboard__hint--black">{ keyChar.toUpperCase() }</span>
            </button>
          );
        } ) }
      </div>
      <div className="keyboard__legend">
        { KEYBOARD_NOTES.filter( n => ! n.includes( '#' ) ).map( n => (
          <span key={ n } className="keyboard__note-name" style={ { width: WHITE_W } }>{ n }</span>
        ) ) }
      </div>
    </div>
  );
}
