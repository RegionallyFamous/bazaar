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
  const [ fg, setFg ] = useState( 0 );
  const [ bg, setBg ] = useState( 1 );

  const fgHex = swatches[ fg ]?.hex ?? '#000000';
  const bgHex = swatches[ bg ]?.hex ?? '#ffffff';
  const ratio = contrastRatio( fgHex, bgHex );
  const level = wcagLevel( ratio );

  return (
    <div className="contrast">
      <h3 className="contrast__title">Contrast Checker</h3>

      <div className="contrast__preview" style={ { background: bgHex, color: fgHex } }>
        <span className="contrast__sample-lg">Aa</span>
        <span className="contrast__sample-sm">Sample text</span>
      </div>

      <div className="contrast__controls">
        <div className="contrast__field">
          <label className="contrast__label">Foreground</label>
          <select className="contrast__select" value={ fg } onChange={ e => setFg( Number( e.target.value ) ) }>
            { swatches.map( ( s, i ) => (
              <option key={ s.id } value={ i }>{ s.name || s.hex }</option>
            ) ) }
          </select>
        </div>
        <div className="contrast__field">
          <label className="contrast__label">Background</label>
          <select className="contrast__select" value={ bg } onChange={ e => setBg( Number( e.target.value ) ) }>
            { swatches.map( ( s, i ) => (
              <option key={ s.id } value={ i }>{ s.name || s.hex }</option>
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
