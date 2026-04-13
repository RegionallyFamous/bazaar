import { useState, useCallback } from 'react';
import type { Palette, Swatch }  from './types.ts';
import { loadPalettes, savePalettes, uid } from './store.ts';
import { Modal }           from '@bazaar/design';
import SwatchEditor        from './components/SwatchEditor.tsx';
import HarmonyPanel        from './components/HarmonyPanel.tsx';
import ContrastChecker     from './components/ContrastChecker.tsx';
import ExportPanel         from './components/ExportPanel.tsx';
import './App.css';

type Panel = 'harmony' | 'contrast' | 'export';

export default function App() {
  const [ palettes, setPalettes ]   = useState<Palette[]>( loadPalettes );
  const [ activeId, setActiveId ]   = useState<string>( () => loadPalettes()[ 0 ]?.id ?? '' );
  const [ editSwatch, setEditSwatch ] = useState<Swatch | null>( null );
  const [ panel, setPanel ]         = useState<Panel>( 'harmony' );
  const [ renamingPal, setRenamingPal ] = useState<string | null>( null );
  const [ renameVal, setRenameVal ]   = useState( '' );

  function update( fn: ( draft: Palette[] ) => void ) {
    setPalettes( prev => {
      const next = structuredClone( prev );
      fn( next );
      savePalettes( next );
      return next;
    } );
  }

  const active = palettes.find( p => p.id === activeId ) ?? palettes[ 0 ];

  // ── Palettes ────────────────────────────────────────────────────────────────

  function addPalette() {
    const p: Palette = { id: uid(), name: 'New Palette', swatches: [] };
    update( d => d.push( p ) );
    setActiveId( p.id );
  }

  function deletePalette( id: string ) {
    if ( palettes.length <= 1 ) return;
    const name = palettes.find( p => p.id === id )?.name ?? 'this palette';
    if ( ! window.confirm( `Delete "${ name }"?` ) ) return;
    update( d => {
      const idx = d.findIndex( p => p.id === id );
      if ( idx >= 0 ) d.splice( idx, 1 );
    } );
    if ( id === activeId ) setActiveId( palettes.find( p => p.id !== id )?.id ?? '' );
  }

  function renamePalette( id: string, name: string ) {
    update( d => {
      const p = d.find( x => x.id === id );
      if ( p ) p.name = name;
    } );
    setRenamingPal( null );
  }

  // ── Swatches ────────────────────────────────────────────────────────────────

  const addSwatch = useCallback( ( hex = '#6b7280' ) => {
    update( d => {
      const p = d.find( x => x.id === activeId );
      if ( p && p.swatches.length < 12 ) {
        p.swatches.push( { id: uid(), hex, name: '' } );
      }
    } );
  }, [ activeId ] );

  const updateSwatch = useCallback( ( updated: Swatch ) => {
    update( d => {
      const p = d.find( x => x.id === activeId );
      if ( ! p ) return;
      const idx = p.swatches.findIndex( s => s.id === updated.id );
      if ( idx >= 0 ) p.swatches[ idx ] = updated;
    } );
    setEditSwatch( null );
  }, [ activeId ] );

  const deleteSwatch = useCallback( ( id: string ) => {
    update( d => {
      const p = d.find( x => x.id === activeId );
      if ( p ) p.swatches = p.swatches.filter( s => s.id !== id );
    } );
  }, [ activeId ] );

  if ( ! active ) return null;

  return (
    <div className="swatch">
      { /* ── Sidebar ──────────────────────────────────────────────────────── */ }
      <aside className="swatch__sidebar">
        <div className="swatch__sidebar-header">
          <h1 className="swatch__app-title">Swatch</h1>
          <button className="swatch__sidebar-add" onClick={ addPalette } title="New palette">+</button>
        </div>

        <ul className="swatch__palette-list">
          { palettes.map( p => (
            <li
              key={ p.id }
              className={ `swatch__palette-item${ p.id === activeId ? ' swatch__palette-item--active' : '' }` }
            >
              { renamingPal === p.id ? (
                <form onSubmit={ e => { e.preventDefault(); renamePalette( p.id, renameVal ); } }
                  className="swatch__rename-form">
                  <input
                    className="swatch__rename-input"
                    value={ renameVal }
                    onChange={ e => setRenameVal( e.target.value ) }
                    onBlur={ () => renamePalette( p.id, renameVal || p.name ) }
                    autoFocus
                  />
                </form>
              ) : (
                <button
                  className="swatch__palette-btn"
                  onClick={ () => setActiveId( p.id ) }
                  onDoubleClick={ () => { setRenamingPal( p.id ); setRenameVal( p.name ); } }
                >
                  <span className="swatch__palette-preview">
                    { p.swatches.slice( 0, 4 ).map( s => (
                      <span key={ s.id } className="swatch__palette-dot" style={ { background: s.hex } } />
                    ) ) }
                  </span>
                  <span className="swatch__palette-name">{ p.name }</span>
                  <span className="swatch__palette-count">{ p.swatches.length }</span>
                </button>
              ) }

              { p.id === activeId && palettes.length > 1 && (
                <button
                  className="swatch__palette-delete"
                  onClick={ () => deletePalette( p.id ) }
                  title="Delete palette"
                >
                  ✕
                </button>
              ) }
            </li>
          ) ) }
        </ul>
      </aside>

      { /* ── Main ──────────────────────────────────────────────────────────── */ }
      <main className="swatch__main">
        <div className="swatch__palette-header">
          <h2 className="swatch__palette-title">{ active.name }</h2>
          <span className="swatch__palette-meta">{ active.swatches.length } / 12 swatches</span>
        </div>

        { /* Swatch grid */ }
        <div className="swatch__swatches">
          { active.swatches.map( s => (
            <div key={ s.id } className="swatch__swatch-tile">
              <button
                className="swatch__swatch-color"
                style={ { background: s.hex } }
                onClick={ () => setEditSwatch( s ) }
                title={ `Edit ${ s.hex }` }
              />
              <span className="swatch__swatch-hex">{ s.hex }</span>
              { s.name && <span className="swatch__swatch-name">{ s.name }</span> }
              <button
                className="swatch__swatch-remove"
                onClick={ () => deleteSwatch( s.id ) }
                title="Remove swatch"
              >
                ✕
              </button>
            </div>
          ) ) }

          { active.swatches.length < 12 && (
            <button className="swatch__swatch-add" onClick={ () => addSwatch() } title="Add swatch">
              +
            </button>
          ) }
        </div>

        { /* Panel tabs */ }
        <div className="swatch__panel-tabs">
          { ( [ 'harmony', 'contrast', 'export' ] as Panel[] ).map( t => (
            <button
              key={ t }
              className={ `swatch__panel-tab${ panel === t ? ' swatch__panel-tab--active' : '' }` }
              onClick={ () => setPanel( t ) }
            >
              { t === 'harmony' ? 'Harmony' : t === 'contrast' ? 'Contrast' : 'Export' }
            </button>
          ) ) }
        </div>

        <div className="swatch__panel">
          { panel === 'harmony' && (
            <HarmonyPanel swatches={ active.swatches } onAddSwatch={ addSwatch } />
          ) }
          { panel === 'contrast' && active.swatches.length >= 2 && (
            <ContrastChecker swatches={ active.swatches } />
          ) }
          { panel === 'contrast' && active.swatches.length < 2 && (
            <p className="swatch__panel-hint">Add at least 2 swatches to check contrast.</p>
          ) }
          { panel === 'export' && <ExportPanel palette={ active } /> }
        </div>
      </main>

      { /* ── Swatch editor modal ──────────────────────────────────────────── */ }
      <Modal
        open={ !! editSwatch }
        onClose={ () => setEditSwatch( null ) }
        title="Edit Swatch"
        size="sm"
      >
        { editSwatch && (
          <SwatchEditor
            swatch={ editSwatch }
            onChange={ updateSwatch }
            onClose={ () => setEditSwatch( null ) }
          />
        ) }
      </Modal>
    </div>
  );
}
