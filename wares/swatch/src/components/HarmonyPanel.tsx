import { useState } from 'react';
import type { HarmonyType, Swatch } from '../types.ts';
import { HARMONY_LABELS }           from '../types.ts';
import { generateHarmony }          from '../utils/color.ts';

interface Props {
  swatches:    Swatch[];
  onAddSwatch: ( hex: string ) => void;
}

const HARMONY_TYPES: HarmonyType[] = [
  'complementary', 'triadic', 'analogous', 'split-complementary', 'tetradic',
];

export default function HarmonyPanel( { swatches, onAddSwatch }: Props ) {
  const [ sourceId, setSourceId ] = useState<string>( () => swatches[ 0 ]?.id ?? '' );
  const [ type, setType ]         = useState<HarmonyType>( 'complementary' );

  // Fall back to first swatch when the stored ID is no longer in the palette
  const sourceSwatch = swatches.find( s => s.id === sourceId ) ?? swatches[ 0 ];
  const resolvedId   = sourceSwatch?.id ?? '';
  const source       = sourceSwatch?.hex ?? '#3b82f6';
  const harmony      = generateHarmony( source, type );

  return (
    <div className="harmony">
      <div className="harmony__controls">
        <div className="harmony__field">
          <label className="harmony__label" htmlFor="harmony-source">Source swatch</label>
          <select
            id="harmony-source"
            className="harmony__select"
            value={ resolvedId }
            onChange={ e => setSourceId( e.target.value ) }
          >
            { swatches.map( s => (
              <option key={ s.id } value={ s.id }>
                { s.name || s.hex }
              </option>
            ) ) }
          </select>
        </div>

        <div className="harmony__field">
          <label className="harmony__label" htmlFor="harmony-type">Harmony type</label>
          <select
            id="harmony-type"
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
        { harmony.map( ( hex, i ) => (
          <button
            key={ `${ type }-${ hex }-${ i }` }
            className="harmony__swatch"
            style={ { background: hex } }
            onClick={ () => onAddSwatch( hex ) }
            title={ `Add ${ hex }` }
          >
            <span className="harmony__hex">{ hex }</span>
          </button>
        ) ) }
      </div>
      <p className="harmony__hint">Click a colour to add it to the palette.</p>
    </div>
  );
}
