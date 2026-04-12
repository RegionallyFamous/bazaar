import { useState, useEffect, useRef } from 'react';
import type { Card, CardLabel }        from '../types.ts';
import { LABEL_COLORS }                from '../types.ts';

interface Props {
  card:     Card | null; // null = new card
  onSave:   ( card: Card ) => void;
  onDelete: ( id: string ) => void;
  onClose:  () => void;
}

const LABELS: CardLabel[] = [ 'none', 'red', 'orange', 'yellow', 'green', 'blue', 'purple' ];

export default function CardModal( { card, onSave, onDelete, onClose }: Props ) {
  const isNew = card === null;
  const [ title, setTitle ]       = useState( card?.title ?? '' );
  const [ desc, setDesc ]         = useState( card?.description ?? '' );
  const [ label, setLabel ]       = useState<CardLabel>( card?.label ?? 'none' );
  const [ dueDate, setDueDate ]   = useState( card?.dueDate ?? '' );
  const titleRef = useRef<HTMLInputElement>( null );

  useEffect( () => {
    titleRef.current?.focus();
  }, [] );

  // Close on Escape
  useEffect( () => {
    const handler = ( e: KeyboardEvent ) => {
      if ( e.key === 'Escape' ) onClose();
    };
    window.addEventListener( 'keydown', handler );
    return () => window.removeEventListener( 'keydown', handler );
  }, [ onClose ] );

  function handleSubmit( e: React.FormEvent ) {
    e.preventDefault();
    if ( ! title.trim() ) return;
    onSave( {
      id:          card?.id ?? '',
      title:       title.trim(),
      description: desc.trim(),
      label,
      dueDate,
      createdAt:   card?.createdAt ?? Date.now(),
    } );
  }

  return (
    <div className="modal-backdrop" onClick={ onClose }>
      <div className="modal" onClick={ e => e.stopPropagation() } role="dialog" aria-modal="true">
        <div className="modal__header">
          <h2 className="modal__title">{ isNew ? 'New Card' : 'Edit Card' }</h2>
          <button className="modal__close" onClick={ onClose } aria-label="Close">✕</button>
        </div>

        <form onSubmit={ handleSubmit } className="modal__form">
          <label className="modal__label">
            Title
            <input
              ref={ titleRef }
              className="modal__input"
              value={ title }
              onChange={ e => setTitle( e.target.value ) }
              placeholder="Card title…"
              required
            />
          </label>

          <label className="modal__label">
            Description
            <textarea
              className="modal__textarea"
              value={ desc }
              onChange={ e => setDesc( e.target.value ) }
              placeholder="Optional notes…"
              rows={ 3 }
            />
          </label>

          <label className="modal__label">
            Due Date
            <input
              type="date"
              className="modal__input"
              value={ dueDate }
              onChange={ e => setDueDate( e.target.value ) }
            />
          </label>

          <div className="modal__label">
            Label
            <div className="modal__labels">
              { LABELS.map( l => (
                <button
                  key={ l }
                  type="button"
                  className={ `modal__label-dot${ label === l ? ' modal__label-dot--active' : '' }` }
                  style={ { background: l === 'none' ? '#e5e7eb' : LABEL_COLORS[ l ] } }
                  onClick={ () => setLabel( l ) }
                  aria-label={ l }
                  title={ l }
                />
              ) ) }
            </div>
          </div>

          <div className="modal__actions">
            { ! isNew && (
              <button
                type="button"
                className="modal__btn modal__btn--danger"
                onClick={ () => { onDelete( card!.id ); } }
              >
                Delete
              </button>
            ) }
            <button type="button" className="modal__btn modal__btn--secondary" onClick={ onClose }>
              Cancel
            </button>
            <button type="submit" className="modal__btn modal__btn--primary" disabled={ ! title.trim() }>
              { isNew ? 'Add Card' : 'Save' }
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
