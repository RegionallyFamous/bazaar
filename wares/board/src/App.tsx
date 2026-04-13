import { useState, useCallback, useEffect, useRef } from 'react';
import { __, _n, sprintf }               from '@wordpress/i18n';
import type { BoardState, Card, Column } from './types.ts';
import { loadBoard, saveBoard, uid }     from './store.ts';
import ColumnComponent                   from './components/Column.tsx';
import CardModal                         from './components/CardModal.tsx';
import ConfirmDialog                     from './components/ConfirmDialog.tsx';
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
  const [ confirmState, setConfirmState ] = useState<{ message: string; onConfirm: () => void } | null>( null );
  const [ dragOverCol, setDragOverCol ] = useState<string | null>( null );
  const [ newColName, setNewColName ] = useState( '' );
  const [ addingCol, setAddingCol ]   = useState( false );
  const [ liftedCard, setLiftedCard ] = useState<{ cardId: string; colId: string } | null>( null );
  const [ liveMessage, setLiveMessage ] = useState( '' );
  const liveRef = useRef<HTMLDivElement>( null );

  function update( fn: ( draft: BoardState ) => void ) {
    setBoard( prev => {
      const next = produce( prev, fn );
      saveBoard( next );
      return next;
    } );
  }

  function announce( msg: string ) {
    setLiveMessage( '' );
    requestAnimationFrame( () => setLiveMessage( msg ) );
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

  function requestConfirm( message: string, onConfirm: () => void ) {
    setConfirmState( { message, onConfirm } );
  }

  const handleDeleteColumn = useCallback( ( colId: string ) => {
    requestConfirm( __( 'Delete this column and all its cards?', 'bazaar' ), () => {
      update( draft => { draft.columns = draft.columns.filter( c => c.id !== colId ); } );
    } );
  }, [] );

  const handleClearDone = useCallback( ( colId: string ) => {
    requestConfirm( __( 'Clear all cards in this column? This cannot be undone.', 'bazaar' ), () => {
      update( draft => {
        const col = draft.columns.find( c => c.id === colId );
        if ( col ) col.cards = [];
      } );
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

  // ── Mouse/touch drag & drop ────────────────────────────────────────────────

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
      to.cards.push( card! );
    } );
  }

  // ── Keyboard drag & drop ───────────────────────────────────────────────────

  const handleCardKeyDnd = useCallback( ( e: React.KeyboardEvent, cardId: string, colId: string ) => {
    const isLifted = liftedCard?.cardId === cardId;

    if ( ! isLifted ) {
      // Space/Enter lifts the card.
      if ( e.key === ' ' || e.key === 'Enter' ) {
        e.preventDefault();
        setLiftedCard( { cardId, colId } );
        announce( 'Card lifted. Use arrow keys to move, Space to drop, Escape to cancel.' );
      }
      return;
    }

    // Card is currently lifted — handle movement keys.
    e.preventDefault();

    if ( e.key === 'Escape' ) {
      setLiftedCard( null );
      announce( 'Cancelled.' );
      return;
    }

    if ( e.key === ' ' || e.key === 'Enter' ) {
      setLiftedCard( null );
      announce( 'Card dropped.' );
      return;
    }

    setBoard( prev => {
      const next = produce( prev, draft => {
        const colIdx = draft.columns.findIndex( c => c.id === colId );
        const col    = draft.columns[ colIdx ];
        if ( ! col ) return;
        const cardIdx = col.cards.findIndex( c => c.id === cardId );
        if ( cardIdx < 0 ) return;

        if ( e.key === 'ArrowUp' && cardIdx > 0 ) {
          const [ card ] = col.cards.splice( cardIdx, 1 );
          col.cards.splice( cardIdx - 1, 0, card! );
          announce( `Moved up. Position ${ cardIdx } of ${ col.cards.length }.` );
        } else if ( e.key === 'ArrowDown' && cardIdx < col.cards.length - 1 ) {
          const [ card ] = col.cards.splice( cardIdx, 1 );
          col.cards.splice( cardIdx + 1, 0, card! );
          announce( `Moved down. Position ${ cardIdx + 2 } of ${ col.cards.length }.` );
        } else if ( e.key === 'ArrowLeft' && colIdx > 0 ) {
          const targetCol = draft.columns[ colIdx - 1 ]!;
          const [ card ] = col.cards.splice( cardIdx, 1 );
          targetCol.cards.push( card! );
          setLiftedCard( { cardId, colId: targetCol.id } );
          announce( `Moved to column ${ targetCol.title }. Position ${ targetCol.cards.length } of ${ targetCol.cards.length }.` );
        } else if ( e.key === 'ArrowRight' && colIdx < draft.columns.length - 1 ) {
          const targetCol = draft.columns[ colIdx + 1 ]!;
          const [ card ] = col.cards.splice( cardIdx, 1 );
          targetCol.cards.push( card! );
          setLiftedCard( { cardId, colId: targetCol.id } );
          announce( `Moved to column ${ targetCol.title }. Position ${ targetCol.cards.length } of ${ targetCol.cards.length }.` );
        }
      } );
      saveBoard( next );
      return next;
    } );
  }, [ liftedCard ] );

  // Cancel lifted card on click outside.
  useEffect( () => {
    if ( ! liftedCard ) return;
    function onPointerDown( e: PointerEvent ) {
      if ( ! ( e.target as HTMLElement ).closest( '.card' ) ) {
        setLiftedCard( null );
      }
    }
    window.addEventListener( 'pointerdown', onPointerDown );
    return () => window.removeEventListener( 'pointerdown', onPointerDown );
  }, [ liftedCard ] );

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
      { /* ARIA live region for DnD announcements */ }
      <div
        ref={ liveRef }
        className="board__live-region"
        role="status"
        aria-live="assertive"
        aria-atomic="true"
      >
        { liveMessage }
      </div>

      <header className="board__header">
        <h1 className="board__title">{ __( 'Board', 'bazaar' ) }</h1>
        <span className="board__total">
          { sprintf(
            /* translators: %d: number of cards */
            _n( '%d card', '%d cards', board.columns.reduce( ( s, c ) => s + c.cards.length, 0 ), 'bazaar' ),
            board.columns.reduce( ( s, c ) => s + c.cards.length, 0 )
          ) }
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
            liftedCard={ liftedCard }
            onCardKeyDnd={ handleCardKeyDnd }
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
                placeholder={ __( 'Column name…', 'bazaar' ) }
                autoFocus
                onBlur={ () => { if ( ! newColName.trim() ) setAddingCol( false ); } }
              />
              <div className="board__add-col-actions">
                <button type="submit" className="board__add-col-btn--primary"
                  disabled={ ! newColName.trim() }>{ __( 'Add', 'bazaar' ) }</button>
                <button type="button" onClick={ () => { setAddingCol( false ); setNewColName( '' ); } }>
                  { __( 'Cancel', 'bazaar' ) }
                </button>
              </div>
            </form>
          ) : (
            <button className="board__add-col-ghost" onClick={ () => setAddingCol( true ) }>
              { __( '+ Add column', 'bazaar' ) }
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

      <ConfirmDialog
        open={ confirmState !== null }
        message={ confirmState?.message ?? '' }
        onConfirm={ () => { confirmState?.onConfirm(); setConfirmState( null ); } }
        onCancel={ () => setConfirmState( null ) }
      />
    </div>
  );
}
