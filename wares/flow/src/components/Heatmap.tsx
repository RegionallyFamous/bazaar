import { useMemo }       from 'react';
import type { DayRecord } from '../types.ts';

interface Props {
	history: DayRecord[];
}

const WEEKS = 26;   // 6 months
const DAYS  = 7;

function localDateKey( date: Date ): string {
	return `${ date.getFullYear() }-${ String( date.getMonth() + 1 ).padStart( 2, '0' ) }-${ String( date.getDate() ).padStart( 2, '0' ) }`;
}

export default function Heatmap( { history }: Props ) {
	const cells = useMemo( () => {
		const map = new Map<string, number>(
			history.map( d => [ d.date, d.sessions ] ),
		);

		const today = new Date();
		today.setHours( 0, 0, 0, 0 );

		// Start from the Sunday WEEKS weeks ago
		const start = new Date( today );
		start.setDate( start.getDate() - ( WEEKS * 7 ) + 1 );

		const grid: { date: string; sessions: number; iso: string }[][] = [];

		for ( let w = 0; w < WEEKS; w++ ) {
			const week: { date: string; sessions: number; iso: string }[] = [];
			for ( let d = 0; d < DAYS; d++ ) {
				const cell = new Date( start );
				cell.setDate( start.getDate() + w * 7 + d );
				const iso      = localDateKey( cell );
				const sessions = map.get( iso ) ?? 0;
				week.push( {
					date:     cell.toLocaleDateString( 'en-US', { month: 'short', day: 'numeric' } ),
					sessions,
					iso,
				} );
			}
			grid.push( week );
		}

		return grid;
	}, [ history ] );

	function cellColor( sessions: number ): string {
		if ( sessions === 0 ) return 'rgba(255,255,255,.06)';
		if ( sessions < 2 )   return '#92400e';
		if ( sessions < 4 )   return '#b45309';
		if ( sessions < 6 )   return '#d97706';
		return '#f59e0b';
	}

	const totalSessions = history.reduce( ( s, d ) => s + d.sessions, 0 );
	const todayKey      = localDateKey( new Date() );
	const todaySessions = history.find( d => d.date === todayKey )?.sessions ?? 0;

	return (
		<div className="heatmap">
			<div className="heatmap__header">
				<span className="heatmap__title">Session History</span>
				<div className="heatmap__stats">
					<span>Today: <strong>{ todaySessions }</strong></span>
					<span>Total: <strong>{ totalSessions }</strong></span>
				</div>
			</div>
			<div className="heatmap__grid">
				{ cells.map( ( week, wi ) => (
					<div key={ wi } className="heatmap__week">
						{ week.map( cell => (
							<div
								key={ cell.iso }
								className="heatmap__cell"
								style={ { background: cellColor( cell.sessions ) } }
								title={ `${ cell.date }: ${ cell.sessions } session${ cell.sessions !== 1 ? 's' : '' }` }
								role="img"
								aria-label={ `${ cell.sessions } session${ cell.sessions !== 1 ? 's' : '' } on ${ cell.date }` }
								tabIndex={ 0 }
							/>
						) ) }
					</div>
				) ) }
			</div>
			<div className="heatmap__legend">
				<span>Less</span>
				{ [ 0, 1, 3, 5, 7 ].map( n => (
					<div
						key={ n }
						className="heatmap__cell heatmap__cell--legend"
						style={ { background: cellColor( n ) } }
					/>
				) ) }
				<span>More</span>
			</div>
		</div>
	);
}
