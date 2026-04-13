import { useState, useCallback, useEffect } from 'react';
import type { BoardState, Card, Column } from './types.ts';
import { loadBoard, saveBoard, uid }     from './store.ts';
import ColumnComponent                   from './components/Column.tsx';
import CardModal                         from './components/CardModal.tsx';
import './App.css';

function produce( state: BoardState, fn: ( draft: BoardState ) => void ): BoardState {
  const next = structuredClone( state );
  fn( next );
  return next;
}

export default function App() {
  const [ board, setBoard ]   = useState<BoardState>( loadBoard );
  const [ modal, setModal ]   = useState<{ card: Card | null; columnId: string } | null>( null );
  const [ dragCard, setDragCard ]   = useState<{ cardId: string; fromColId: string } | null>( null );
  const [ dragOverCol, setDragOverCol ] = useState<string | null>( null );
  const [ newColName, setNewColName ] = useState( '' );
  const [ addingCol, setAddingCol ]   = useState( false );

  function update( fn: ( draft: BoardState ) => void ) {
    setBoard( prev => {
      const next = produce( prev, fn );
      saveBoard( next );
      return next;
    } );
  }

  // ── Cards ──────────────────────────────────────────────────────────────────

  const handleAddCard = useCallback( ( columnId: string, title: string ) => {
    update( draft => {
      const col = draft.columns.find( c => c.id === columnId );
      col?.cards.push( { id: uid(), title, description: '', label: 'none', dueDate: '', createdAt: Date.now() } );
    } );
  }, [] );

  const openNewCard = useCallback( ( columnId: string ) => {
    setModal( { card: null, columnId } );
  }, [] );

  const openEditCard = useCallback( ( card: Card ) => {
    const col = board.columns.find( c => c.cards.some( k => k.id === card.id ) );
    if ( col ) setModal( { card, columnId: col.id } );
  }, [ board.columns ] );

  const handleSaveCard = useCallback( ( saved: Card ) => {
    if ( ! modal ) return;
    update( draft => {
      const col = draft.columns.find( c => c.id === modal.columnId );
      if ( ! col ) return;
      if ( saved.id ) {
        const idx = col.cards.findIndex( c => c.id === saved.id );
        if ( idx >= 0 ) col.cards[ idx ] = saved;
      } else {
        col.cards.push( { ...saved, id: uid() } );
      }
    } );
    setModal( null );
  }, [ modal ] );

  const handleDeleteCard = useCallback( ( cardId: string ) => {
    update( draft => {
      draft.columns.forEach( col => {
        col.cards = col.cards.filter( c => c.id !== cardId );
      } );
    } );
    setModal( null );
  }, [] );

  // ── Columns ────────────────────────────────────────────────────────────────

  const handleRenameColumn = useCallback( ( colId: string, title: string ) => {
    update( draft => {
      const col = draft.columns.find( c => c.id === colId );
      if ( col ) col.title = title;
    } );
  }, [] );

  const handleDeleteColumn = useCallback( ( colId: string ) => {
    if ( ! confirm( 'Delete this column and all its cards?' ) ) return;
    update( draft => { draft.columns = draft.columns.filter( c => c.id !== colId ); } );
  }, [] );

  const handleClearDone = useCallback( ( colId: string ) => {
    if ( ! confirm( 'Clear all cards in this column? This cannot be undone.' ) ) return;
    update( draft => {
      const col = draft.columns.find( c => c.id === colId );
      if ( col ) col.cards = [];
    } );
  }, [] );

  function handleAddColumn( e: React.FormEvent ) {
    e.preventDefault();
    if ( ! newColName.trim() ) return;
    update( draft => {
      draft.columns.push( { id: uid(), title: newColName.trim(), cards: [] } );
    } );
    setNewColName( '' );
    setAddingCol( false );
  }

  // ── Drag & drop ────────────────────────────────────────────────────────────

  useEffect( () => {
    function handleDragEnd() {
      setDragCard( null );
      setDragOverCol( null );
    }
    window.addEventListener( 'dragend', handleDragEnd );
    return () => window.removeEventListener( 'dragend', handleDragEnd );
  }, [] );

  function onDragStart( cardId: string, fromColId: string ) {
    setDragCard( { cardId, fromColId } );
  }

  function onDragOver( e: React.DragEvent, colId: string ) {
    e.preventDefault();
    setDragOverCol( colId );
  }

  function onDrop( e: React.DragEvent, toColId: string ) {
    e.preventDefault();
    setDragOverCol( null );
    if ( ! dragCard ) return;
    const { cardId, fromColId } = dragCard;
    setDragCard( null );
    if ( fromColId === toColId ) return;
    update( draft => {
      const from = draft.columns.find( c => c.id === fromColId );
      const to   = draft.columns.find( c => c.id === toColId );
      if ( ! from || ! to ) return;
      const idx  = from.cards.findIndex( c => c.id === cardId );
      if ( idx < 0 ) return;
      const [ card ] = from.cards.splice( idx, 1 );
      to.cards.push( card );
    } );
  }

  // ── Determine "done" column by reserved id ─────────────────────────────────
  const doneColId = board.columns.find( c => c.id === 'done' )?.id ?? '';

  const handleColumnAddCard = useCallback( ( colId: string, title: string ) => {
    if ( title ) {
      handleAddCard( colId, title );
    } else {
      openNewCard( colId );
    }
  }, [ handleAddCard, openNewCard ] );

  return (
    <div className="board">
      <header className="board__header">
        <h1 className="board__title">Board</h1>
        <span className="board__total">
          { board.columns.reduce( ( s, c ) => s + c.cards.length, 0 ) } cards
        </span>
      </header>

      <div className="board__board">
        { board.columns.map( col => (
          <ColumnComponent
            key={ col.id }
            column={ col as Column }
            onAddCard={ handleColumnAddCard }
            onEditCard={ openEditCard }
            onRename={ handleRenameColumn }
            onDelete={ handleDeleteColumn }
            onClearDone={ handleClearDone }
            isDone={ col.id === doneColId }
            dragCardId={ dragCard?.cardId ?? null }
            dragOverCol={ dragOverCol }
            onDragStart={ onDragStart }
            onDragOver={ onDragOver }
            onDrop={ onDrop }
          />
        ) ) }

        { /* Add column */ }
        <div className="board__add-col">
          { addingCol ? (
            <form onSubmit={ handleAddColumn } className="board__add-col-form">
              <input
                className="board__add-col-input"
                value={ newColName }
                onChange={ e => setNewColName( e.target.value ) }
                placeholder="Column name…"
                autoFocus
                onBlur={ () => { if ( ! newColName.trim() ) setAddingCol( false ); } }
              />
              <div className="board__add-col-actions">
                <button type="submit" className="board__add-col-btn--primary"
                  disabled={ ! newColName.trim() }>Add</button>
                <button type="button" onClick={ () => { setAddingCol( false ); setNewColName( '' ); } }>
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <button className="board__add-col-ghost" onClick={ () => setAddingCol( true ) }>
              + Add column
            </button>
          ) }
        </div>
      </div>

      { modal !== null && (
        <CardModal
          card={ modal.card }
          onSave={ handleSaveCard }
          onDelete={ handleDeleteCard }
          onClose={ () => setModal( null ) }
        />
      ) }
    </div>
  );
}
