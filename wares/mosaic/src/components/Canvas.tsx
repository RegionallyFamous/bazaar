import { useRef, useEffect, useCallback } from 'react';
import { rgbaToHex }                       from '../hooks/usePixelEditor.ts';
import type { ZoomLevel, Tool }            from '../types.ts';

interface Props {
	pixels:    Uint8Array;
	size:      number;
	zoom:      ZoomLevel;
	showGrid:  boolean;
	tool:      Tool;
	onPointerDown: ( e: React.PointerEvent<HTMLCanvasElement>, el: HTMLCanvasElement ) => void;
	onPointerMove: ( e: React.PointerEvent<HTMLCanvasElement>, el: HTMLCanvasElement ) => void;
	onPointerUp:   () => void;
	onHover?:      ( hex: string | null ) => void;
}

function renderPixels(
	canvas: HTMLCanvasElement,
	pixels: Uint8Array,
	size: number,
	zoom: number,
	showGrid: boolean,
) {
	const ctx = canvas.getContext( '2d' );
	if ( ! ctx ) return;
	const w   = size * zoom;

	// Checkerboard background (shows through transparent pixels)
	for ( let y = 0; y < size; y++ ) {
		for ( let x = 0; x < size; x++ ) {
			ctx.fillStyle = ( x + y ) % 2 === 0 ? '#313244' : '#45475a';
			ctx.fillRect( x * zoom, y * zoom, zoom, zoom );
		}
	}

	// Draw pixel data using ImageData for speed
	const imgData = ctx.createImageData( w, w );
	const data    = imgData.data;

	for ( let py = 0; py < size; py++ ) {
		for ( let px = 0; px < size; px++ ) {
			const src = ( py * size + px ) * 4;
			const a   = pixels[ src + 3 ]!;
			if ( a === 0 ) continue;

			const r = pixels[ src ]!;
			const g = pixels[ src + 1 ]!;
			const b = pixels[ src + 2 ]!;

			for ( let dy = 0; dy < zoom; dy++ ) {
				for ( let dx = 0; dx < zoom; dx++ ) {
					const dst        = ( ( py * zoom + dy ) * w + ( px * zoom + dx ) ) * 4;
					data[ dst ]     = r;
					data[ dst + 1 ] = g;
					data[ dst + 2 ] = b;
					data[ dst + 3 ] = a;
				}
			}
		}
	}
	ctx.putImageData( imgData, 0, 0 );

	// Grid overlay
	if ( showGrid && zoom >= 4 ) {
		ctx.strokeStyle = 'rgba(200, 200, 220, 0.12)';
		ctx.lineWidth   = 0.5;
		for ( let i = 1; i < size; i++ ) {
			ctx.beginPath();
			ctx.moveTo( i * zoom, 0 );
			ctx.lineTo( i * zoom, w );
			ctx.stroke();
			ctx.beginPath();
			ctx.moveTo( 0, i * zoom );
			ctx.lineTo( w, i * zoom );
			ctx.stroke();
		}
	}
}

export default function Canvas( {
	pixels, size, zoom, showGrid, tool,
	onPointerDown, onPointerMove, onPointerUp, onHover,
}: Props ) {
	const canvasRef = useRef<HTMLCanvasElement>( null );
	const rafRef    = useRef<number | null>( null );

	useEffect( () => {
		if ( ! canvasRef.current ) return;
		const canvas = canvasRef.current;
		// Coalesce rapid pixel updates into a single animation frame to avoid
		// blocking the main thread on every pointer-move event.
		if ( rafRef.current !== null ) cancelAnimationFrame( rafRef.current );
		rafRef.current = requestAnimationFrame( () => {
			renderPixels( canvas, pixels, size, zoom, showGrid );
			rafRef.current = null;
		} );
		return () => {
			if ( rafRef.current !== null ) {
				cancelAnimationFrame( rafRef.current );
				rafRef.current = null;
			}
		};
	}, [ pixels, size, zoom, showGrid ] );

	const wrapDown = useCallback( ( e: React.PointerEvent<HTMLCanvasElement> ) => {
		if ( canvasRef.current ) onPointerDown( e, canvasRef.current );
	}, [ onPointerDown ] );

	const wrapMove = useCallback( ( e: React.PointerEvent<HTMLCanvasElement> ) => {
		if ( canvasRef.current ) {
			onPointerMove( e, canvasRef.current );
			if ( onHover ) {
				const rect = canvasRef.current.getBoundingClientRect();
				const px   = Math.floor( ( e.clientX - rect.left ) / zoom );
				const py   = Math.floor( ( e.clientY - rect.top ) / zoom );
				if ( px >= 0 && px < size && py >= 0 && py < size ) {
					const idx = ( py * size + px ) * 4;
					onHover( ( pixels[ idx + 3 ] ?? 0 ) > 0
						? rgbaToHex( pixels[ idx ]!, pixels[ idx + 1 ]!, pixels[ idx + 2 ]! )
						: null,
					);
				} else {
					onHover( null );
				}
			}
		}
	}, [ onPointerMove, onHover, zoom, size, pixels ] );

	const wrapLeave = useCallback( () => {
		onPointerUp();
		onHover?.( null );
	}, [ onPointerUp, onHover ] );

	const dim = size * zoom;

	return (
		<canvas
			ref={ canvasRef }
			role="img"
			aria-label={ `Pixel art canvas, ${ size }x${ size } pixels, ${ tool } tool selected` }
			width={ dim }
			height={ dim }
			style={ { display: 'block', cursor: 'crosshair', imageRendering: 'pixelated' } }
			onPointerDown={ wrapDown }
			onPointerMove={ wrapMove }
			onPointerUp={ onPointerUp }
			onPointerLeave={ wrapLeave }
		/>
	);
}
