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
        <svg viewBox="0 0 48 48" width="48" height="48">
          { /* Outer ring shadow */ }
          <circle cx="24" cy="24" r="20" fill="#040c07" />
          { /* Track ring */ }
          <circle cx="24" cy="24" r="18" fill="none" stroke="#173026" strokeWidth="4"/>
          { /* Value arc */ }
          <circle
            cx="24" cy="24" r="18"
            fill="none"
            stroke="#0dca8a"
            strokeWidth="4"
            strokeDasharray={ `${ pct * 113 } 113` }
            strokeLinecap="round"
            transform="rotate(-225 24 24)"
            opacity="0.95"
          />
          { /* Knob face */ }
          <circle cx="24" cy="24" r="12" fill="#0b1a10" />
          <circle cx="24" cy="24" r="12" fill="url(#knob-grad)" opacity="0.6" />
          { /* Pointer dot */ }
          <circle
            cx={ 24 + 8 * Math.cos( ( deg - 90 ) * Math.PI / 180 ) }
            cy={ 24 + 8 * Math.sin( ( deg - 90 ) * Math.PI / 180 ) }
            r="2.5"
            fill="#0dca8a"
          />
          <defs>
            <radialGradient id="knob-grad" cx="40%" cy="30%" r="70%">
              <stop offset="0%" stopColor="#1a3a28" />
              <stop offset="100%" stopColor="#040c07" />
            </radialGradient>
          </defs>
        </svg>
      </div>
      <span className="knob__value">{ displayValue }</span>
      <span className="knob__label">{ label }</span>
    </div>
  );
}
