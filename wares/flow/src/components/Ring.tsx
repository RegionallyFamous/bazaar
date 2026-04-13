import type { Mode } from '../types.ts';
import { MODE_COLOR } from '../types.ts';

interface Props {
	progress:    number;   // 0–1
	mode:        Mode;
	secondsLeft: number;
	running:     boolean;
	onToggle:    () => void;
}

const R         = 88;
const CX        = 110;
const CY        = 110;
const CIRCUM    = 2 * Math.PI * R;
const TRACK_GAP = 0;

function fmtTime( s: number ): string {
	const m = Math.floor( s / 60 );
	const r = s % 60;
	return `${ String( m ).padStart( 2, '0' ) }:${ String( r ).padStart( 2, '0' ) }`;
}

export default function Ring( { progress, mode, secondsLeft, running, onToggle }: Props ) {
	const color  = MODE_COLOR[ mode ];
	const offset = CIRCUM * ( 1 - progress ) - TRACK_GAP;

	return (
		<div className="ring-wrap">
		<svg
			width="220"
			height="220"
			viewBox="0 0 220 220"
			className="ring-svg"
			onClick={ onToggle }
			onKeyDown={ ( e ) => { if ( e.key === 'Enter' || e.key === ' ' ) { e.preventDefault(); onToggle(); } } }
			role="button"
			tabIndex={ 0 }
			aria-label={ running ? 'Pause' : 'Start' }
		>
				{ /* Track */ }
				<circle
					cx={ CX } cy={ CY } r={ R }
					fill="none"
					stroke="rgba(255,255,255,.06)"
					strokeWidth="10"
				/>
				{ /* Progress */ }
				<circle
					cx={ CX } cy={ CY } r={ R }
					fill="none"
					stroke={ color }
					strokeWidth="10"
					strokeLinecap="round"
					strokeDasharray={ CIRCUM }
					strokeDashoffset={ offset }
					transform={ `rotate(-90 ${ CX } ${ CY })` }
					style={ { transition: running ? 'stroke-dashoffset 1s linear' : 'none' } }
				/>
				{ /* Time */ }
				<text
					x={ CX } y={ CY - 8 }
					textAnchor="middle"
					dominantBaseline="middle"
					fontSize="32"
					fontWeight="700"
					fontFamily="system-ui, -apple-system, sans-serif"
					fill="#fafaf9"
				>
					{ fmtTime( secondsLeft ) }
				</text>
				{ /* Play/Pause indicator */ }
				<text
					x={ CX } y={ CY + 24 }
					textAnchor="middle"
					dominantBaseline="middle"
					fontSize="13"
					fontFamily="system-ui, -apple-system, sans-serif"
					fill="rgba(255,255,255,.45)"
				>
					{ running ? '▐▐  pause' : '▶  start' }
				</text>
			</svg>
		</div>
	);
}
