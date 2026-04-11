import { useEffect, useCallback, useState } from 'react';
import { usePixelEditor }                    from './hooks/usePixelEditor.ts';
import Canvas                                from './components/Canvas.tsx';
import Toolbar                               from './components/Toolbar.tsx';
import Palette                               from './components/Palette.tsx';
import type { CanvasSize, ZoomLevel }        from './types.ts';
import './App.css';

const CANVAS_SIZES: CanvasSize[] = [ 8, 16, 32, 64 ];
const ZOOM_LEVELS: ZoomLevel[]   = [ 1, 2, 4, 8, 16 ];

export default function App() {
	const editor = usePixelEditor();
	const [ hoveredColor, setHoveredColor ] = useState<string | null>( null );

	// Keyboard shortcuts
	useEffect( () => {
		function onKey( e: KeyboardEvent ) {
			if ( e.target instanceof HTMLInputElement ) return;
			if ( ( e.ctrlKey || e.metaKey ) && e.key === 'z' ) {
				e.preventDefault();
				editor.undo();
			} else if ( ( e.ctrlKey || e.metaKey ) && ( e.key === 'y' || ( e.shiftKey && e.key === 'z' ) ) ) {
				e.preventDefault();
				editor.redo();
			} else if ( e.key === 'p' || e.key === 'P' ) {
				editor.setTool( 'pencil' );
			} else if ( e.key === 'e' || e.key === 'E' ) {
				editor.setTool( 'eraser' );
			} else if ( e.key === 'f' || e.key === 'F' ) {
				editor.setTool( 'fill' );
			} else if ( e.key === 'i' || e.key === 'I' ) {
				editor.setTool( 'eyedropper' );
			} else if ( e.key === 'g' || e.key === 'G' ) {
				editor.setShowGrid( v => ! v );
			}
		}
		window.addEventListener( 'keydown', onKey );
		return () => window.removeEventListener( 'keydown', onKey );
	}, [ editor ] );

	const handleLoad = useCallback( ( i: number ) => {
		editor.loadSlot( editor.saveSlots[ i ] );
	}, [ editor ] );

	const handleSave = useCallback( () => {
		editor.saveSlot( editor.saveName );
	}, [ editor ] );

	return (
		<div className="editor">
			{ /* ── Top bar ── */ }
			<header className="editor__header">
				<div className="editor__header-left">
					<span className="editor__title">Pixel Art</span>
					<span className="editor__meta">
						{ editor.size }×{ editor.size }
						{ hoveredColor && (
							<>
								<span
									className="editor__hover-swatch"
									style={ { background: hoveredColor } }
								/>
								{ hoveredColor }
							</>
						) }
					</span>
				</div>
				<div className="editor__controls">
					<label className="editor__control-group">
						Size
						<select
							className="editor__select"
							value={ editor.size }
							onChange={ e => editor.changeSize( Number( e.target.value ) as CanvasSize ) }
						>
							{ CANVAS_SIZES.map( s => (
								<option key={ s } value={ s }>{ s }×{ s }</option>
							) ) }
						</select>
					</label>
					<label className="editor__control-group">
						Zoom
						<select
							className="editor__select"
							value={ editor.zoom }
							onChange={ e => editor.setZoom( Number( e.target.value ) as ZoomLevel ) }
						>
							{ ZOOM_LEVELS.map( z => (
								<option key={ z } value={ z }>{ z }×</option>
							) ) }
						</select>
					</label>
					<label className="editor__control-group editor__control-group--inline">
						<input
							type="checkbox"
							checked={ editor.showGrid }
							onChange={ e => editor.setShowGrid( e.target.checked ) }
						/>
						Grid
					</label>
				</div>
			</header>

			{ /* ── Main workspace ── */ }
			<div className="editor__workspace">
				<Toolbar
					tool={ editor.tool }
					onTool={ editor.setTool }
					canUndo={ editor.canUndo }
					canRedo={ editor.canRedo }
					onUndo={ editor.undo }
					onRedo={ editor.redo }
					onClear={ editor.clearCanvas }
				/>

				<main className="editor__canvas-area">
					<div className="editor__canvas-wrap">
						<Canvas
							pixels={ editor.pixels }
							size={ editor.size }
							zoom={ editor.zoom }
							showGrid={ editor.showGrid }
							onPointerDown={ editor.handlePointerDown }
							onPointerMove={ editor.handlePointerMove }
							onPointerUp={ editor.handlePointerUp }
							onHover={ setHoveredColor }
						/>
					</div>
				</main>

				<Palette
					primaryColor={ editor.primaryColor }
					onColorChange={ editor.setPrimaryColor }
					saveSlots={ editor.saveSlots }
					saveName={ editor.saveName }
					onSaveNameChange={ editor.setSaveName }
					onSave={ handleSave }
					onLoad={ handleLoad }
					onExport={ editor.exportPNG }
				/>
			</div>
		</div>
	);
}
