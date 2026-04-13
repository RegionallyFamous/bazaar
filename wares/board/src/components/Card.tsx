import type { Card as CardType } from '../types.ts';
import { LABEL_COLORS }          from '../types.ts';

interface Props {
  card:       CardType;
  onEdit:     ( card: CardType ) => void;
  isDragging: boolean;
}

export default function Card( { card, onEdit, isDragging }: Props ) {
  // Parse as local midnight so the overdue check is consistent with the display date.
  const overdue = card.dueDate && new Date( card.dueDate + 'T00:00:00' ) < new Date();
  const hasLabel = card.label !== 'none';

  const formatted = card.dueDate
    ? new Date( card.dueDate + 'T00:00:00' ).toLocaleDateString( undefined, {
        month: 'short', day: 'numeric',
      } )
    : null;

  return (
    <div
      className={ `card${ isDragging ? ' card--dragging' : '' }` }
      onClick={ () => onEdit( card ) }
      draggable
      role="button"
      tabIndex={ 0 }
      onKeyDown={ e => { if ( e.key === 'Enter' || e.key === ' ' ) { e.preventDefault(); onEdit( card ); } } }
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
