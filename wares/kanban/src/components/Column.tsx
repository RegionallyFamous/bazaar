import { useState, useRef } from 'react';
import type { Column as ColumnType, Card as CardType } from '../types.ts';
import CardComponent from './Card.tsx';

interface Props {
  column:      ColumnType;
  onAddCard:   ( columnId: string, title: string ) => void;
  onEditCard:  ( card: CardType ) => void;
  onRename:    ( columnId: string, title: string ) => void;
  onDelete:    ( columnId: string ) => void;
  onClearDone: ( columnId: string ) => void;
  isDone:      boolean;
  // drag
  dragCardId:   string | null;
  dragOverCol:  string | null;
  onDragStart:  ( cardId: string, fromColId: string ) => void;
  onDragOver:   ( e: React.DragEvent, colId: string ) => void;
  onDrop:       ( e: React.DragEvent, colId: string ) => void;
}

export default function Column( {
  column, onAddCard, onEditCard, onRename, onDelete, onClearDone, isDone,
  dragCardId, dragOverCol, onDragStart, onDragOver, onDrop,
}: Props ) {
  const [ adding, setAdding ]   = useState( false );
  const [ newTitle, setNewTitle ] = useState( '' );
  const [ renaming, setRenaming ] = useState( false );
  const [ colTitle, setColTitle ] = useState( column.title );
  const inputRef = useRef<HTMLInputElement>( null );

  function submitAdd( e: React.FormEvent ) {
    e.preventDefault();
    if ( newTitle.trim() ) {
      onAddCard( column.id, newTitle.trim() );
      setNewTitle( '' );
      setAdding( false );
    }
  }

  function submitRename( e: React.FormEvent ) {
    e.preventDefault();
    if ( colTitle.trim() ) {
      onRename( column.id, colTitle.trim() );
    }
    setRenaming( false );
  }

  return (
    <div
      className={ `column${ dragOverCol === column.id ? ' column--drag-over' : '' }` }
      onDragOver={ e => onDragOver( e, column.id ) }
      onDrop={ e => onDrop( e, column.id ) }
    >
      <div className="column__header">
        { renaming ? (
          <form onSubmit={ submitRename } className="column__rename-form">
            <input
              className="column__rename-input"
              value={ colTitle }
              onChange={ e => setColTitle( e.target.value ) }
              onBlur={ submitRename }
              autoFocus
            />
          </form>
        ) : (
          <button
            className="column__title"
            onClick={ () => { setColTitle( column.title ); setRenaming( true ); } }
            title="Click to rename"
          >
            { column.title }
          </button>
        ) }

        <span className="column__count">{ column.cards.length }</span>

        <div className="column__menu">
          { isDone && column.cards.length > 0 && (
            <button
              className="column__menu-btn"
              onClick={ () => onClearDone( column.id ) }
              title="Clear all done cards"
            >
              🗑
            </button>
          ) }
          <button
            className="column__menu-btn column__menu-btn--danger"
            onClick={ () => onDelete( column.id ) }
            title="Delete column"
          >
            ✕
          </button>
        </div>
      </div>

      <div className="column__cards" ref={ inputRef as React.RefObject<HTMLDivElement> }>
        { column.cards.map( card => (
          <div
            key={ card.id }
            draggable
            onDragStart={ () => onDragStart( card.id, column.id ) }
          >
            <CardComponent
              card={ card }
              onEdit={ onEditCard }
              isDragging={ dragCardId === card.id }
            />
          </div>
        ) ) }
      </div>

      { adding ? (
        <form onSubmit={ submitAdd } className="column__add-form">
          <input
            className="column__add-input"
            value={ newTitle }
            onChange={ e => setNewTitle( e.target.value ) }
            placeholder="Card title…"
            autoFocus
            onBlur={ () => { if ( ! newTitle.trim() ) setAdding( false ); } }
          />
          <div className="column__add-actions">
            <button type="submit" className="column__add-btn column__add-btn--primary"
              disabled={ ! newTitle.trim() }>
              Add
            </button>
            <button type="button" className="column__add-btn"
              onClick={ () => { setAdding( false ); setNewTitle( '' ); } }>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button className="column__new-btn" onClick={ () => setAdding( true ) }>
          + Add card
        </button>
      ) }
    </div>
  );
}
