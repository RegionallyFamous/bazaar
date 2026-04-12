import { useState, useEffect } from 'react';
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
              🔬
            </button>
          ) }
        </div>
      </div>

      <div className="swatch-editor__section">
        <label className="swatch-editor__label">Hue — { hsl.h }°</label>
        <input type="range" min="0" max="359" value={ hsl.h }
          onChange={ e => applyHsl( { ...hsl, h: Number( e.target.value ) } ) }
          className="swatch-editor__range swatch-editor__range--hue"
          style={ { '--h': hsl.h } as React.CSSProperties }
        />
      </div>

      <div className="swatch-editor__section">
        <label className="swatch-editor__label">Saturation — { hsl.s }%</label>
        <input type="range" min="0" max="100" value={ hsl.s }
          onChange={ e => applyHsl( { ...hsl, s: Number( e.target.value ) } ) }
          className="swatch-editor__range"
        />
      </div>

      <div className="swatch-editor__section">
        <label className="swatch-editor__label">Lightness — { hsl.l }%</label>
        <input type="range" min="0" max="100" value={ hsl.l }
          onChange={ e => applyHsl( { ...hsl, l: Number( e.target.value ) } ) }
          className="swatch-editor__range"
        />
      </div>

      <div className="swatch-editor__actions">
        <button className="swatch-editor__btn" onClick={ onClose }>Cancel</button>
        <button className="swatch-editor__btn swatch-editor__btn--primary" onClick={ commit }>Apply</button>
      </div>
    </div>
  );
}
