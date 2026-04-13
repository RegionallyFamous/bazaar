import { useRef, useCallback, useEffect } from 'react';

interface Props {
  label:    string;
  value:    number;
  min:      number;
  max:      number;
  step?:    number;
  unit?:    string;
  onChange: ( v: number ) => void;
  format?:  ( v: number ) => string;
}

const DRAG_SENSITIVITY = 0.4; // px per unit

export default function Knob( { label, value, min, max, step = 0.01, unit = '', onChange, format }: Props ) {
  const startRef  = useRef<{ y: number; v: number } | null>( null );
  const rangeRef  = useRef( max - min );

  useEffect( () => { rangeRef.current = max - min; }, [ min, max ] );

  // Map value → rotation (-135° to +135°)
  const pct = ( value - min ) / ( max - min );
  const deg = -135 + pct * 270;

  const onMouseDown = useCallback( ( e: React.MouseEvent ) => {
    e.preventDefault();
    startRef.current = { y: e.clientY, v: value };

    function onMove( ev: MouseEvent ) {
      if ( ! startRef.current ) return;
      const dy    = startRef.current.y - ev.clientY;
      const delta = ( dy / 100 ) * rangeRef.current * DRAG_SENSITIVITY;
      const raw   = startRef.current.v + delta;
      const snapped = Math.round( raw / step ) * step;
      onChange( Math.min( max, Math.max( min, parseFloat( snapped.toFixed( 6 ) ) ) ) );
    }

    function onUp() {
      startRef.current = null;
      window.removeEventListener( 'mousemove', onMove );
      window.removeEventListener( 'mouseup',   onUp );
    }

    window.addEventListener( 'mousemove', onMove );
    window.addEventListener( 'mouseup',   onUp );
  }, [ value, min, max, step, onChange ] );

  const displayValue = format ? format( value ) : `${ Number( value.toFixed( 2 ) ) }${ unit }`;

  return (
    <div className="knob">
      <div
        className="knob__dial"
        onMouseDown={ onMouseDown }
        role="slider"
        aria-label={ label }
        aria-valuenow={ value }
        aria-valuemin={ min }
        aria-valuemax={ max }
        tabIndex={ 0 }
        onKeyDown={ e => {
          const nudge = step ?? ( max - min ) / 20;
          if ( e.key === 'ArrowUp'   ) { e.preventDefault(); onChange( Math.min( max, value + nudge ) ); }
          if ( e.key === 'ArrowDown' ) { e.preventDefault(); onChange( Math.max( min, value - nudge ) ); }
        } }
      >
        <svg viewBox="0 0 44 44" width="44" height="44">
          { /* Track ring */ }
          <circle cx="22" cy="22" r="18" fill="none" stroke="#1a3a2a" strokeWidth="4"/>
          { /* Value arc */ }
          <circle
            cx="22" cy="22" r="18"
            fill="none"
            stroke="#10b981"
            strokeWidth="4"
            strokeDasharray={ `${ pct * 113 } 113` }
            strokeLinecap="round"
            transform="rotate(-225 22 22)"
            opacity="0.9"
          />
          { /* Pointer */ }
          <line
            x1="22" y1="22"
            x2={ 22 + 13 * Math.cos( ( deg - 90 ) * Math.PI / 180 ) }
            y2={ 22 + 13 * Math.sin( ( deg - 90 ) * Math.PI / 180 ) }
            stroke="#10b981"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
          <circle cx="22" cy="22" r="4" fill="#0f2a1e"/>
        </svg>
      </div>
      <span className="knob__value">{ displayValue }</span>
      <span className="knob__label">{ label }</span>
    </div>
  );
}
