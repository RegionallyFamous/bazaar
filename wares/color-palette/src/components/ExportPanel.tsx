import { useState } from 'react';
import type { Palette } from '../types.ts';
import { toCssVars, toTailwind, toHexList, toSvg, download } from '../utils/export.ts';

interface Props { palette: Palette; }

type Format = 'css' | 'tailwind' | 'hex' | 'svg';

const FORMAT_LABELS: Record<Format, string> = {
  css:      'CSS Variables',
  tailwind: 'Tailwind Config',
  hex:      'Hex List',
  svg:      'SVG Swatches',
};

export default function ExportPanel( { palette }: Props ) {
  const [ fmt, setFmt ] = useState<Format>( 'css' );
  const [ copied, setCopied ] = useState( false );

  function getContent(): string {
    switch ( fmt ) {
      case 'css':      return toCssVars( palette );
      case 'tailwind': return toTailwind( palette );
      case 'hex':      return toHexList( palette );
      case 'svg':      return toSvg( palette );
    }
  }

  function handleCopy() {
    navigator.clipboard.writeText( getContent() ).then( () => {
      setCopied( true );
      setTimeout( () => setCopied( false ), 1800 );
    } ).catch( () => undefined );
  }

  function handleDownload() {
    const ext: Record<Format, string> = { css: 'css', tailwind: 'js', hex: 'txt', svg: 'svg' };
    const mime: Record<Format, string> = {
      css: 'text/css', tailwind: 'text/javascript', hex: 'text/plain', svg: 'image/svg+xml',
    };
    download( getContent(), `${palette.name}.${ext[ fmt ]}`, mime[ fmt ] );
  }

  return (
    <div className="export">
      <div className="export__tabs">
        { ( [ 'css', 'tailwind', 'hex', 'svg' ] as Format[] ).map( f => (
          <button
            key={ f }
            className={ `export__tab${ fmt === f ? ' export__tab--active' : '' }` }
            onClick={ () => setFmt( f ) }
          >
            { FORMAT_LABELS[ f ] }
          </button>
        ) ) }
      </div>

      <pre className="export__preview">{ getContent() }</pre>

      <div className="export__actions">
        <button className="export__btn" onClick={ handleCopy }>
          { copied ? '✓ Copied!' : 'Copy' }
        </button>
        <button className="export__btn export__btn--primary" onClick={ handleDownload }>
          Download
        </button>
      </div>
    </div>
  );
}
