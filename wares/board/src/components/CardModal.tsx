import { useState, useEffect, useRef } from 'react';
import { __ }                           from '@wordpress/i18n';
import { Modal }                        from '@bazaar/design';
import type { Card, CardLabel }         from '../types.ts';
import { LABEL_COLORS }                 from '../types.ts';

interface Props {
  card:     Card | null; // null = new card
  onSave:   ( card: Card ) => void;
  onDelete: ( id: string ) => void;
  onClose:  () => void;
}

const LABELS: CardLabel[] = [ 'none', 'red', 'orange', 'yellow', 'green', 'blue', 'purple' ];

function getLabelNames(): Record<CardLabel, string> {
  return {
    none:   __( 'No label',     'bazaar' ),
    red:    __( 'Red label',    'bazaar' ),
    orange: __( 'Orange label', 'bazaar' ),
    yellow: __( 'Yellow label', 'bazaar' ),
    green:  __( 'Green label',  'bazaar' ),
    blue:   __( 'Blue label',   'bazaar' ),
    purple: __( 'Purple label', 'bazaar' ),
  };
}

export default function CardModal( { card, onSave, onDelete, onClose }: Props ) {
  const isNew = card === null;
  const [ title, setTitle ]     = useState( card?.title ?? '' );
  const [ desc, setDesc ]       = useState( card?.description ?? '' );
  const [ label, setLabel ]     = useState<CardLabel>( card?.label ?? 'none' );
  const [ dueDate, setDueDate ] = useState( card?.dueDate ?? '' );
  const titleRef = useRef<HTMLInputElement>( null );

  useEffect( () => {
    titleRef.current?.focus();
  }, [] );

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

  const labelNames = getLabelNames();

  return (
    <Modal
      open={ true }
      onClose={ onClose }
      title={ isNew ? __( 'New Card', 'bazaar' ) : __( 'Edit Card', 'bazaar' ) }
    >
      <form onSubmit={ handleSubmit } className="modal__form">
        <label className="modal__label">
          { __( 'Title', 'bazaar' ) }
          <input
            ref={ titleRef }
            className="modal__input"
            value={ title }
            onChange={ e => setTitle( e.target.value ) }
            placeholder={ __( 'Card title…', 'bazaar' ) }
            required
          />
        </label>

        <label className="modal__label">
          { __( 'Description', 'bazaar' ) }
          <textarea
            className="modal__textarea"
            value={ desc }
            onChange={ e => setDesc( e.target.value ) }
            placeholder={ __( 'Optional notes…', 'bazaar' ) }
            rows={ 3 }
          />
        </label>

        <label className="modal__label">
          { __( 'Due Date', 'bazaar' ) }
          <input
            type="date"
            className="modal__input"
            value={ dueDate }
            onChange={ e => setDueDate( e.target.value ) }
          />
        </label>

        <div className="modal__label">
          { __( 'Label', 'bazaar' ) }
          <div className="modal__labels">
            { LABELS.map( l => (
              <button
                key={ l }
                type="button"
                className={ `modal__label-dot${ label === l ? ' modal__label-dot--active' : '' }` }
                style={ { background: l === 'none' ? '#e5e7eb' : LABEL_COLORS[ l ] } }
                onClick={ () => setLabel( l ) }
                aria-label={ labelNames[ l ] }
                title={ labelNames[ l ] }
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
              { __( 'Delete', 'bazaar' ) }
            </button>
          ) }
          <button type="button" className="modal__btn" onClick={ onClose }>
            { __( 'Cancel', 'bazaar' ) }
          </button>
          <button type="submit" className="modal__btn modal__btn--primary" disabled={ ! title.trim() }>
            { isNew ? __( 'Add Card', 'bazaar' ) : __( 'Save', 'bazaar' ) }
          </button>
        </div>
      </form>
    </Modal>
  );
}
