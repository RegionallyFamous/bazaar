import { useState } from 'react';
import type { Swatch } from '../types.ts';
import { contrastRatio, wcagLevel } from '../utils/color.ts';

interface Props { swatches: Swatch[]; }

const LEVEL_CLASS: Record<string, string> = {
  AAA:      'contrast__badge--aaa',
  AA:       'contrast__badge--aa',
  'AA Large': 'contrast__badge--aa-large',
  Fail:     'contrast__badge--fail',
};

export default function ContrastChecker( { swatches }: Props ) {
  const [ fg, setFg ] = useState<string>( () => swatches[ 0 ]?.id ?? '' );
  const [ bg, setBg ] = useState<string>( () => swatches[ 1 ]?.id ?? '' );

  // Fall back gracefully when the stored ID no longer exists in the palette
  const fgSwatch = swatches.find( s => s.id === fg ) ?? swatches[ 0 ];
  const bgSwatch = swatches.find( s => s.id === bg ) ?? swatches[ 1 ] ?? swatches[ 0 ];

  const resolvedFg = fgSwatch?.id ?? '';
  const resolvedBg = bgSwatch?.id ?? '';

  const fgHex = fgSwatch?.hex ?? '#000000';
  const bgHex = bgSwatch?.hex ?? '#ffffff';
  const ratio = contrastRatio( fgHex, bgHex );
  const level = wcagLevel( ratio );

  return (
    <div className="contrast">
      <div className="contrast__preview" style={ { background: bgHex, color: fgHex } }>
        <span className="contrast__sample-lg">Aa</span>
        <span className="contrast__sample-sm">Sample text</span>
      </div>

      <div className="contrast__controls">
        <div className="contrast__field">
          <label className="contrast__label" htmlFor="contrast-fg">Foreground</label>
          <select
            id="contrast-fg"
            className="contrast__select"
            value={ resolvedFg }
            onChange={ e => setFg( e.target.value ) }
          >
            { swatches.map( s => (
              <option key={ s.id } value={ s.id }>{ s.name || s.hex }</option>
            ) ) }
          </select>
        </div>
        <div className="contrast__field">
          <label className="contrast__label" htmlFor="contrast-bg">Background</label>
          <select
            id="contrast-bg"
            className="contrast__select"
            value={ resolvedBg }
            onChange={ e => setBg( e.target.value ) }
          >
            { swatches.map( s => (
              <option key={ s.id } value={ s.id }>{ s.name || s.hex }</option>
            ) ) }
          </select>
        </div>
      </div>

      <div className="contrast__result">
        <span className="contrast__ratio">{ ratio.toFixed( 2 ) }:1</span>
        <span className={ `contrast__badge ${ LEVEL_CLASS[ level ] }` }>{ level }</span>
      </div>

      <div className="contrast__breakdown">
        <span>Normal text (4.5:1): { ratio >= 4.5 ? '✓' : '✗' }</span>
        <span>Large text (3:1): { ratio >= 3 ? '✓' : '✗' }</span>
        <span>AAA (7:1): { ratio >= 7 ? '✓' : '✗' }</span>
      </div>
    </div>
  );
}
