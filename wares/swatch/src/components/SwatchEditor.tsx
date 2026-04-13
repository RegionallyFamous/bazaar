import { useState, useEffect, useRef } from 'react';
import type { Swatch }         from '../types.ts';
import { hexToHsl, hslToHex, isValidHex } from '../utils/color.ts';

interface Props {
  swatch:   Swatch;
  onChange: ( updated: Swatch ) => void;
  onClose:  () => void;
}

export default function SwatchEditor( { swatch, onChange, onClose }: Props ) {
  const [ hex,  setHex  ] = useState( swatch.hex );
  const [ name, setName ] = useState( swatch.name );
  const [ hsl,  setHsl  ] = useState( hexToHsl( swatch.hex ) );

  // Detect when a different swatch is selected and reset local state during
  // render to avoid a stale editor showing the previous swatch's values.
  const prevIdRef = useRef( swatch.id );
  if ( swatch.id !== prevIdRef.current ) {
    prevIdRef.current = swatch.id;
    setHex( swatch.hex );
    setName( swatch.name );
    setHsl( hexToHsl( swatch.hex ) );
  }

  // Sync hex → hsl when hex input changes
  useEffect( () => {
    if ( isValidHex( hex ) ) setHsl( hexToHsl( hex ) );
  }, [ hex ] );

  function applyHsl( next: typeof hsl ) {
    setHsl( next );
    setHex( hslToHex( next ) );
  }

  function commit() {
    const finalHex = isValidHex( hex ) ? hex : swatch.hex;
    onChange( { ...swatch, hex: finalHex, name: name.trim() } );
  }

  async function pickColor() {
    const picker = ( window as Window & { EyeDropper?: new () => { open: () => Promise<{ sRGBHex: string }> } } ).EyeDropper;
    if ( ! picker ) return;
    try {
      const result = await new picker().open();
      setHex( result.sRGBHex );
    } catch {
      // user cancelled
    }
  }

  const hasEyeDropper = !! ( window as Window & { EyeDropper?: unknown } ).EyeDropper;

  return (
    <div className="swatch-editor">
      <div className="swatch-editor__preview" style={ { background: isValidHex( hex ) ? hex : '#ccc' } } />

      <div className="swatch-editor__section">
        <label className="swatch-editor__label">Name</label>
        <input
          className="swatch-editor__input"
          value={ name }
          onChange={ e => setName( e.target.value ) }
          placeholder="e.g. primary"
        />
      </div>

      <div className="swatch-editor__section">
        <label className="swatch-editor__label">Hex</label>
        <div className="swatch-editor__hex-row">
          <input
            className="swatch-editor__input swatch-editor__input--hex"
            value={ hex }
            onChange={ e => setHex( e.target.value ) }
            maxLength={ 7 }
            spellCheck={ false }
          />
          { hasEyeDropper && (
            <button className="swatch-editor__eyedrop-btn" onClick={ pickColor } title="Pick colour from screen">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m2 22 1-1h3l9-9"/>
                <path d="M3 21v-3l9-9"/>
                <path d="m15 6 3.4-3.4a2.1 2.1 0 1 1 3 3L18 9l.4.4a2.1 2.1 0 1 1-3 3l-3.8-3.8-2.1 2.2"/>
              </svg>
            </button>
          ) }
        </div>
      </div>

      <div className="swatch-editor__section">
        <label className="swatch-editor__label">Hue — { hsl.h }°</label>
        <input type="range" min="0" max="359" value={ hsl.h }
          onChange={ e => applyHsl( { ...hsl, h: Number( e.target.value ) } ) }
          className="swatch-editor__range swatch-editor__range--hue"
        />
      </div>

      <div className="swatch-editor__section">
        <label className="swatch-editor__label">Saturation — { hsl.s }%</label>
        <input type="range" min="0" max="100" value={ hsl.s }
          onChange={ e => applyHsl( { ...hsl, s: Number( e.target.value ) } ) }
          className="swatch-editor__range"
          style={ { background: `linear-gradient(to right, hsl(${hsl.h},0%,${hsl.l}%), hsl(${hsl.h},100%,${hsl.l}%))` } }
        />
      </div>

      <div className="swatch-editor__section">
        <label className="swatch-editor__label">Lightness — { hsl.l }%</label>
        <input type="range" min="0" max="100" value={ hsl.l }
          onChange={ e => applyHsl( { ...hsl, l: Number( e.target.value ) } ) }
          className="swatch-editor__range"
          style={ { background: `linear-gradient(to right, hsl(${hsl.h},${hsl.s}%,0%), hsl(${hsl.h},${hsl.s}%,50%), hsl(${hsl.h},${hsl.s}%,100%))` } }
        />
      </div>

      <div className="swatch-editor__actions">
        <button className="swatch-editor__btn" onClick={ onClose }>Cancel</button>
        <button className="swatch-editor__btn swatch-editor__btn--primary" onClick={ commit }>Apply</button>
      </div>
    </div>
  );
}
