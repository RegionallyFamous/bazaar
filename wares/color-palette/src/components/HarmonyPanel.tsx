import { useState } from 'react';
import type { HarmonyType, Swatch } from '../types.ts';
import { HARMONY_LABELS }           from '../types.ts';
import { generateHarmony }          from '../utils/color.ts';

interface Props {
  swatches:   Swatch[];
  onAddSwatch: ( hex: string ) => void;
}

const HARMONY_TYPES: HarmonyType[] = [
  'complementary', 'triadic', 'analogous', 'split-complementary', 'tetradic',
];

export default function HarmonyPanel( { swatches, onAddSwatch }: Props ) {
  const [ sourceIdx, setSourceIdx ] = useState( 0 );
  const [ type, setType ]           = useState<HarmonyType>( 'complementary' );

  const source = swatches[ sourceIdx ]?.hex ?? '#3b82f6';
  const harmony = generateHarmony( source, type );

  return (
    <div className="harmony">
      <h3 className="harmony__title">Harmony Generator</h3>

      <div className="harmony__controls">
        <div className="harmony__field">
          <label className="harmony__label">Source swatch</label>
          <select
            className="harmony__select"
            value={ sourceIdx }
            onChange={ e => setSourceIdx( Number( e.target.value ) ) }
          >
            { swatches.map( ( s, i ) => (
              <option key={ s.id } value={ i }>
                { s.name || s.hex }
              </option>
            ) ) }
          </select>
        </div>

        <div className="harmony__field">
          <label className="harmony__label">Harmony type</label>
          <select
            className="harmony__select"
            value={ type }
            onChange={ e => setType( e.target.value as HarmonyType ) }
          >
            { HARMONY_TYPES.map( t => (
              <option key={ t } value={ t }>{ HARMONY_LABELS[ t ] }</option>
            ) ) }
          </select>
        </div>
      </div>

      <div className="harmony__swatches">
        { harmony.map( hex => (
          <button
            key={ hex }
            className="harmony__swatch"
            style={ { background: hex } }
            onClick={ () => onAddSwatch( hex ) }
            title={ `Add ${hex}` }
          >
            <span className="harmony__hex">{ hex }</span>
          </button>
        ) ) }
      </div>
      <p className="harmony__hint">Click a colour to add it to the palette.</p>
    </div>
  );
}
