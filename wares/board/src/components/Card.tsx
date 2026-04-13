import type { Card as CardType } from '../types.ts';
import { LABEL_COLORS }          from '../types.ts';

interface Props {
  card:       CardType;
  onEdit:     ( card: CardType ) => void;
  isDragging: boolean;
  isLifted:   boolean;
  onKeyDnd:   ( e: React.KeyboardEvent ) => void;
}

export default function Card( { card, onEdit, isDragging, isLifted, onKeyDnd }: Props ) {
  // Parse as local midnight so the overdue check is consistent with the display date.
  const overdue = card.dueDate && new Date( card.dueDate + 'T00:00:00' ) < new Date();
  const hasLabel = card.label !== 'none';

  const formatted = card.dueDate
    ? new Date( card.dueDate + 'T00:00:00' ).toLocaleDateString( undefined, {
        month: 'short', day: 'numeric',
      } )
    : null;

  function handleKeyDown( e: React.KeyboardEvent ) {
    if ( isLifted ) {
      // All navigation keys when lifted go to the DnD handler.
      onKeyDnd( e );
      return;
    }
    // Space/Enter opens the edit modal when not lifted.
    if ( e.key === 'Enter' ) {
      e.preventDefault();
      onEdit( card );
      return;
    }
    // Space lifts the card for keyboard DnD.
    if ( e.key === ' ' ) {
      e.preventDefault();
      onKeyDnd( e );
      return;
    }
  }

  const classNames = [
    'card',
    isDragging  && 'card--dragging',
    isLifted    && 'card--lifted',
  ].filter( Boolean ).join( ' ' );

  return (
    <div
      className={ classNames }
      onClick={ () => { if ( ! isLifted ) onEdit( card ); } }
      draggable
      role="button"
      tabIndex={ 0 }
      aria-grabbed={ isLifted }
      aria-label={ `${ card.title }${ isLifted ? ' (lifted — use arrow keys to move, Space to drop, Escape to cancel)' : '' }` }
      onKeyDown={ handleKeyDown }
    >
      { hasLabel && (
        <div
          className="card__label-bar"
          style={ { background: LABEL_COLORS[ card.label ] } }
        />
      ) }

      <p className="card__title">{ card.title }</p>

      { card.description && (
        <p className="card__desc">{ card.description }</p>
      ) }

      { formatted && (
        <span className={ `card__due${ overdue ? ' card__due--overdue' : '' }` }>
          { overdue ? '⚠ ' : '📅 ' }{ formatted }
        </span>
      ) }
    </div>
  );
}
