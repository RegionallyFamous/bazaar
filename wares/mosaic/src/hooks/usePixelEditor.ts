import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { getBazaarContext, createStore, bzr }        from '@bazaar/client';
import type { Tool, CanvasSize, ZoomLevel, SaveSlot } from '../types.ts';

const MAX_HISTORY = 40;

export function makeBlankPixels( size: number ): Uint8Array {
	const pixels = new Uint8Array( size * size * 4 );
	for ( let i = 0; i < size * size; i++ ) {
		pixels[ i * 4 ]     = 255;
		pixels[ i * 4 + 1 ] = 255;
		pixels[ i * 4 + 2 ] = 255;
		pixels[ i * 4 + 3 ] = 0;
	}
	return pixels;
}

function hexToRgba( hex: string ): [ number, number, number, number ] {
	if ( ! /^#[0-9a-fA-F]{6}$/.test( hex ) ) {
		console.warn( 'hexToRgba: invalid hex value', hex );
		return [ 0, 0, 0, 255 ];
	}
	const c = hex.replace( '#', '' );
	return [
		parseInt( c.slice( 0, 2 ), 16 ),
		parseInt( c.slice( 2, 4 ), 16 ),
		parseInt( c.slice( 4, 6 ), 16 ),
		255,
	];
}

export function rgbaToHex( r: number, g: number, b: number ): string {
	return '#' + [ r, g, b ]
		.map( n => Math.max( 0, Math.min( 255, n ) ).toString( 16 ).padStart( 2, '0' ) )
		.join( '' );
}

function sameColor(
	pixels: Uint8Array,
	idx: number,
	color: [ number, number, number, number ],
): boolean {
	return (
		pixels[ idx ]     === color[ 0 ] &&
		pixels[ idx + 1 ] === color[ 1 ] &&
		pixels[ idx + 2 ] === color[ 2 ] &&
		pixels[ idx + 3 ] === color[ 3 ]
	);
}

function floodFill(
	pixels: Uint8Array,
	x: number,
	y: number,
	fillColor: [ number, number, number, number ],
	size: number,
): Uint8Array {
	const idx    = ( y * size + x ) * 4;
	const target: [ number, number, number, number ] = [
		pixels[ idx ]!, pixels[ idx + 1 ]!, pixels[ idx + 2 ]!, pixels[ idx + 3 ]!,
	];
	if ( sameColor( new Uint8Array( fillColor ), 0, target ) ) return pixels;

	const result = new Uint8Array( pixels );
	const stack: [ number, number ][] = [ [ x, y ] ];

	while ( stack.length > 0 ) {
		const point = stack.pop()!;
		const [ cx, cy ] = point;
		if ( cx < 0 || cx >= size || cy < 0 || cy >= size ) continue;

		const cidx = ( cy * size + cx ) * 4;
		if ( ! sameColor( result, cidx, target ) ) continue;

		result[ cidx ]     = fillColor[ 0 ];
		result[ cidx + 1 ] = fillColor[ 1 ];
		result[ cidx + 2 ] = fillColor[ 2 ];
		result[ cidx + 3 ] = fillColor[ 3 ];

		stack.push( [ cx + 1, cy ], [ cx - 1, cy ], [ cx, cy + 1 ], [ cx, cy - 1 ] );
	}
	return result;
}

export function usePixelEditor() {
	const [ size, setSize ]             = useState<CanvasSize>( 32 );
	const [ pixels, setPixels ]         = useState<Uint8Array>( () => makeBlankPixels( 32 ) );
	const [ tool, setTool ]             = useState<Tool>( 'pencil' );
	const [ primaryColor, setPrimary ]  = useState( '#000000' );
	const [ zoom, setZoom ]             = useState<ZoomLevel>( 8 );
	const [ showGrid, setShowGrid ]     = useState( true );
	const [ undoStack, setUndoStack ]   = useState<Uint8Array[]>( [] );
	const [ redoStack, setRedoStack ]   = useState<Uint8Array[]>( [] );
	const [ saveSlots, setSaveSlots ]   = useState<SaveSlot[]>( [] );
	const [ saveName, setSaveName ]     = useState( 'My Artwork' );

	const isDrawing  = useRef( false );
	const storeRef   = useRef<ReturnType<typeof createStore> | null>( null );
	// Ref tracking current pixels so callbacks that push to undo don't need
	// to close over pixels state, avoiding identity churn on every pixel change.
	const pixelsRef = useRef( pixels );

	useEffect( () => {
		try {
			const ctx   = getBazaarContext();
			const store = createStore( 'mosaic', ctx );
			storeRef.current = store;
			store.get<SaveSlot[]>( 'slots' ).then( slots => {
				if ( slots ) setSaveSlots( slots );
			} ).catch( () => {
				bzr.toast( 'Could not load saved slots — starting fresh', 'warning' );
			} );
		} catch {
			// Running outside Bazaar (dev mode without context)
		}
	}, [] );

	// Keep the ref in sync so stable callbacks can read the latest pixels
	// without closing over state (which would cause identity churn).
	useEffect( () => {
		pixelsRef.current = pixels;
	} );

	const commit = useCallback( ( next: Uint8Array ) => {
		setUndoStack( prev => [ ...prev.slice( -MAX_HISTORY ), pixelsRef.current ] );
		setRedoStack( [] );
		setPixels( next );
	}, [] );

	const undo = useCallback( () => {
		setUndoStack( prev => {
			if ( prev.length === 0 ) return prev;
			const undone = prev[ prev.length - 1 ]!;
			setRedoStack( r => [ pixelsRef.current, ...r ] );
			setPixels( undone );
			return prev.slice( 0, -1 );
		} );
	}, [] );

	const redo = useCallback( () => {
		setRedoStack( prev => {
			if ( prev.length === 0 ) return prev;
			const [ next, ...rest ] = prev;
			setUndoStack( u => [ ...u, pixelsRef.current ] );
			setPixels( next! );
			return rest;
		} );
	}, [] );

	const drawPixel = useCallback( ( x: number, y: number, erasing: boolean ) => {
		const next = new Uint8Array( pixelsRef.current );
		const idx  = ( y * size + x ) * 4;
		if ( erasing ) {
			next[ idx ] = 255; next[ idx + 1 ] = 255;
			next[ idx + 2 ] = 255; next[ idx + 3 ] = 0;
		} else {
			const [ r, g, b, a ] = hexToRgba( primaryColor );
			next[ idx ] = r; next[ idx + 1 ] = g;
			next[ idx + 2 ] = b; next[ idx + 3 ] = a;
		}
		setPixels( next );
		return next;
	}, [ size, primaryColor ] );

	const handlePointerDown = useCallback( (
		e: React.PointerEvent<HTMLCanvasElement>,
		canvasEl: HTMLCanvasElement,
	) => {
		isDrawing.current = true;
		canvasEl.setPointerCapture( e.pointerId );

		const rect = canvasEl.getBoundingClientRect();
		const px   = Math.floor( ( e.clientX - rect.left ) / zoom );
		const py   = Math.floor( ( e.clientY - rect.top ) / zoom );
		if ( px < 0 || px >= size || py < 0 || py >= size ) return;

		if ( tool === 'eyedropper' ) {
			const cur = pixelsRef.current;
			const idx = ( py * size + px ) * 4;
			if ( ( cur[ idx + 3 ] ?? 0 ) > 0 ) {
				setPrimary( rgbaToHex( cur[ idx ]!, cur[ idx + 1 ]!, cur[ idx + 2 ]! ) );
			}
			return;
		}

		if ( tool === 'fill' ) {
			const filled = floodFill( pixelsRef.current, px, py, hexToRgba( primaryColor ), size );
			commit( filled );
			return;
		}

		const next = drawPixel( px, py, tool === 'eraser' );
		// Store start-of-stroke state in undo at mousedown
		setUndoStack( prev => [ ...prev.slice( -MAX_HISTORY ), pixelsRef.current ] );
		setRedoStack( [] );
		setPixels( next );
	}, [ tool, zoom, size, primaryColor, commit, drawPixel ] );

	const handlePointerMove = useCallback( (
		e: React.PointerEvent<HTMLCanvasElement>,
		canvasEl: HTMLCanvasElement,
	) => {
		if ( ! isDrawing.current ) return;
		if ( tool !== 'pencil' && tool !== 'eraser' ) return;

		const rect = canvasEl.getBoundingClientRect();
		const px   = Math.floor( ( e.clientX - rect.left ) / zoom );
		const py   = Math.floor( ( e.clientY - rect.top ) / zoom );
		if ( px < 0 || px >= size || py < 0 || py >= size ) return;

		drawPixel( px, py, tool === 'eraser' );
	}, [ tool, zoom, size, drawPixel ] );

	const handlePointerUp = useCallback( () => {
		isDrawing.current = false;
	}, [] );

	const changeSize = useCallback( ( newSize: CanvasSize ) => {
		setSize( newSize );
		setPixels( makeBlankPixels( newSize ) );
		setUndoStack( [] );
		setRedoStack( [] );
	}, [] );

	const clearCanvas = useCallback( () => {
		commit( makeBlankPixels( size ) );
	}, [ commit, size ] );

	const exportPNG = useCallback( () => {
		const cur     = pixelsRef.current;
		const canvas  = document.createElement( 'canvas' );
		canvas.width  = size;
		canvas.height = size;
		const ctx2d   = canvas.getContext( '2d' )!;
		const imgData = ctx2d.createImageData( size, size );
		imgData.data.set( cur );
		ctx2d.putImageData( imgData, 0, 0 );
		const a    = document.createElement( 'a' );
		a.href     = canvas.toDataURL( 'image/png' );
		a.download = `${ saveName.replace( /\s+/g, '-' ).toLowerCase() }.png`;
		a.click();
	}, [ size, saveName ] );

	const saveSlot = useCallback( async ( name: string ) => {
		const slot: SaveSlot = {
			name,
			data:    Array.from( pixelsRef.current ),
			size,
			savedAt: new Date().toISOString(),
		};
		setSaveSlots( prev => {
			const updated = [ slot, ...prev.filter( s => s.name !== name ) ].slice( 0, 10 );
			if ( storeRef.current ) {
				storeRef.current.set( 'slots', updated ).catch( () => {
					bzr.toast( 'Saved locally — server unreachable', 'warning' );
				} );
			}
			return updated;
		} );
	}, [ size ] );

	const loadSlot = useCallback( ( slot: SaveSlot ) => {
		if ( slot.data.length !== slot.size * slot.size * 4 ) {
			console.warn( 'Slot data length mismatch, skipping load' );
			return;
		}
		const loaded = new Uint8Array( slot.data );
		setSize( slot.size );
		commit( loaded );
	}, [ commit ] );

	return useMemo( () => ( {
		size, pixels, tool, primaryColor, zoom, showGrid,
		undoStack, redoStack, saveSlots, saveName,
		setTool, setPrimaryColor: setPrimary, setZoom, setShowGrid, setSaveName,
		canUndo: undoStack.length > 0,
		canRedo: redoStack.length > 0,
		undo, redo, changeSize, clearCanvas, exportPNG, saveSlot, loadSlot,
		handlePointerDown, handlePointerMove, handlePointerUp,
	} ), [
		size, pixels, tool, primaryColor, zoom, showGrid,
		undoStack, redoStack, saveSlots, saveName,
		setTool, setPrimary, setZoom, setShowGrid, setSaveName,
		undo, redo, changeSize, clearCanvas, exportPNG, saveSlot, loadSlot,
		handlePointerDown, handlePointerMove, handlePointerUp,
	] );
}
